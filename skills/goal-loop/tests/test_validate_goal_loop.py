from __future__ import annotations

import hashlib
import importlib.util
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "validate_goal_loop", SKILL_ROOT / "scripts" / "validate_goal_loop.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


PLAN = """# Demo Implementation Plan

## Source Decisions

- demo

## Outcome

demo

## Non-Negotiable Rules

- demo

## Gate Overview

| Gate | Name | Unlock condition | Outcome |
| --- | --- | --- | --- |
| G0 | Prepare | 开始 | ready |
| G1 | Finish | G0 Exit 全部满足 | done |

## G0: Prepare

### Purpose
prepare
### Inputs
- src
### Objective
ready
### Scope boundary
small
### Constraints
- none
### Slice policy
one
### Verification
#### Directed
- check
#### Repository
1. `true`
#### Manual acceptance
- 无
### Evidence rule
| Exit | Required evidence |
| --- | --- |
| E1 | verification |
### Stop conditions
- none
### Rollback
revert
### Exit conditions
- `E1`: ready

## G1: Finish

### Purpose
finish
### Inputs
- src
### Objective
done
### Scope boundary
small
### Constraints
- none
### Slice policy
one
### Verification
#### Directed
- check
#### Repository
1. `true`
#### Manual acceptance
- 无
### Evidence rule
| Exit | Required evidence |
| --- | --- |
| E1 | verification |
| E2 | verification |
### Stop conditions
- none
### Rollback
revert
### Exit conditions
- `E1`: done
- `E2`: stable

## Definition Of Done

- done

## Explicitly Out Of Scope

- none
"""


