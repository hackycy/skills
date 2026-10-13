from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CTL = ROOT / "scripts" / "goal_loop_ctl.py"
VALIDATOR = ROOT / "scripts" / "validate_goal_loop.py"
spec = importlib.util.spec_from_file_location("validate_goal_loop", ROOT / "scripts" / "validate_goal_loop.py")
v = importlib.util.module_from_spec(spec)
assert spec.loader
sys.modules[spec.name] = v
spec.loader.exec_module(v)

PLAN = '''# Demo Implementation Plan

## Contract Sources

| Path | Role |
| --- | --- |
| `docs/decision.md` | accepted behavior |

## Source Decisions

- behavior accepted in docs/decision.md

## Outcome

The repository exposes the accepted behavior.

## Non-Negotiable Rules

- preserve the public behavior

## Gate Overview

| Gate | Name | Unlock condition | Outcome |
| --- | --- | --- | --- |
| G0 | Prepare | start | prepared |
{extra_overview}

## G0: Prepare

### Purpose

Prepare the behavior.

### Inputs

- `src/app.txt`

### Objective

Verify the behavior.

### Scope boundary

Only `src/app.txt` changes.

### Constraints

- preserve the public behavior

### Slice policy

One behavior per slice.

### Verification

#### Directed

| ID | Check | Evidence inputs |
| --- | --- | --- |
| D1 | inspect the marker | `src/app.txt` |

#### Repository

| ID | Command | Evidence inputs |
| --- | --- | --- |
| R1 | `python -c "from pathlib import Path; assert Path('src/app.txt').read_text() == 'ok\\n'"` | `src/app.txt` |

#### Manual acceptance

| ID | Scenario | Evidence inputs |
| --- | --- | --- |
| M1 | user confirms the behavior | `src/app.txt` |

### Evidence rule

| Exit | Required checks |
| --- | --- |
| E1 | D1, R1 |
| E2 | M1 |

### Stop conditions

- `SC1`: required dependency unavailable

### Exit conditions

- `E1`: directed and repository checks pass
- `E2`: manual acceptance passes
{extra_gate}

## Definition Of Done

- all exits pass

## Explicitly Out Of Scope

- unrelated changes
'''


def plan_text(two_gates: bool = False) -> str:
    if not two_gates:
        return PLAN.format(extra_overview="", extra_gate="")
    return PLAN.format(extra_overview="| G1 | Finish | G0 exits pass | finished |", extra_gate='''

## G1: Finish

### Purpose

Finish the behavior.

### Inputs

- `src/app.txt`

### Objective

Run the final check.

### Scope boundary

Only `src/app.txt` is inspected.

### Constraints

- preserve the public behavior

### Slice policy

One verification slice.

### Verification

#### Directed

无

#### Repository

| ID | Command | Evidence inputs |
| --- | --- | --- |
| R1 | `python -c "from pathlib import Path; assert Path('src/app.txt').exists()"` | `src/app.txt` |

#### Manual acceptance

无

### Evidence rule

| Exit | Required checks |
| --- | --- |
| E1 | R1 |

### Stop conditions

无

### Exit conditions

- `E1`: final check passes
''')


