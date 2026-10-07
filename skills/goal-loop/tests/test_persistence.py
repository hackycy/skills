from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from support import CTL, Fixture, contract, plan
from engine.common import GoalError
from engine.service import Service
from engine.storage import lock


class RevisionTests(Fixture):
    def test_source_path_change_can_be_equivalent(self):
        value = contract(kinds="D")
        repo, effort, service = self.make(value)
        self.passed(service, "D1")
        (repo / "docs/moved.md").write_text("same accepted decision", encoding="utf-8")
        value["sources"][0]["path"] = "docs/moved.md"
        value["coverage"][0]["source"] = "docs/moved.md"
        self.revise(service, self.candidate(effort, value), "equivalent")
        self.assertEqual(service.status()["checks"]["D1"]["status"], "pass")

    def test_drift_allows_recording_a_stale_manual_reply_and_cancellation(self):
        repo, _, service = self.make(contract(kinds="M"))
        start = service.start(0, "M1", "build")
        (repo / "docs/decision.md").write_text("changed", encoding="utf-8")
        result = service.finish(1, start["attempt"], "pass", "accepted original contract")
        self.assertEqual(result["status"], "stale")

    def test_plan_installation_can_recover_after_commit(self):
        value = contract(kinds="D")
        _, effort, service = self.make(value)
        original = (effort / "implementation-plan.md").read_bytes()
        value["gates"][0]["scope"] = "changed scope"
        candidate = self.candidate(effort, value)
        preview = service.revise(candidate, "revalidate", "reviewed")
        def fault(stage):
            if stage == "after-publish":
                raise RuntimeError("interrupted before plan installation")
        with self.assertRaises(RuntimeError):
            Service(effort, fault=fault).revise(candidate, "revalidate", "reviewed", expected=0, preview=preview["preview_digest"])
        self.assertEqual((effort / "implementation-plan.md").read_bytes(), original)
        service.recover(1)
        self.assertEqual((effort / "implementation-plan.md").read_bytes(), candidate.read_bytes())
        self.assertTrue(service.validate()["valid"])

    def test_earlier_revalidation_and_passed_evidence_stays_historical(self):
        value = contract(gates=2, kinds="D")
        repo, effort, service = self.make(value)
        self.complete(service)
        (repo / "src/app.txt").write_text("modified by G1", encoding="utf-8")
        self.assertTrue(service.validate()["valid"])
        value["gates"][1]["objective"] = "changed objective"
        self.revise(service, self.candidate(effort, value), from_gate="G0")
        self.assertEqual(service.status()["gate"], "G0")

    def test_equivalent_source_edit_retains_evidence(self):
        repo, effort, service = self.make(contract(kinds="D"))
        self.passed(service, "D1")
        (repo / "docs/decision.md").write_text("accepted with spelling correction", encoding="utf-8")
        with self.assertRaises(GoalError):
            service.pass_gate(2)
        self.revise(service, effort / "implementation-plan.md", "equivalent")
        self.assertEqual(service.status()["checks"]["D1"]["status"], "pass")
        service.pass_gate(3)

    def test_completed_effort_reopens_affected_suffix(self):
        value = contract(gates=2, kinds="D")
        _, effort, service = self.make(value)
        self.complete(service)
        self.complete(service)
        value["gates"][1]["objective"] = "observe revised behavior"
        self.revise(service, self.candidate(effort, value))
        state = service.store.load()
        self.assertEqual(state.active().gate_id, "G1")
        self.assertEqual(state.runs[state.current[0]].id, "GR000001")
        self.assertEqual(state.runs["GR000002"].status, "passed")
        self.assertTrue(state.runs["GR000002"].superseded)
        self.assertEqual(service.status()["checks"]["D1"]["status"], "missing")
        self.assertTrue(service.validate()["valid"])

    def test_global_change_reopens_g0_and_supersedes_manual_wait(self):
        value = contract(kinds="M")
        _, effort, service = self.make(value)
        start = service.start(0, "M1", "build")
        value["rules"].append("additional compatibility rule")
        self.revise(service, self.candidate(effort, value))
        self.assertEqual(service.store.load().attempts[start["attempt"]].status, "cancelled")
        self.assertIsNone(service.status()["pending"])

    def test_preview_binds_candidate_reason_sources_and_revision(self):
        value = contract(kinds="D")
        repo, effort, service = self.make(value)
        value["gates"][0]["scope"] = "expanded marker"
        candidate = self.candidate(effort, value)
        before = {p: p.read_bytes() for p in (effort / "goal").rglob("*") if p.is_file()}
        preview = service.revise(candidate, "revalidate", "reviewed")
        self.assertEqual(before, {p: p.read_bytes() for p in (effort / "goal").rglob("*") if p.is_file()})
        (repo / "docs/decision.md").write_text("another change", encoding="utf-8")
        with self.assertRaisesRegex(GoalError, "preview is stale"):
            service.revise(candidate, "revalidate", "reviewed", expected=0, preview=preview["preview_digest"])

    def test_equivalent_rejects_behavior_changes_and_cannot_skip_impact(self):
        value = contract(gates=2, kinds="D")
        _, effort, service = self.make(value)
        value["gates"][0]["scope"] = "changed"
        candidate = self.candidate(effort, value)
        with self.assertRaises(GoalError):
            service.revise(candidate, "equivalent", "not equivalent")
        with self.assertRaises(GoalError):
            service.revise(candidate, "revalidate", "skip", from_gate="G1")

    def test_revoke_passed_evidence_reopens_dependent_gates(self):
        _, _, service = self.make(contract(gates=2, kinds="D"))
        self.complete(service)
        service.mutate(service.status()["revision"], {"type": "corrected", "commit": 2, "attempt_id": "A000001", "reason": "inspection was incorrect"}, allow_drift=True)
        state = service.store.load()
        self.assertEqual(state.active().gate_id, "G0")
        self.assertTrue(state.attempts["A000001"].revoked)
        self.assertEqual(state.runs["GR000001"].status, "passed")

    def test_repeated_correction_cannot_restore_revoked_evidence(self):
        _, _, service = self.make(contract(kinds="D"))
        self.passed(service, "D1")
        service.mutate(2, {"type": "corrected", "commit": 2, "attempt_id": "A000001", "reason": "incomplete inspection"}, allow_drift=True)
        service.mutate(3, {"type": "corrected", "commit": 3, "reason": "clarified the prior correction"}, allow_drift=True)
        self.assertEqual(service.status()["checks"]["D1"]["status"], "revoked")
        with self.assertRaises(GoalError):
            service.pass_gate(4)
        self.passed(service, "D1")
        service.pass_gate(6)

    def test_plan_recovery_preserves_unrelated_working_edit(self):
        value = contract(kinds="D")
        _, effort, service = self.make(value)
        value["gates"][0]["scope"] = "scope approved by decision"
        candidate = self.candidate(effort, value)
        preview = service.revise(candidate, "revalidate", "reviewed")
        def fault(stage):
            if stage == "after-publish":
                raise RuntimeError("interrupted")
        with self.assertRaises(RuntimeError):
            Service(effort, fault=fault).revise(candidate, "revalidate", "reviewed", expected=0, preview=preview["preview_digest"])
        working = effort / "implementation-plan.md"
        working.write_text("unrelated edit after interruption", encoding="utf-8")
        service.recover(1)
        self.assertEqual(working.read_text(), "unrelated edit after interruption")
        self.assertTrue(service.status()["contract_drift"])

    def test_equivalent_revision_preserves_pending_subject_and_snapshot(self):
        repo, effort, service = self.make(contract(kinds="M"))
        start = service.start(0, "M1", "specific build")
        before = service.store.load().attempts[start["attempt"]].snapshot
        (repo / "docs/decision.md").write_text("editorial clarification", encoding="utf-8")
        self.revise(service, effort / "implementation-plan.md", "equivalent")
        self.assertEqual(service.status()["pending"]["subject"], "specific build")
        self.assertEqual(service.status()["pending"]["snapshot"], before)
        self.assertEqual(service.finish(2, start["attempt"], "pass", "accepted build")["status"], "pass")


