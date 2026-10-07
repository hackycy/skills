from __future__ import annotations

import os
import subprocess
import sys
import time
import unittest

from support import CTL, Fixture, contract
from engine.common import GoalError
from engine.storage import Busy


class AttemptTests(Fixture):
    def test_mixed_checks_require_every_exit_and_activate_only_the_successor(self):
        _, _, service = self.make(contract(gates=2, kinds="DRM"))
        self.passed(service, "D1")
        service.run(2, "R1")
        with self.assertRaises(GoalError):
            service.pass_gate(4)
        self.passed(service, "M1")
        result = service.pass_gate(6)
        self.assertEqual(result["next_gate"], "G1")
        self.assertEqual(service.status()["checks"]["M1"]["status"], "missing")
        self.complete(service)
        self.assertEqual(service.status()["state"], "complete")
        self.assertTrue(service.validate()["valid"])

    def test_manual_rejection_retry_and_gate_pass(self):
        _, effort, service = self.make(contract(kinds="M"))
        first = self.cli(effort, "check", "start", "--check", "M1", "--subject", "build 1", "--expected-revision", 0)
        self.cli(effort, "check", "finish", "--attempt", first["attempt"], "--outcome", "fail", "--result", "fix interaction", "--expected-revision", 1, expected_code=2)
        second = self.cli(effort, "check", "start", "--check", "M1", "--subject", "build 2", "--expected-revision", 2)
        self.assertNotEqual(first["attempt"], second["attempt"])
        self.cli(effort, "check", "finish", "--attempt", second["attempt"], "--outcome", "pass", "--result", "accepted", "--expected-revision", 3)
        self.cli(effort, "pass-gate", "--expected-revision", 4)
        self.assertEqual(service.status()["state"], "complete")

    def test_handoff_snapshot_is_bound_before_waiting(self):
        repo, _, service = self.make(contract(kinds="M"))
        start = service.start(0, "M1", "build 1")
        (repo / "src/app.txt").write_text("changed", encoding="utf-8")
        result = service.finish(1, start["attempt"], "pass", "accepted build 1")
        self.assertEqual(result["status"], "stale")
        self.assertIsNone(service.status()["pending"])
        self.assertEqual(service.status()["satisfied_exits"], [])
        self.passed(service, "M1")
        service.pass_gate(service.status()["revision"])

    def test_passing_evidence_can_expire_and_be_repeated(self):
        repo, _, service = self.make(contract(kinds="M"))
        self.passed(service, "M1")
        (repo / "src/app.txt").write_text("updated", encoding="utf-8")
        self.assertEqual(service.status()["checks"]["M1"]["status"], "stale")
        with self.assertRaisesRegex(GoalError, "stale"):
            service.pass_gate(2)
        self.passed(service, "M1")
        service.pass_gate(4)

    def test_cancel_never_restores_previous_pass_and_rejects_late_result(self):
        _, _, service = self.make(contract(kinds="D"))
        self.passed(service, "D1")
        start = service.start(2, "D1", "recheck")
        service.cancel(3, start["attempt"], "cancelled")
        with self.assertRaises(GoalError):
            service.finish(4, start["attempt"], "pass", "late response")
        with self.assertRaises(GoalError):
            service.pass_gate(4)
        self.assertEqual(service.status()["checks"]["D1"]["status"], "cancelled")

    def test_wrong_duplicate_and_parallel_attempts_are_rejected(self):
        _, _, service = self.make()
        started = service.start(0, "D1", "inspection")
        with self.assertRaises(GoalError):
            service.start(1, "M1", "inspection")
        with self.assertRaises(GoalError):
            service.finish(1, "A999999", "pass", "wrong")
        service.finish(1, started["attempt"], "pass", "observed")
        with self.assertRaises(GoalError):
            service.finish(2, started["attempt"], "pass", "duplicate")

    def test_directed_result_records_stale_deleted_inputs(self):
        repo, _, service = self.make(contract(kinds="D"))
        started = service.start(0, "D1", "source before inspection")
        (repo / "src/app.txt").unlink()
        self.assertEqual(service.finish(1, started["attempt"], "pass", "observed before deletion")["status"], "stale")

    def test_glob_file_set_changes_invalidate_evidence(self):
        value = contract(kinds="D")
        value["gates"][0]["checks"][0]["evidence_inputs"] = ["src/**"]
        repo, _, service = self.make(value)
        self.passed(service, "D1")
        (repo / "src/another.txt").write_text("additional behavior", encoding="utf-8")
        self.assertEqual(service.status()["checks"]["D1"]["status"], "stale")
        self.assertEqual(service.status()["satisfied_exits"], [])

    def test_environment_checks_expose_limited_freshness(self):
        value = contract(kinds="D")
        value["gates"][0]["checks"][0].update(evidence_inputs=[], environment=True)
        _, _, service = self.make(value)
        self.passed(service, "D1")
        self.assertIn("not fingerprinted", service.status()["checks"]["D1"]["freshness"])

    def test_stop_resume_checkpoint_and_scope_context(self):
        _, _, service = self.make(contract(gates=2, kinds="D"))
        service.mutate(0, {"type": "blocked", "condition": "SC1", "reason": "offline", "next_action": "restore dependency"})
        with self.assertRaises(GoalError):
            service.start(1, "D1", "cannot proceed")
        service.mutate(1, {"type": "resumed", "reason": "online", "next_action": "inspect"})
        service.mutate(2, {"type": "recorded", "kind": "checkpoint", "result": "slice verified", "last_completed_slice": "S1", "next_action": "S2"})
        context = service.status(context=True)
        self.assertEqual(context["checkpoint"]["last_completed_slice"], "S1")
        self.assertEqual(context["gate_contract"]["id"], "G0")
        self.assertIn("rules", context["global_contract"])
        self.assertNotIn("history", context)