class GoalLoopTests(unittest.TestCase):
    def make_repo(self, *, two_gates: bool = False, plan: str | None = None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        repo = Path(temp.name)
        (repo / ".git").mkdir()
        (repo / "docs").mkdir()
        (repo / "docs" / "decision.md").write_text("accepted\n", encoding="utf-8")
        (repo / "src").mkdir()
        (repo / "src" / "app.txt").write_text("ok\n", encoding="utf-8")
        effort = repo / "effort with spaces"
        effort.mkdir()
        (effort / "implementation-plan.md").write_text(plan or plan_text(two_gates), encoding="utf-8")
        result = self.ctl("bootstrap", effort, "--at", "2026-10-09")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return repo, effort

    def ctl(self, command: str, effort: Path, *args: str):
        if command == "check":
            args = (*args,)
            argv = [sys.executable, str(CTL), command, *(args[:1]), str(effort), *args[1:]]
        else:
            argv = [sys.executable, str(CTL), command, str(effort), *args]
        return subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", check=False)

    def test_saved_prompt_entry_runs_from_repo_without_skill_discovery(self):
        repo, effort = self.make_repo()
        prompt = (effort / "goal/prompt.md").read_text(encoding="utf-8")
        commands = re.findall(r"^python[^\n]+ context [^\n]+$", prompt, re.MULTILINE)
        self.assertEqual(len(commands), 1, "saved prompt must contain one executable startup command")
        argv = shlex.split(commands[0])
        argv[0] = sys.executable
        result = subprocess.run(argv, cwd=repo, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Revision: 0", result.stdout)
        self.assertIn("State: active", result.stdout)
        self.assertTrue((effort / "goal/validate_goal_loop.py").is_file())

    def test_context_handles_non_gbk_contract_in_a_gbk_environment(self):
        _, effort = self.make_repo(plan=plan_text().replace("Prepare the behavior.", "检查 façade 与 🚀。"))
        result = subprocess.run([sys.executable, str(CTL), "context", str(effort)],
                                env={**os.environ, "PYTHONIOENCODING": "gbk"}, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace"))
        self.assertIn("检查 façade 与 🚀。", result.stdout.decode("utf-8"))

    def test_large_context_is_bounded_and_can_be_read_completely(self):
        detail = "contract detail 中文 🚀 " * 3000 + "CONTRACT_END"
        _, effort = self.make_repo(plan=plan_text().replace("Prepare the behavior.", detail))
        result = self.ctl("context", effort)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertLessEqual(len(result.stdout.encode("utf-8")), 17000)
        pages = [result.stdout]
        while match := re.search(r"Next page: context --offset (\d+)", pages[-1]):
            self.assertLess(len(pages), 100)
            result = self.ctl("context", effort, "--offset", match[1])
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertLessEqual(len(result.stdout.encode("utf-8")), 17000)
            pages.append(result.stdout)
        # Only framing is removed: the full contract must survive pagination.
        payload = "".join(page.split("--- context ---\n", 1)[1].rsplit("\n--- end context ---", 1)[0] for page in pages)
        self.assertIn(detail, payload)
        self.assertIn("preserve the public behavior", payload)
        self.assertNotIn("G0-E0001 · initialized", payload)

    def test_context_reports_stale_checks_without_history_replay(self):
        repo, effort = self.make_repo()
        self.complete_g0(effort)
        repo.joinpath("src/app.txt").write_text("changed\n", encoding="utf-8")
        result = self.ctl("context", effort)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("D1: stale", result.stdout)
        self.assertIn("Revision: 5", result.stdout)
        self.assertNotIn("Evidence fingerprint:", result.stdout)

    def test_context_stops_on_pending_transaction_and_baseline_drift(self):
        repo, effort = self.make_repo()
        journal = effort / "goal/.goal-loop-transaction.json"
        journal.write_text("{}", encoding="utf-8")
        result = self.ctl("context", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("run recover", result.stdout)
        self.assertNotIn("Current Gate contract:", result.stdout)
        journal.unlink()
        repo.joinpath("docs/decision.md").write_text("changed\n", encoding="utf-8")
        result = self.ctl("context", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("drift", result.stdout)
        self.assertNotIn("Current Gate contract:", result.stdout)

    def test_v2_runtime_is_accepted_without_rewriting_or_installing_files(self):
        _, effort = self.make_repo()
        prompt = effort / "goal/prompt.md"
        original = (ROOT / "tests/fixtures/prompt-v2.md").read_bytes()
        prompt.write_bytes(original.replace(b"{{EFFORT_PATH}}", b"effort with spaces"))
        for name in ("goal_loop_ctl.py", "validate_goal_loop.py"):
            (effort / "goal" / name).unlink()
        before = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
        result = self.ctl("context", effort)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(before, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})
        result = self.ctl("record", effort, "--expected-revision", "0", "--kind", "slice",
                          "--result", "stable", "--next-action", "continue")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(prompt.read_bytes(), before[prompt])
        self.assertFalse((effort / "goal/goal_loop_ctl.py").exists())

    def prepare_v2(self, effort: Path, *, with_scripts: bool = False):
        goal = effort / "goal"
        original = (ROOT / "tests/fixtures/prompt-v2.md").read_bytes()
        (goal / "prompt.md").write_bytes(original.replace(b"{{EFFORT_PATH}}", effort.name.encode()))
        for name in ("goal_loop_ctl.py", "validate_goal_loop.py"):
            if with_scripts:
                (goal / name).write_bytes(b"# existing v2 script\n")
            else:
                (goal / name).unlink()
        return {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}

    def test_upgrade_preserves_progress_and_runs_saved_entry(self):
        for with_scripts in (False, True):
            with self.subTest(with_scripts=with_scripts):
                repo, effort = self.make_repo(two_gates=True)
                self.complete_g0(effort)
                self.assertEqual(self.ctl("pass-gate", effort, "--expected-revision", "5").returncode, 0)
                before = self.prepare_v2(effort, with_scripts=with_scripts)
                result = self.ctl("upgrade", effort, "--expected-revision", "6")
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                changed = {effort / "goal" / n for n in ("prompt.md", "goal_loop_ctl.py", "validate_goal_loop.py")}
                for path, data in before.items():
                    self.assertEqual((effort / "goal/backup-v2" / path.name).read_bytes() if path in changed else path.read_bytes(), data)
                self.assertEqual(self.revision(effort), 6)
                prompt = (effort / "goal/prompt.md").read_text(encoding="utf-8")
                self.assertIn("goal-loop/prompt-v3", prompt)
                command = re.findall(r"^python[^\n]+ context [^\n]+$", prompt, re.MULTILINE)[0]
                argv = shlex.split(command)
                argv[0] = sys.executable
                context = subprocess.run(argv, cwd=repo, capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(context.returncode, 0, context.stdout + context.stderr)
                self.assertIn("Gate: G1: Finish", context.stdout)
                after = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
                repeated = self.ctl("upgrade", effort, "--expected-revision", "6")
                self.assertEqual(repeated.returncode, 0, repeated.stdout + repeated.stderr)
                self.assertEqual(after, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})

    def test_upgrade_rejects_stale_revision_drift_transaction_and_backup_conflict(self):
        for problem in ("revision", "drift", "transaction", "backup"):
            with self.subTest(problem=problem):
                repo, effort = self.make_repo()
                self.prepare_v2(effort)
                if problem == "drift":
                    (repo / "docs/decision.md").write_text("changed", encoding="utf-8")
                elif problem == "transaction":
                    (effort / "goal/.goal-loop-transaction.json").write_text("{}", encoding="utf-8")
                elif problem == "backup":
                    (effort / "goal/backup-v2").mkdir()
                    (effort / "goal/backup-v2/prompt.md").write_text("retained", encoding="utf-8")
                before = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
                result = self.ctl("upgrade", effort, "--expected-revision", "1" if problem == "revision" else "0")
                self.assertNotEqual(result.returncode, 0)
                expected = {"revision": "stale Revision", "drift": "drift", "transaction": "run recover", "backup": "backup-v2 already exists"}
                self.assertIn(expected[problem], result.stdout + result.stderr)
                self.assertEqual(before, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})

    def test_upgrade_preserves_blocked_pending_and_complete_states(self):
        for state in ("blocked", "pending", "complete"):
            with self.subTest(state=state):
                _, effort = self.make_repo()
                if state == "blocked":
                    result = self.ctl("block", effort, "--expected-revision", "0", "--condition", "SC1", "--next-action", "restore")
                elif state == "pending":
                    result = self.ctl("check", effort, "start", "--expected-revision", "0", "--kind", "Manual acceptance", "--check", "M1", "--result", "ready", "--next-action", "wait")
                else:
                    self.complete_g0(effort)
                    result = self.ctl("pass-gate", effort, "--expected-revision", "5")
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                before = self.prepare_v2(effort)
                result = self.ctl("upgrade", effort, "--expected-revision", str(self.revision(effort)))
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                for path, data in before.items():
                    if path.name != "prompt.md":
                        self.assertEqual(path.read_bytes(), data)

    def test_bundled_runtime_records_multiple_slices_with_the_same_prompt(self):
        repo, effort = self.make_repo()
        prompt = (effort / "goal/prompt.md").read_bytes()
        entry = effort / "goal/goal_loop_ctl.py"
        for index in range(2):
            result = subprocess.run([sys.executable, str(entry), "record", str(effort),
                                     "--expected-revision", str(index), "--kind", "slice",
                                     "--last-completed-slice", f"S{index + 1}",
                                     "--result", "stable", "--next-action", "continue"],
                                    cwd=repo, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn(f"Revision {index + 1}", result.stdout)
        result = subprocess.run([sys.executable, str(entry), "context", str(effort)],
                                cwd=repo, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("State: active", result.stdout)
        self.assertIn("Last completed slice: `S2`", result.stdout)
        self.assertEqual(prompt, (effort / "goal/prompt.md").read_bytes())

    def test_same_saved_entry_resumes_successor_without_passed_history(self):
        repo, effort = self.make_repo(two_gates=True)
        prompt = (effort / "goal/prompt.md").read_text(encoding="utf-8")
        command = re.findall(r"^python[^\n]+ context [^\n]+$", prompt, re.MULTILINE)[0]
        argv = shlex.split(command)
        argv[0] = sys.executable
        self.complete_g0(effort)
        passed = self.ctl("pass-gate", effort, "--expected-revision", "5")
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        result = subprocess.run(argv, cwd=repo, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Gate: G1: Finish", result.stdout)
        self.assertNotIn("Prepare the behavior.", result.stdout)
        self.assertNotIn("G0-E", result.stdout)
        self.assertEqual(prompt, (effort / "goal/prompt.md").read_text(encoding="utf-8"))

    def revision(self, effort: Path) -> int:
        text = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        return int(next(line.split("`")[1] for line in text.splitlines() if line.startswith("Revision:")))

    def complete_g0(self, effort: Path):
        commands = [
            ("check", "start", "--expected-revision", "0", "--kind", "Directed", "--check", "D1", "--result", "inspected", "--next-action", "finish D1"),
            ("check", "finish", "--expected-revision", "1", "--kind", "Directed", "--check", "D1", "--outcome", "pass", "--result", "accepted", "--next-action", "R1"),
            ("check", "run", "--expected-revision", "2", "--check", "R1", "--next-action", "M1"),
            ("check", "start", "--expected-revision", "3", "--kind", "Manual acceptance", "--check", "M1", "--result", "ready", "--next-action", "wait"),
            ("check", "finish", "--expected-revision", "4", "--kind", "Manual acceptance", "--check", "M1", "--acceptance", "G0-M1", "--outcome", "pass", "--result", "accepted", "--next-action", "pass Gate"),
        ]
        for command in commands:
            result = self.ctl(command[0], effort, command[1], *command[2:])
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_bootstrap_has_only_fixed_control_files(self):
        _, effort = self.make_repo()
        files = {path.relative_to(effort).as_posix() for path in (effort / "goal").rglob("*") if path.is_file() and not path.name.startswith(".")}
        self.assertEqual(files, {"goal/contract-baseline.json", "goal/runbook.md", "goal/prompt.md", "goal/history/G0.md", "goal/goal_loop_ctl.py", "goal/validate_goal_loop.py"})
        for name in ("commits", "objects", "spool", "state.json", "evidence"):
            self.assertFalse((effort / "goal" / name).exists())
        self.assertEqual(v.validate(effort), [])

    def test_old_runtime_is_rejected(self):
        _, effort = self.make_repo()
        (effort / "goal" / "objects").mkdir()
        result = self.ctl("status", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unsupported legacy", result.stdout)

    def test_checkpoint_is_replaced_after_one_hundred_slices(self):
        _, effort = self.make_repo()
        initial_context = self.ctl("context", effort).stdout
        for index in range(100):
            result = self.ctl("record", effort, "--expected-revision", str(index), "--kind", "checkpoint", "--slice", f"S{index}", "--result", "stable", "--next-action", "continue", "--last-completed-slice", f"S{index}", "--current-slice", "next")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        runbook = effort / "goal" / "runbook.md"
        self.assertLess(runbook.stat().st_size, 7000)
        self.assertIn("S99", runbook.read_text(encoding="utf-8"))
        self.assertEqual(len(list((effort / "goal" / "history").glob("G*.md"))), 1)
        current_context = self.ctl("context", effort).stdout
        self.assertLess(len(current_context), len(initial_context) + 100)
        self.assertNotIn("G0-E0002 · checkpoint", current_context)

    def test_directed_repository_and_manual_checks(self):
        _, effort = self.make_repo()
        self.complete_g0(effort)
        text = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("Satisfied exits: `all`", text)
        self.assertFalse(any(path.is_file() for path in (effort / "goal").rglob("evidence/*")))

    def test_fingerprint_change_rejects_pass_gate(self):
        repo, effort = self.make_repo()
        self.ctl("check", effort, "start", "--expected-revision", "0", "--kind", "Directed", "--check", "D1", "--result", "ok", "--next-action", "finish D1")
        self.ctl("check", effort, "finish", "--expected-revision", "1", "--kind", "Directed", "--check", "D1", "--outcome", "pass", "--result", "ok", "--next-action", "R1")
        self.ctl("check", effort, "run", "--expected-revision", "2", "--check", "R1", "--next-action", "M1")
        repo.joinpath("src/app.txt").write_text("changed\n", encoding="utf-8")
        result = self.ctl("pass-gate", effort, "--expected-revision", "3")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("stale", (result.stdout + result.stderr).lower())

    def test_manual_handoff_does_not_change_gate_state_and_blocks_pass(self):
        _, effort = self.make_repo()
        result = self.ctl("check", effort, "start", "--expected-revision", "0", "--kind", "Manual acceptance", "--check", "M1", "--result", "ready", "--next-action", "wait")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Acceptance: G0-M1", result.stdout)
        self.assertIn("| G0: Prepare | active |", (effort / "goal" / "runbook.md").read_text(encoding="utf-8"))
        self.assertNotEqual(self.ctl("pass-gate", effort, "--expected-revision", "1").returncode, 0)

    def test_block_resume_and_only_direct_successor(self):
        _, effort = self.make_repo(two_gates=True)
        self.assertEqual(self.ctl("block", effort, "--expected-revision", "0", "--condition", "SC1", "--next-action", "restore").returncode, 0)
        self.assertEqual(self.ctl("resume", effort, "--expected-revision", "1", "--result", "restored", "--next-action", "continue").returncode, 0)
        text = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("| G1: Finish | planned |", text)

    def test_gate_pass_reports_effort_complete(self):
        _, effort = self.make_repo()
        self.complete_g0(effort)
        result = self.ctl("pass-gate", effort, "--expected-revision", "5")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Gate: `none`", (effort / "goal" / "runbook.md").read_text(encoding="utf-8"))
        context = self.ctl("context", effort)
        self.assertEqual(context.returncode, 0)
        self.assertIn("State: complete", context.stdout)
        self.assertIn("Effort complete", context.stdout)

    def test_recover_finishes_control_transaction(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        before = runbook.read_bytes()
        after = before.replace(b"Revision: `0`", b"Revision: `1`")
        journal = {"schema": v.TRANSACTION_SCHEMA, "operation": "test", "files": [{"path": "goal/runbook.md", "before_exists": True, "before_sha256": hashlib.sha256(before).hexdigest(), "after_sha256": hashlib.sha256(after).hexdigest(), "before_b64": base64.b64encode(before).decode(), "after_b64": base64.b64encode(after).decode()}]}
        (effort / "goal" / ".goal-loop-transaction.json").write_text(json.dumps(journal), encoding="utf-8")
        result = self.ctl("recover", effort)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((effort / "goal" / ".goal-loop-transaction.json").exists())

    def test_cli_validator_and_prompt_are_current(self):
        _, effort = self.make_repo()
        result = subprocess.run([sys.executable, str(VALIDATOR), str(effort)], capture_output=True, text=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        prompt = (effort / "goal" / "prompt.md").read_text(encoding="utf-8").lower()
        self.assertIn("不创建、修改或回滚 git commit", prompt)
        self.assertNotIn("goal/evidence", prompt)

    def test_contract_revision_preview_and_revalidate(self):
        repo, effort = self.make_repo()
        candidate = repo / "candidate-plan.md"
        candidate.write_text(plan_text(), encoding="utf-8")
        preview = self.ctl("revise-contract", effort, "--plan", str(candidate), "--mode", "revalidate", "--reason", "accepted clarification")
        self.assertEqual(preview.returncode, 0, preview.stdout + preview.stderr)
        proposal = json.loads(preview.stdout)
        committed = self.ctl("revise-contract", effort, "--plan", str(candidate), "--mode", "revalidate", "--reason", "accepted clarification", "--preview-digest", proposal["digest"], "--expected-revision", "0")
        self.assertEqual(committed.returncode, 0, committed.stdout + committed.stderr)
        self.assertEqual(v.validate(effort), [])


if __name__ == "__main__":
    unittest.main()
