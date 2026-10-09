from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
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
    def make_repo(self, *, two_gates: bool = False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        repo = Path(temp.name)
        (repo / ".git").mkdir()
        (repo / "docs").mkdir()
        (repo / "docs" / "decision.md").write_text("accepted\n", encoding="utf-8")
        (repo / "src").mkdir()
        (repo / "src" / "app.txt").write_text("ok\n", encoding="utf-8")
        effort = repo / "effort"
        effort.mkdir()
        (effort / "implementation-plan.md").write_text(plan_text(two_gates), encoding="utf-8")
        result = self.ctl("bootstrap", effort, "--at", "2026-10-09")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return repo, effort

    def ctl(self, command: str, effort: Path, *args: str):
        if command == "check":
            args = (*args,)
            argv = [sys.executable, str(CTL), command, *(args[:1]), str(effort), *args[1:]]
        else:
            argv = [sys.executable, str(CTL), command, str(effort), *args]
        return subprocess.run(argv, capture_output=True, text=True, check=False)

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
        self.assertEqual(files, {"goal/contract-baseline.json", "goal/runbook.md", "goal/prompt.md", "goal/history/G0.md"})
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
        for index in range(100):
            result = self.ctl("record", effort, "--expected-revision", str(index), "--kind", "checkpoint", "--slice", f"S{index}", "--result", "stable", "--next-action", "continue", "--last-completed-slice", f"S{index}", "--current-slice", "next")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        runbook = effort / "goal" / "runbook.md"
        self.assertLess(runbook.stat().st_size, 7000)
        self.assertIn("S99", runbook.read_text(encoding="utf-8"))
        self.assertEqual(len(list((effort / "goal" / "history").glob("G*.md"))), 1)

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
        result = subprocess.run([sys.executable, str(VALIDATOR), str(effort)], capture_output=True, text=True, check=False)
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