class PersistenceTests(Fixture):
    def test_cancelled_runner_output_is_recovered_without_changing_cancellation(self):
        _, _, service = self.make(contract(kinds="R"))
        service.start(0, "R1", "repository command", owner="terminated-owner")
        spool = service.store.root / "spool/A000001"
        spool.mkdir(parents=True)
        (spool / "stdout.log").write_bytes(b"observed before cancellation")
        service.cancel(1, "A000001", "cancel requested")
        result = service.recover(2)
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(service.store.get(result["output"]["stdout"]), b"observed before cancellation")
        self.assertEqual(service.status()["satisfied_exits"], [])

    def test_bootstrap_publication_failure_is_restartable_without_overwrite(self):
        for stage in ("objects-written", "before-publish", "after-publish"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as temporary:
                repo = Path(temporary).resolve()
                (repo / ".git").mkdir()
                (repo / "docs").mkdir()
                (repo / "docs/decision.md").write_text("accepted", encoding="utf-8")
                effort = repo / "effort"
                effort.mkdir()
                (effort / "implementation-plan.md").write_text(plan(contract()), encoding="utf-8")
                def fault(current):
                    if current == stage:
                        raise RuntimeError("initialization interrupted")
                with self.assertRaises(RuntimeError):
                    Service(effort, fault=fault).bootstrap()
                service = Service(effort)
                if stage == "after-publish":
                    service.recover(0)
                else:
                    self.assertFalse((effort / "goal").exists())
                    service.bootstrap()
                self.assertTrue(service.validate()["valid"])

    def test_incompatible_directory_and_protocol_are_rejected(self):
        _, effort, service = self.make()
        before = {path: path.read_bytes() for path in (effort / "goal").rglob("*") if path.is_file()}
        with self.assertRaises(GoalError):
            service.bootstrap()
        self.assertEqual(before, {path: path.read_bytes() for path in (effort / "goal").rglob("*") if path.is_file()})
        # Unknown commit protocol, even with a valid checksum, is not interpreted.
        from engine.common import canonical, decode, digest
        path = effort / "goal/commits/00000000.json"
        record = decode(path.read_bytes())
        record.pop("hash")
        record["format_version"] = 42
        record["hash"] = digest(canonical(record))
        path.write_bytes(canonical(record))
        with self.assertRaisesRegex(GoalError, "unsupported commit format"):
            service.status()

    def test_rebuild_views_and_frozen_prompt(self):
        _, effort, service = self.make(contract(kinds="D"))
        original = (effort / "goal/prompt.md").read_bytes()
        template = effort / "different-template.md"
        template.write_text("different installed prompt", encoding="utf-8")
        other = Service(effort, template=template)
        self.assertTrue(other.validate()["valid"])
        (effort / "goal/runbook.md").write_text("edited projection", encoding="utf-8")
        (effort / "goal/state.json").unlink()
        self.assertFalse(service.validate()["valid"])
        other.recover(0)
        self.assertTrue(service.validate()["valid"])
        self.assertEqual((effort / "goal/prompt.md").read_bytes(), original)

    def test_object_tampering_and_missing_commits_fail_closed(self):
        _, _, service = self.make(contract(kinds="D"))
        self.passed(service, "D1")
        ref = service.store.load().attempts["A000001"].snapshot
        service.store.object_path(ref).write_bytes(b"changed")
        with self.assertRaises(GoalError):
            service.status()
        _, _, service = self.make(contract(kinds="D"))
        self.passed(service, "D1")
        (service.store.root / "commits/00000001.json").unlink()
        with self.assertRaises(GoalError):
            service.recover(2)

    def test_stale_revision_cannot_write(self):
        _, _, service = self.make(contract(kinds="D"))
        service.start(0, "D1", "inspection")
        with self.assertRaisesRegex(GoalError, "stale Revision"):
            service.cancel(0, "A000001", "stale caller")

    def test_publication_faults_have_only_complete_or_uncommitted_results(self):
        for stage in ("objects-written", "before-publish", "after-publish", "before-views", "after-views"):
            with self.subTest(stage=stage):
                _, effort, service = self.make(contract(kinds="D"))
                def fault(current):
                    if current == stage:
                        raise RuntimeError("simulated host interruption")
                interrupted = Service(effort, fault=fault)
                with self.assertRaises(RuntimeError):
                    interrupted.start(0, "D1", "inspection")
                committed = stage in {"after-publish", "before-views", "after-views"}
                self.assertEqual(service.store.load().revision, 1 if committed else 0)
                service.recover(1 if committed else 0)
                self.assertTrue(service.validate()["valid"])

    def test_orphaned_repository_attempt_is_interrupted_without_rerunning(self):
        repo, _, service = self.make(contract(kinds="R"))
        service.start(0, "R1", "repository command", owner="terminated-owner")
        result = service.recover(1)
        self.assertEqual(result["status"], "interrupted")
        self.assertEqual((repo / "src/app.txt").read_text(), "ok")

    def test_cross_process_lock_and_same_revision(self):
        _, effort, service = self.make(contract(kinds="D"))
        command = [sys.executable, "-B", str(CTL), "check", "start", str(effort), "--check", "D1", "--subject", "inspection", "--expected-revision", "0"]
        with lock(service.store.lock_path):
            proc = subprocess.run(command, capture_output=True)
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn(b"lock is held", proc.stderr)
        processes = [subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(2)]
        for proc in processes:
            proc.communicate(timeout=10)
        self.assertEqual(sorted(proc.returncode for proc in processes), [0, 1])
        self.assertEqual(service.store.load().revision, 1)

    def test_bootstrap_refuses_existing_artifacts(self):
        _, _, service = self.make()
        with self.assertRaises(GoalError):
            service.bootstrap()