def digest(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()


def history(gate: str, name: str, passed: bool = False) -> str:
    if passed:
        if gate == "G1":
            exit_evidence = f"E1={gate}-E0002; E2={gate}-E0002"
            satisfies = "E1, E2"
        else:
            exit_evidence = f"E1={gate}-E0002"
            satisfies = "E1"
        return f"""# {gate}: {name} History

Schema: `goal-loop/history-v1`
Plan contract: `implementation-plan.md` -> `{gate}: {name}`

## Events

### {gate}-E0001 · initialized

- At: `2026-10-02`
- Type: `initialized`
- Slice: `none`
- Changed: none
- Verification: none
- Result: initialized
- Satisfies: `none`
- Risk: none
- Next: verify

### {gate}-E0002 · verification

- At: `2026-10-02`
- Type: `verification`
- Slice: `S1`
- Changed: none
- Verification: `repo=PASS`
- Result: verified
- Satisfies: `{satisfies}`
- Risk: none
- Next: pass

### {gate}-E0003 · gate-passed

- At: `2026-10-02`
- Type: `gate-passed`
- Slice: `none`
- Changed: none
- Verification: `repo=PASS`
- Result: passed
- Satisfies: `none`
- Exit evidence: `{exit_evidence}`
- Risk: none
- Next: next gate
"""
    return f"""# {gate}: {name} History

Schema: `goal-loop/history-v1`
Plan contract: `implementation-plan.md` -> `{gate}: {name}`

## Events

### {gate}-E0001 · initialized

- At: `2026-10-02`
- Type: `initialized`
- Slice: `none`
- Changed: none
- Verification: none
- Result: initialized
- Satisfies: `none`
- Risk: none
- Next: S1
"""

def runbook(plan_hash: str, statuses=("active", "planned"), last_event="G0-E0001") -> str:
    s0, s1 = statuses
    h0 = "`goal/history/G0.md`" if s0 != "planned" else "—"
    h1 = "`goal/history/G1.md`" if s1 != "planned" else "—"
    u0 = "`goal/history/G0.md@G0-E0003`" if s0 == "passed" else "no predecessor"
    u1 = "`goal/history/G1.md@G1-E0003`" if s1 == "passed" else ("`goal/history/G0.md@G0-E0003`" if s1 == "active" else "G0 pending")
    if s0 in {"active", "blocked"}:
        gate = "G0: Prepare"
        hist = "goal/history/G0.md"
    elif s1 in {"active", "blocked"}:
        gate = "G1: Finish"
        hist = "goal/history/G1.md"
        if last_event == "G0-E0001":
            last_event = "G1-E0001"
    else:
        gate = "none"
        hist = "none"
        last_event = "G1-E0003"
    complete = s0 == "passed" and s1 == "passed"
    last_completed_slice = "none"
    current_slice = "none" if complete else "S1"
    satisfied_exits = "all" if complete else "none"
    next_action = "effort complete" if complete else "continue"
    return f"""# Demo Goal Runbook

Schema: `goal-loop/runbook-v2`

## Source Baseline

| Path | SHA-256 |
| --- | --- |
| `implementation-plan.md` | `{plan_hash}` |

## State Rules

- compact

## Goal Ledger

| Gate | Status | Depends on | Plan contract | History | Unlock evidence |
| --- | --- | --- | --- | --- | --- |
| G0: Prepare | {s0} | none | `implementation-plan.md` -> `G0: Prepare` | {h0} | {u0} |
| G1: Finish | {s1} | G0 | `implementation-plan.md` -> `G1: Finish` | {h1} | {u1} |

## Current Checkpoint

- Gate: `{gate}`
- History: `{hist}`
- Last event: `{last_event}`
- Last completed slice: `{last_completed_slice}`
- Current slice: `{current_slice}`
- Satisfied exits: `{satisfied_exits}`
- Manual acceptance: `none`
- Blocker: `none`
- Risks: none
- Next action: {next_action}
"""



class GoalLoopValidatorTests(unittest.TestCase):
    def make_effort(self, statuses=("active", "planned")) -> Path:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        effort = Path(temp.name)
        (effort / "goal" / "history").mkdir(parents=True)
        (effort / "implementation-plan.md").write_text(PLAN, encoding="utf-8")
        (effort / "goal" / "runbook.md").write_text(
            runbook(digest(PLAN), statuses=statuses), encoding="utf-8"
        )
        if statuses[0] != "planned":
            (effort / "goal" / "history" / "G0.md").write_text(
                history("G0", "Prepare", passed=statuses[0] == "passed"), encoding="utf-8"
            )
        if statuses[1] != "planned":
            (effort / "goal" / "history" / "G1.md").write_text(
                history("G1", "Finish", passed=statuses[1] == "passed"), encoding="utf-8"
            )
        return effort

    def test_valid_active_fixture(self):
        effort = self.make_effort()
        self.assertEqual(MODULE.validate(effort), [])

    def test_multiple_active_is_rejected(self):
        effort = self.make_effort(("active", "active"))
        errors = MODULE.validate(effort)
        self.assertTrue(any("illegal Ledger state shape" in item for item in errors))

    def test_baseline_drift_is_rejected(self):
        effort = self.make_effort()
        (effort / "implementation-plan.md").write_text(PLAN + "\nchanged\n", encoding="utf-8")
        errors = MODULE.validate(effort)
        self.assertTrue(any("drift detected" in item for item in errors))

    def test_passed_gate_requires_all_exit_evidence(self):
        effort = self.make_effort(("passed", "active"))
        path = effort / "goal" / "history" / "G0.md"
        text = path.read_text(encoding="utf-8").replace(
            "- Exit evidence: `E1=G0-E0002`",
            "- Exit evidence: `E2=G0-E0002`",
        )
        path.write_text(text, encoding="utf-8")
        errors = MODULE.validate(effort)
        self.assertTrue(any("gate-passed Exit evidence" in item for item in errors))

    def test_checkpoint_must_match_active_gate(self):
        effort = self.make_effort()
        path = effort / "goal" / "runbook.md"
        text = path.read_text(encoding="utf-8").replace(
            "- Gate: `G0: Prepare`", "- Gate: `G1: Finish`"
        )
        path.write_text(text, encoding="utf-8")
        errors = MODULE.validate(effort)
        self.assertTrue(any("checkpoint Gate" in item for item in errors))


    def test_complete_effort_is_valid(self):
        effort = self.make_effort(("passed", "passed"))
        self.assertEqual(MODULE.validate(effort), [])

    def test_blocked_gate_requires_blocker(self):
        effort = self.make_effort(("blocked", "planned"))
        errors = MODULE.validate(effort)
        self.assertTrue(any("blocked Gate requires" in item for item in errors))

    def test_pending_manual_acceptance_requires_history_id(self):
        effort = self.make_effort()
        history_path = effort / "goal" / "history" / "G0.md"
        history_text = history_path.read_text(encoding="utf-8")
        history_text += """
### G0-E0002 · manual-handoff

- At: `2026-10-02`
- Type: `manual-handoff`
- Slice: `none`
- Acceptance: `G0-A1`
- Changed: none
- Verification: `repo=PASS`
- Result: handoff
- Satisfies: `none`
- Risk: none
- Next: user reply
"""
        history_path.write_text(history_text, encoding="utf-8")
        runbook_path = effort / "goal" / "runbook.md"
        runbook_text = runbook_path.read_text(encoding="utf-8")
        runbook_text = runbook_text.replace(
            "- Last event: `G0-E0001`", "- Last event: `G0-E0002`"
        ).replace(
            "- Manual acceptance: `none`", "- Manual acceptance: `pending G0-A1`"
        )
        runbook_path.write_text(runbook_text, encoding="utf-8")
        self.assertEqual(MODULE.validate(effort), [])

        runbook_path.write_text(
            runbook_text.replace("pending G0-A1", "pending G0-A9"), encoding="utf-8"
        )
        errors = MODULE.validate(effort)
        self.assertTrue(any("pending acceptance G0-A9" in item for item in errors))

    def test_imported_event_type_is_rejected(self):
        effort = self.make_effort()
        path = effort / "goal" / "history" / "G0.md"
        text = path.read_text(encoding="utf-8").replace(
            "### G0-E0001 · initialized",
            "### G0-E0001 · imported",
        ).replace(
            "- Type: `initialized`",
            "- Type: `imported`",
        )
        path.write_text(text, encoding="utf-8")
        errors = MODULE.validate(effort)
        self.assertTrue(any("invalid type 'imported'" in item for item in errors))

    def test_hot_runbook_rejects_embedded_progress_log(self):
        effort = self.make_effort()
        path = effort / "goal" / "runbook.md"
        path.write_text(
            path.read_text(encoding="utf-8") + "\n## Progress Log\n\nold slice history\n",
            encoding="utf-8",
        )
        errors = MODULE.validate(effort)
        self.assertTrue(any("execution history must not be embedded" in item for item in errors))

    def test_cli_accepts_valid_fixture(self):
        effort = self.make_effort()
        result = subprocess.run(
            [sys.executable, str(SKILL_ROOT / "scripts" / "validate_goal_loop.py"), str(effort)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK: goal-loop artifacts are valid", result.stdout)

    def test_skill_relative_markdown_links_exist(self):
        for path in [SKILL_ROOT / "SKILL.md", *(SKILL_ROOT / "references").glob("*.md")]:
            text = path.read_text(encoding="utf-8")
            for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
                if "://" in target or target.startswith("#"):
                    continue
                target = target.split("#", 1)[0]
                resolved = (path.parent / target).resolve()
                self.assertTrue(resolved.exists(), f"{path.name}: missing link {target}")


if __name__ == "__main__":
    unittest.main()
