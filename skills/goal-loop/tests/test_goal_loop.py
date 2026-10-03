from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_ROOT / "scripts"
VALIDATOR_PATH = SCRIPTS / "validate_goal_loop.py"
CTL_PATH = SCRIPTS / "goal_loop_ctl.py"

spec = importlib.util.spec_from_file_location("validate_goal_loop", VALIDATOR_PATH)
v = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = v
spec.loader.exec_module(v)


PLAN = """# Demo Implementation Plan

## Contract Sources

| Path | Role |
| --- | --- |
| `docs/decision.md` | defines accepted behavior |

## Source Decisions

- `docs/decision.md` defines accepted behavior.

## Outcome

demo outcome

## Non-Negotiable Rules

- preserve compatibility

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
one stable behavior per slice
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
- missing dependency
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
one stable behavior per slice
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
- missing dependency
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


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class GoalLoopTests(unittest.TestCase):
    def make_repo(self) -> tuple[Path, Path]:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        repo = Path(temp.name)
        (repo / ".git").mkdir()
        (repo / "docs").mkdir()
        (repo / "docs" / "decision.md").write_text("accepted\n", encoding="utf-8")
        effort = repo / "effort"
        effort.mkdir()
        (effort / "implementation-plan.md").write_text(PLAN, encoding="utf-8")
        result = self.run_ctl("bootstrap", effort, "--at", "2026-10-03")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return repo, effort

    def run_ctl(self, command: str, effort: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(CTL_PATH), command, str(effort), *args],
            capture_output=True,
            text=True,
            check=False,
        )

    def validate(self, effort: Path) -> list[str]:
        return v.validate(effort)

    def revision(self, effort: Path) -> int:
        text = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        match = re.search(r"(?m)^Revision: `(\d+)`$", text)
        assert match
        return int(match.group(1))

    def update_manifest_and_runbook_hash(self, effort: Path, transform) -> None:
        manifest_path = effort / "goal" / "contract-baseline.json"
        runbook_path = effort / "goal" / "runbook.md"
        old_hash = sha256_bytes(manifest_path.read_bytes())
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        transform(data)
        new_bytes = (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
        manifest_path.write_bytes(new_bytes)
        new_hash = sha256_bytes(new_bytes)
        runbook_path.write_text(
            runbook_path.read_text(encoding="utf-8").replace(old_hash, new_hash),
            encoding="utf-8",
        )

    def test_bootstrap_produces_valid_control_plane(self):
        _, effort = self.make_repo()
        self.assertEqual(self.validate(effort), [])
        self.assertEqual(self.revision(effort), 0)
        self.assertTrue((effort / "goal" / "contract-baseline.json").exists())
        self.assertTrue((effort / "goal" / "history" / "G0.md").exists())

    def test_prompt_must_match_fixed_template(self):
        _, effort = self.make_repo()
        path = effort / "goal" / "prompt.md"
        path.write_text(path.read_text(encoding="utf-8") + "\nextra\n", encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("must exactly match" in item for item in errors), errors)

    def test_state_rules_are_exact_protocol_invariants(self):
        _, effort = self.make_repo()
        path = effort / "goal" / "runbook.md"
        text = path.read_text(encoding="utf-8").replace(
            "所有运行态修改使用 goal-loop control script",
            "运行态修改可以直接编辑文件",
        )
        path.write_text(text, encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("State Rules" in item for item in errors), errors)

    def test_plan_top_level_sections_are_exact(self):
        _, effort = self.make_repo()
        plan = effort / "implementation-plan.md"
        plan.write_text(
            plan.read_text(encoding="utf-8").replace("## Outcome\n", "## Unexpected\n\nextra\n\n## Outcome\n"),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("top-level sections must be exactly" in item for item in errors), errors)

    def test_contract_source_drift_is_rejected(self):
        repo, effort = self.make_repo()
        (repo / "docs" / "decision.md").write_text("changed\n", encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("drift detected" in item for item in errors), errors)

    def test_manifest_path_set_must_exactly_match_plan(self):
        _, effort = self.make_repo()
        self.update_manifest_and_runbook_hash(
            effort,
            lambda data: data.__setitem__(
                "files", [item for item in data["files"] if item["path"] != "docs/decision.md"]
            ),
        )
        errors = self.validate(effort)
        self.assertTrue(any("must exactly match Contract Sources" in item for item in errors), errors)

    def test_checkpoint_last_event_must_equal_history_tail(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "record",
            effort,
            "--expected-revision",
            "0",
            "--type",
            "slice",
            "--slice",
            "S1",
            "--result",
            "slice complete",
            "--next-action",
            "verify",
            "--last-completed-slice",
            "S1",
            "--current-slice",
            "S2",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        runbook = effort / "goal" / "runbook.md"
        runbook.write_text(
            runbook.read_text(encoding="utf-8").replace(
                "- Last event: `G0-E0002`", "- Last event: `G0-E0001`"
            ),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("must equal history tail" in item for item in errors), errors)

    def test_satisfied_all_cannot_bypass_evidence(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        runbook.write_text(
            runbook.read_text(encoding="utf-8").replace(
                "- Satisfied exits: `none`", "- Satisfied exits: `all`"
            ),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("effective history evidence" in item for item in errors), errors)

    def test_history_hash_chain_detects_content_edit(self):
        _, effort = self.make_repo()
        history = effort / "goal" / "history" / "G0.md"
        history.write_text(
            history.read_text(encoding="utf-8").replace(
                "Gate activated; implementation has not started.",
                "Gate activation text was edited.",
            ),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("Event hash mismatch" in item for item in errors), errors)

    def test_history_head_must_match_tail_hash(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        text = runbook.read_text(encoding="utf-8")
        match = re.search(r"(?m)^- History head: `([0-9a-f]{64})`$", text)
        assert match
        text = text.replace(match.group(1), "0" * 64, 1)
        runbook.write_text(text, encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("History head" in item for item in errors), errors)

    def test_stable_checkpoint_event_keeps_gate_active(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "record",
            effort,
            "--expected-revision",
            "0",
            "--type",
            "checkpoint",
            "--verification",
            "repository=PASS",
            "--result",
            "stable recovery point",
            "--next-action",
            "execute S2",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.revision(effort), 1)
        self.assertEqual(self.validate(effort), [])
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("| G0: Prepare | active |", runbook)
        self.assertIn("G0-E0002", runbook)

    def test_stale_revision_is_rejected(self):
        _, effort = self.make_repo()
        first = self.run_ctl(
            "record",
            effort,
            "--expected-revision",
            "0",
            "--type",
            "checkpoint",
            "--result",
            "checkpoint",
            "--next-action",
            "continue",
        )
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        second = self.run_ctl(
            "record",
            effort,
            "--expected-revision",
            "0",
            "--type",
            "checkpoint",
            "--result",
            "stale write",
            "--next-action",
            "continue",
        )
        self.assertNotEqual(second.returncode, 0)
        self.assertIn("stale Revision", second.stdout + second.stderr)
        self.assertEqual(self.revision(effort), 1)

    def test_correction_can_invalidate_prior_exit_evidence(self):
        _, effort = self.make_repo()
        record = self.run_ctl(
            "record",
            effort,
            "--expected-revision",
            "0",
            "--type",
            "verification",
            "--verification",
            "directed=PASS",
            "--result",
            "E1 verified",
            "--satisfies",
            "E1",
            "--next-action",
            "continue",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(record.returncode, 0, record.stdout + record.stderr)
        correction = self.run_ctl(
            "correct",
            effort,
            "--expected-revision",
            "1",
            "--corrects",
            "G0-E0002",
            "--evidence-effect",
            "invalidate",
            "--result",
            "verification evidence was invalid",
            "--next-action",
            "rerun verification",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(correction.returncode, 0, correction.stdout + correction.stderr)
        self.assertEqual(self.validate(effort), [])
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Satisfied exits: `none`", runbook)
        passed = self.run_ctl(
            "pass-gate",
            effort,
            "--expected-revision",
            "2",
            "--verification",
            "repository=PASS",
        )
        self.assertNotEqual(passed.returncode, 0)
        self.assertIn("every Exit", passed.stdout + passed.stderr)

    def test_manual_handoff_and_result_are_linked(self):
        _, effort = self.make_repo()
        handoff = self.run_ctl(
            "manual-handoff",
            effort,
            "--expected-revision",
            "0",
            "--verification",
            "repository=PASS",
            "--result",
            "ready for acceptance",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(handoff.returncode, 0, handoff.stdout + handoff.stderr)
        self.assertIn("Acceptance: G0-A1", handoff.stdout)
        self.assertEqual(self.validate(effort), [])
        result = self.run_ctl(
            "manual-result",
            effort,
            "--expected-revision",
            "1",
            "--acceptance",
            "G0-A1",
            "--outcome",
            "pass",
            "--result",
            "accepted",
            "--satisfies",
            "E1",
            "--next-action",
            "pass Gate",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.validate(effort), [])
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Manual acceptance: `none`", runbook)
        self.assertIn("- Satisfied exits: `all`", runbook)

    def test_manual_handoff_requires_acceptance_field(self):
        _, effort = self.make_repo()
        handoff = self.run_ctl(
            "manual-handoff",
            effort,
            "--expected-revision",
            "0",
            "--result",
            "ready",
        )
        self.assertEqual(handoff.returncode, 0, handoff.stdout + handoff.stderr)
        history = effort / "goal" / "history" / "G0.md"
        history.write_text(
            re.sub(r"(?m)^- Acceptance: G0-A1\n", "", history.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("manual-handoff requires valid Acceptance" in item for item in errors), errors)

    def test_block_requires_resume_before_active_state(self):
        _, effort = self.make_repo()
        blocked = self.run_ctl(
            "block",
            effort,
            "--expected-revision",
            "0",
            "--blocker",
            "dependency unavailable",
            "--next-action",
            "wait for dependency",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(blocked.returncode, 0, blocked.stdout + blocked.stderr)
        self.assertEqual(self.validate(effort), [])
        resumed = self.run_ctl(
            "resume",
            effort,
            "--expected-revision",
            "1",
            "--result",
            "dependency restored",
            "--next-action",
            "continue S1",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(resumed.returncode, 0, resumed.stdout + resumed.stderr)
        self.assertEqual(self.validate(effort), [])

    def test_gate_pass_activates_only_direct_successor(self):
        _, effort = self.make_repo()
        record = self.run_ctl(
            "record",
            effort,
            "--expected-revision",
            "0",
            "--type",
            "verification",
            "--verification",
            "repository=PASS",
            "--result",
            "G0 exit proven",
            "--satisfies",
            "E1",
            "--next-action",
            "pass Gate",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(record.returncode, 0, record.stdout + record.stderr)
        passed = self.run_ctl(
            "pass-gate",
            effort,
            "--expected-revision",
            "1",
            "--verification",
            "final-repository=PASS",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        self.assertEqual(self.validate(effort), [])
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("| G0: Prepare | passed |", runbook)
        self.assertIn("| G1: Finish | active |", runbook)
        self.assertIn("- Gate: `G1: Finish`", runbook)
        self.assertTrue((effort / "goal" / "history" / "G1.md").exists())

    def test_contract_baseline_reconcile_records_event(self):
        repo, effort = self.make_repo()
        (repo / "docs" / "decision.md").write_text("accepted clarification\n", encoding="utf-8")
        self.assertTrue(any("drift detected" in item for item in self.validate(effort)))
        result = self.run_ctl(
            "reconcile-baseline",
            effort,
            "--expected-revision",
            "0",
            "--confirm-plan-valid",
            "--reason",
            "wording clarification does not change Gate contracts",
            "--next-action",
            "continue G0",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.revision(effort), 1)
        self.assertEqual(self.validate(effort), [])
        history = (effort / "goal" / "history" / "G0.md").read_text(encoding="utf-8")
        self.assertIn("· contract-reconciled", history)

    def test_reconcile_refuses_implementation_plan_drift(self):
        _, effort = self.make_repo()
        plan = effort / "implementation-plan.md"
        plan.write_text(plan.read_text(encoding="utf-8") + "\n<!-- changed contract -->\n", encoding="utf-8")
        result = self.run_ctl(
            "reconcile-baseline",
            effort,
            "--expected-revision",
            "0",
            "--confirm-plan-valid",
            "--reason",
            "attempted",
            "--next-action",
            "continue",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("implementation-plan.md changed", result.stdout + result.stderr)

    def test_recover_completes_partially_applied_transaction(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        history = effort / "goal" / "history" / "G0.md"
        before = {
            runbook: runbook.read_bytes(),
            history: history.read_bytes(),
        }

        recorded = self.run_ctl(
            "record",
            effort,
            "--expected-revision",
            "0",
            "--type",
            "checkpoint",
            "--verification",
            "repository=PASS",
            "--result",
            "recoverable checkpoint",
            "--next-action",
            "continue",
            "--at",
            "2026-10-03",
        )
        self.assertEqual(recorded.returncode, 0, recorded.stdout + recorded.stderr)
        after = {
            runbook: runbook.read_bytes(),
            history: history.read_bytes(),
        }

        for path, data in before.items():
            path.write_bytes(data)

        entries = []
        for path in [history, runbook]:
            rel = path.relative_to(effort).as_posix()
            entries.append(
                {
                    "path": rel,
                    "before_exists": True,
                    "before_sha256": sha256_bytes(before[path]),
                    "after_sha256": sha256_bytes(after[path]),
                    "before_b64": base64.b64encode(before[path]).decode("ascii"),
                    "after_b64": base64.b64encode(after[path]).decode("ascii"),
                }
            )
        journal = {
            "schema": v.TRANSACTION_SCHEMA,
            "operation": "record-checkpoint",
            "expected_revision": 0,
            "target_revision": 1,
            "files": entries,
        }
        (effort / "goal" / ".goal-loop-transaction.json").write_text(
            json.dumps(journal, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        history.write_bytes(after[history])

        self.assertTrue(any("pending state transaction" in item for item in self.validate(effort)))
        recovered = self.run_ctl("recover", effort)
        self.assertEqual(recovered.returncode, 0, recovered.stdout + recovered.stderr)
        self.assertFalse((effort / "goal" / ".goal-loop-transaction.json").exists())
        self.assertEqual(self.revision(effort), 1)
        self.assertEqual(self.validate(effort), [])

    def test_final_gate_pass_sets_effort_complete(self):
        _, effort = self.make_repo()
        g0 = self.run_ctl(
            "record", effort,
            "--expected-revision", "0",
            "--type", "verification",
            "--verification", "repository=PASS",
            "--result", "G0 exit proven",
            "--satisfies", "E1",
            "--next-action", "pass G0",
            "--at", "2026-10-03",
        )
        self.assertEqual(g0.returncode, 0, g0.stdout + g0.stderr)
        pass0 = self.run_ctl(
            "pass-gate", effort,
            "--expected-revision", "1",
            "--verification", "final-repository=PASS",
            "--at", "2026-10-03",
        )
        self.assertEqual(pass0.returncode, 0, pass0.stdout + pass0.stderr)
        g1 = self.run_ctl(
            "record", effort,
            "--expected-revision", "2",
            "--type", "verification",
            "--verification", "repository=PASS",
            "--result", "G1 exits proven",
            "--satisfies", "E1,E2",
            "--next-action", "pass G1",
            "--at", "2026-10-03",
        )
        self.assertEqual(g1.returncode, 0, g1.stdout + g1.stderr)
        pass1 = self.run_ctl(
            "pass-gate", effort,
            "--expected-revision", "3",
            "--verification", "final-repository=PASS",
            "--at", "2026-10-03",
        )
        self.assertEqual(pass1.returncode, 0, pass1.stdout + pass1.stderr)
        self.assertEqual(self.validate(effort), [])
        runbook_text = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Gate: `none`", runbook_text)
        self.assertIn("- Next action: `effort complete`", runbook_text)
        self.assertIn("| G1: Finish | passed |", runbook_text)

    def test_pending_transaction_blocks_validator(self):
        _, effort = self.make_repo()
        path = effort / "goal" / ".goal-loop-transaction.json"
        path.write_text(json.dumps({"schema": v.TRANSACTION_SCHEMA, "files": []}), encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("pending state transaction" in item for item in errors), errors)

    def test_cli_validator_accepts_valid_fixture(self):
        _, effort = self.make_repo()
        result = subprocess.run(
            [sys.executable, str(VALIDATOR_PATH), str(effort)],
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