class RepositoryTests(Fixture):
    def test_process_tree_is_terminated_on_timeout(self):
        value = contract(kinds="R")
        value["gates"][0]["checks"][0]["timeout_seconds"] = 0.4
        runner = "import subprocess, sys, time\nsubprocess.Popen([sys.executable, 'child.py'])\ntime.sleep(20)\n"
        repo, _, service = self.make(value, runner)
        (repo / "child.py").write_text("from pathlib import Path\nimport time\ntime.sleep(1)\nPath('unexpected-child-output').write_text('alive')\n", encoding="utf-8")
        self.assertEqual(service.run(0, "R1")["status"], "timed-out")
        time.sleep(1.1)
        self.assertFalse((repo / "unexpected-child-output").exists())

    def test_host_exit_leaves_an_interrupted_attempt_with_observed_logs(self):
        repo, effort, service = self.make(contract(kinds="R"), "from pathlib import Path\nimport time\nprint('before host exit', flush=True)\nPath('ready').write_text('ready')\ntime.sleep(0.6)\n")
        proc = subprocess.Popen([sys.executable, "-B", str(CTL), "check", "run", str(effort), "--check", "R1", "--expected-revision", "0"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(lambda: proc.kill() if proc.poll() is None else None)
        deadline = time.monotonic() + 10
        while not (repo / "ready").exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue((repo / "ready").exists())
        proc.kill()
        proc.communicate(timeout=5)
        # POSIX child owns an inherited lifecycle descriptor until it exits.
        deadline = time.monotonic() + 5
        while True:
            try:
                result = service.recover(1)
                break
            except Busy:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.05)
        self.assertEqual(result["status"], "interrupted")
        self.assertIn(b"before host exit", service.store.get(result["output"]["stdout"]))
        self.assertEqual(service.status()["satisfied_exits"], [])

    def test_command_executes_without_shell_and_keeps_output(self):
        _, effort, service = self.make(contract(kinds="R"))
        result = self.cli(effort, "check", "run", "--check", "R1", "--expected-revision", 0)
        self.assertIn(b"passed", service.store.get(result["output"]["stdout"]))
        self.assertEqual(result["revision"], 2)
        service.pass_gate(2)

    def test_repository_input_mutation_cannot_pass(self):
        _, _, service = self.make(contract(kinds="R"), "from pathlib import Path\nPath('src/app.txt').write_text('changed')\n")
        self.assertEqual(service.run(0, "R1")["status"], "stale")
        with self.assertRaises(GoalError):
            service.pass_gate(2)

    def test_failed_command_and_timeout_are_recorded(self):
        _, _, service = self.make(contract(kinds="R"), "import sys\nprint('failure detail', file=sys.stderr)\nsys.exit(3)\n")
        result = service.run(0, "R1")
        self.assertEqual(result["status"], "fail")
        self.assertIn(b"failure detail", service.store.get(result["output"]["stderr"]))
        value = contract(kinds="R")
        value["gates"][0]["checks"][0]["timeout_seconds"] = 0.15
        _, _, service = self.make(value, "import time\ntime.sleep(30)\n")
        self.assertEqual(service.run(0, "R1")["status"], "timed-out")

    def test_missing_executable_records_interruption(self):
        value = contract(kinds="R")
        value["gates"][0]["checks"][0]["argv"] = ["goal-loop-nonexistent-command-123"]
        _, _, service = self.make(value)
        self.assertEqual(service.run(0, "R1")["status"], "interrupted")

    def test_unicode_spaces_and_literal_arguments(self):
        value = contract(kinds="R")
        argument = '空 格; $() & "quote" \\path'
        value["gates"][0]["checks"][0]["argv"] += [argument]
        _, _, service = self.make(value, "import sys\nsys.stdout.reconfigure(encoding='utf-8')\nprint(sys.argv[1])\n")
        result = service.run(0, "R1")
        self.assertIn(argument, service.store.get(result["output"]["stdout"]).decode("utf-8"))

    def test_cancel_running_process_and_preserve_output(self):
        repo, effort, service = self.make(contract(kinds="R"), "from pathlib import Path\nimport time\nprint('started', flush=True)\nPath('ready').write_text('ready')\ntime.sleep(20)\n")
        proc = subprocess.Popen([sys.executable, "-B", str(CTL), "check", "run", str(effort), "--check", "R1", "--expected-revision", "0"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(lambda: proc.kill() if proc.poll() is None else None)
        deadline = time.monotonic() + 10
        while not (repo / "ready").exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue((repo / "ready").exists())
        status = service.status()
        with self.assertRaises(Busy):
            service.recover(status["revision"])
        service.cancel(status["revision"], status["pending"]["id"], "user cancelled")
        out, err = proc.communicate(timeout=10)
        self.assertEqual(proc.returncode, 2, out + err)
        final = service.store.load().attempts[status["pending"]["id"]]
        self.assertEqual(final.status, "cancelled")
        self.assertIn(b"started", service.store.get(final.output["stdout"]))


if __name__ == "__main__":
    unittest.main()
