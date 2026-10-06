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

STRICT_PLAN = r'''# Demo Implementation Plan

## Contract Sources

| Path | Role |
| --- | --- |
| `docs/decision.md` | defines accepted behavior |

## Source Decisions

- `docs/decision.md` defines accepted behavior.

## Outcome

The repository exposes the accepted behavior and records reproducible evidence.

## Non-Negotiable Rules

- preserve API behavior

## Gate Overview

| Gate | Name | Unlock condition | Outcome |
| --- | --- | --- | --- |
| G0 | Prepare | 开始 | behavior verified |

## G0: Prepare

### Purpose

Establish the accepted behavior with reproducible evidence.

### Inputs

- `src/app.txt`

### Objective

Verify the repository content and obtain explicit acceptance.

### Scope boundary

Only `src/app.txt` may change.

### Constraints

- preserve API behavior

### Slice policy

One observable behavior per slice.

### Verification

#### Directed

| ID | Check | Evidence inputs |
| --- | --- | --- |
| D1 | Confirm the implementation contains the accepted marker | `src/app.txt` |

#### Repository

| ID | Command | Evidence inputs |
| --- | --- | --- |
| R1 | `python -c "from pathlib import Path; assert Path('src/app.txt').read_text() == 'ok\\n'; print('repository-check-pass')"` | `src/app.txt` |

#### Manual acceptance

| ID | Scenario | Evidence inputs |
| --- | --- | --- |
| M1 | User confirms the behavior is acceptable | `src/app.txt` |

### Evidence rule

| Exit | Required checks |
| --- | --- |
| E1 | D1, R1 |
| E2 | M1 |

### Stop conditions

- `SC1`: required dependency is unavailable

### Rollback

Restore `src/app.txt` to its prior content.

### Exit conditions

- `E1`: directed and repository verification both pass for the current implementation
- `E2`: explicit manual acceptance passes

## Definition Of Done

- E1 and E2 are both satisfied.

## Explicitly Out Of Scope

- unrelated repository changes
'''

STRICT_TWO_GATE_PLAN = STRICT_PLAN.replace(
    "| G0 | Prepare | 开始 | behavior verified |",
    "| G0 | Prepare | 开始 | behavior verified |\n| G1 | Finish | G0 Exit 全部满足 | final check verified |",
).replace(
    "## Definition Of Done",
    r'''## G1: Finish

### Purpose

Confirm the final repository state.

### Inputs

- `src/app.txt`

### Objective

Run the final repository check.

### Scope boundary

No implementation change is required.

### Constraints

- preserve API behavior

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

### Rollback

No implementation change is required.

### Exit conditions

- `E1`: the final repository check passes

## Definition Of Done'''
)




def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class GoalLoopTests(unittest.TestCase):
    def make_repo(self, plan: str = STRICT_PLAN, *, bootstrap: bool = True) -> tuple[Path, Path]:
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
        (effort / "implementation-plan.md").write_text(plan, encoding="utf-8")
        if bootstrap:
            result = self.run_ctl("bootstrap", effort, "--at", "2026-10-05")
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
        runbook_path.write_text(runbook_path.read_text(encoding="utf-8").replace(old_hash, new_hash), encoding="utf-8")

    def complete_verification_gate_checks(self, effort: Path, start_revision: int = 0) -> int:
        d = self.run_ctl(
            "verify-directed", effort, "--expected-revision", str(start_revision), "--check", "D1",
            "--outcome", "pass", "--verification", "inspected source", "--result", "accepted marker present",
            "--next-action", "run R1", "--at", "2026-10-05",
        )
        self.assertEqual(d.returncode, 0, d.stdout + d.stderr)
        r = self.run_ctl(
            "verify-repository", effort, "--expected-revision", str(start_revision + 1), "--check", "R1",
            "--next-action", "request M1", "--at", "2026-10-05",
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        h = self.run_ctl(
            "manual-handoff", effort, "--expected-revision", str(start_revision + 2), "--acceptance", "M1",
            "--result", "ready for user acceptance", "--at", "2026-10-05",
        )
        self.assertEqual(h.returncode, 0, h.stdout + h.stderr)
        m = self.run_ctl(
            "manual-result", effort, "--expected-revision", str(start_revision + 3), "--acceptance", "G0-M1",
            "--outcome", "pass", "--result", "accepted", "--next-action", "pass Gate", "--at", "2026-10-05",
        )
        self.assertEqual(m.returncode, 0, m.stdout + m.stderr)
        return start_revision + 4

    def test_bootstrap_creates_current_format_control_plane(self):
        _, effort = self.make_repo()
        self.assertEqual(self.validate(effort), [])
        self.assertEqual(self.revision(effort), 0)
        self.assertIn(f"Schema: `{v.RUNBOOK_SCHEMA}`", (effort / "goal" / "runbook.md").read_text(encoding="utf-8"))
        self.assertIn(f"Schema: `{v.HISTORY_SCHEMA}`", (effort / "goal" / "history" / "G0.md").read_text(encoding="utf-8"))
        baseline = json.loads((effort / "goal" / "contract-baseline.json").read_text(encoding="utf-8"))
        self.assertEqual(baseline["schema"], v.BASELINE_SCHEMA)
        self.assertIn(f"Prompt schema: `{v.PROMPT_SCHEMA}`", (effort / "goal" / "prompt.md").read_text(encoding="utf-8"))


    def test_versioned_artifact_schema_identifiers_are_rejected(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        runbook.write_text(
            runbook.read_text(encoding="utf-8").replace("Schema: `goal-loop/runbook`", "Schema: `goal-loop/runbook-v3`"),
            encoding="utf-8",
        )
        history = effort / "goal" / "history" / "G0.md"
        history.write_text(
            history.read_text(encoding="utf-8").replace("Schema: `goal-loop/history`", "Schema: `goal-loop/history-v2`"),
            encoding="utf-8",
        )
        baseline = effort / "goal" / "contract-baseline.json"
        data = json.loads(baseline.read_text(encoding="utf-8"))
        data["schema"] = "goal-loop/contract-baseline-v1"
        baseline.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        prompt = effort / "goal" / "prompt.md"
        prompt.write_text(
            prompt.read_text(encoding="utf-8").replace("Prompt schema: `goal-loop/prompt`", "Prompt schema: `goal-loop/prompt-v3`"),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("runbook: must declare Schema `goal-loop/runbook`" in error for error in errors), errors)
        self.assertTrue(any("history:" in error and "goal-loop/history" in error for error in errors), errors)
        self.assertTrue(any("baseline: manifest schema must be 'goal-loop/contract-baseline'" in error for error in errors), errors)
        self.assertTrue(any("prompt: must declare Prompt schema `goal-loop/prompt`" in error for error in errors), errors)

    def test_removed_migration_command_is_not_available(self):
        _, effort = self.make_repo()
        result = self.run_ctl("migrate-protocol", effort, "--expected-revision", "0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid choice", result.stdout + result.stderr)

    def test_prompt_must_exactly_match_current_template(self):
        _, effort = self.make_repo()
        prompt = effort / "goal" / "prompt.md"
        prompt.write_text(prompt.read_text(encoding="utf-8") + "\nextra\n", encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("must exactly match" in error for error in errors), errors)

    def test_plan_requires_verification_id_contract(self):
        plan = STRICT_PLAN.replace(
            "| E1 | D1, R1 |",
            "| E1 | verification output |",
        )
        _, effort = self.make_repo(plan, bootstrap=False)
        result = self.run_ctl("bootstrap", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unknown checks", result.stdout + result.stderr)

    def test_plan_rejects_unknown_evidence_check(self):
        plan = STRICT_PLAN.replace("| E1 | D1, R1 |", "| E1 | D1, R9 |")
        _, effort = self.make_repo(plan, bootstrap=False)
        result = self.run_ctl("bootstrap", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unknown checks", result.stdout + result.stderr)

    def test_record_has_no_direct_exit_satisfaction_interface(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "record", effort, "--expected-revision", "0", "--type", "verification",
            "--result", "claimed evidence", "--satisfies", "E1", "--next-action", "continue",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unrecognized arguments: --satisfies E1", result.stdout + result.stderr)

    def test_repository_check_executes_plan_command_and_saves_artifact(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "verify-repository", effort, "--expected-revision", "0", "--check", "R1",
            "--next-action", "run D1", "--at", "2026-10-05",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("repository-check-pass", result.stdout)
        artifacts = list((effort / "goal" / "evidence").glob("*.log"))
        self.assertEqual(len(artifacts), 1)
        history = (effort / "goal" / "history" / "G0.md").read_text(encoding="utf-8")
        self.assertIn("- Check: R1", history)
        self.assertIn("- Outcome: pass", history)
        self.assertIn("- Output SHA-256:", history)
        self.assertEqual(self.validate(effort), [])

    def test_evidence_artifact_tampering_is_detected(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "verify-repository", effort, "--expected-revision", "0", "--check", "R1", "--next-action", "continue",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        artifact = next((effort / "goal" / "evidence").glob("*.log"))
        artifact.write_text("tampered\n", encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("output artifact hash mismatch" in error for error in errors), errors)

    def test_exit_satisfaction_is_derived_from_required_checks(self):
        _, effort = self.make_repo()
        d = self.run_ctl(
            "verify-directed", effort, "--expected-revision", "0", "--check", "D1", "--outcome", "pass",
            "--verification", "inspected", "--result", "marker present", "--next-action", "R1",
        )
        self.assertEqual(d.returncode, 0, d.stdout + d.stderr)
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Satisfied exits: `none`", runbook)
        r = self.run_ctl(
            "verify-repository", effort, "--expected-revision", "1", "--check", "R1", "--next-action", "M1",
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Satisfied exits: `E1`", runbook)

    def test_repository_failure_is_latest_result_and_blocks_exit(self):
        repo, effort = self.make_repo()
        first = self.run_ctl(
            "verify-repository", effort, "--expected-revision", "0", "--check", "R1", "--next-action", "continue",
        )
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        (repo / "src" / "app.txt").write_text("broken\n", encoding="utf-8")
        second = self.run_ctl(
            "verify-repository", effort, "--expected-revision", "1", "--check", "R1", "--next-action", "fix source",
        )
        self.assertEqual(second.returncode, 2, second.stdout + second.stderr)
        history = (effort / "goal" / "history" / "G0.md").read_text(encoding="utf-8")
        self.assertIn("- Outcome: fail", history)

    def test_stale_snapshot_blocks_gate_pass_until_reverified(self):
        repo, effort = self.make_repo()
        rev = self.complete_verification_gate_checks(effort)
        self.assertEqual(rev, 4)
        (repo / "src" / "app.txt").write_text("ok\nchanged\n", encoding="utf-8")
        passed = self.run_ctl("pass-gate", effort, "--expected-revision", "4")
        self.assertNotEqual(passed.returncode, 0)
        self.assertIn("stale", passed.stdout + passed.stderr)

    def test_reverification_refreshes_snapshot_and_allows_gate_pass(self):
        repo, effort = self.make_repo()
        rev = self.complete_verification_gate_checks(effort)
        (repo / "src" / "app.txt").write_text("broken\n", encoding="utf-8")
        failed = self.run_ctl(
            "verify-repository", effort, "--expected-revision", str(rev), "--check", "R1", "--next-action", "restore source",
        )
        self.assertEqual(failed.returncode, 2, failed.stdout + failed.stderr)
        (repo / "src" / "app.txt").write_text("ok\n", encoding="utf-8")
        d = self.run_ctl(
            "verify-directed", effort, "--expected-revision", str(rev + 1), "--check", "D1", "--outcome", "pass",
            "--verification", "re-inspected", "--result", "marker restored", "--next-action", "rerun R1",
        )
        self.assertEqual(d.returncode, 0, d.stdout + d.stderr)
        r = self.run_ctl(
            "verify-repository", effort, "--expected-revision", str(rev + 2), "--check", "R1", "--next-action", "pass Gate",
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        # M1 snapshot is stale because app.txt changed away and back to identical bytes; digest matches again by design.
        passed = self.run_ctl("pass-gate", effort, "--expected-revision", str(rev + 3))
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        self.assertEqual(self.validate(effort), [])

    def test_manual_acceptance_uses_declared_check_and_automatic_exit(self):
        _, effort = self.make_repo()
        handoff = self.run_ctl(
            "manual-handoff", effort, "--expected-revision", "0", "--acceptance", "M1",
            "--result", "ready", "--at", "2026-10-05",
        )
        self.assertEqual(handoff.returncode, 0, handoff.stdout + handoff.stderr)
        self.assertIn("Acceptance: G0-M1", handoff.stdout)
        result = self.run_ctl(
            "manual-result", effort, "--expected-revision", "1", "--acceptance", "G0-M1", "--outcome", "pass",
            "--result", "accepted", "--next-action", "continue", "--at", "2026-10-05",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Satisfied exits: `E2`", runbook)

    def test_block_requires_declared_stop_condition(self):
        _, effort = self.make_repo()
        bad = self.run_ctl(
            "block", effort, "--expected-revision", "0", "--condition", "SC9", "--next-action", "wait",
        )
        self.assertNotEqual(bad.returncode, 0)
        ok = self.run_ctl(
            "block", effort, "--expected-revision", "0", "--condition", "SC1", "--next-action", "restore dependency",
        )
        self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
        self.assertEqual(self.validate(effort), [])
        resumed = self.run_ctl(
            "resume", effort, "--expected-revision", "1", "--result", "dependency restored",
            "--next-action", "continue",
        )
        self.assertEqual(resumed.returncode, 0, resumed.stdout + resumed.stderr)
        self.assertEqual(self.validate(effort), [])

    def test_gate_pass_records_check_event_mapping(self):
        _, effort = self.make_repo()
        rev = self.complete_verification_gate_checks(effort)
        passed = self.run_ctl("pass-gate", effort, "--expected-revision", str(rev), "--at", "2026-10-05")
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        history = (effort / "goal" / "history" / "G0.md").read_text(encoding="utf-8")
        self.assertRegex(history, r"Exit evidence: E1=D1@G0-E\d{4},R1@G0-E\d{4}; E2=M1@G0-E\d{4}")
        self.assertEqual(self.validate(effort), [])

    def test_gate_pass_activates_only_direct_successor(self):
        _, effort = self.make_repo(STRICT_TWO_GATE_PLAN)
        rev = self.complete_verification_gate_checks(effort)
        passed = self.run_ctl("pass-gate", effort, "--expected-revision", str(rev))
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("| G0: Prepare | passed |", runbook)
        self.assertIn("| G1: Finish | active |", runbook)
        self.assertIn("- Gate: `G1: Finish`", runbook)
        self.assertTrue((effort / "goal" / "history" / "G1.md").exists())
        self.assertEqual(self.validate(effort), [])

    def test_contract_source_drift_is_rejected(self):
        repo, effort = self.make_repo()
        (repo / "docs" / "decision.md").write_text("changed\n", encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("drift detected" in error for error in errors), errors)

    def test_contract_baseline_reconcile_records_event(self):
        repo, effort = self.make_repo()
        (repo / "docs" / "decision.md").write_text("accepted clarification\n", encoding="utf-8")
        result = self.run_ctl(
            "reconcile-baseline", effort, "--expected-revision", "0", "--confirm-plan-valid",
            "--reason", "wording clarification does not change Gate contracts", "--next-action", "continue G0",
            "--at", "2026-10-05",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.validate(effort), [])
        history = (effort / "goal" / "history" / "G0.md").read_text(encoding="utf-8")
        self.assertIn("· contract-reconciled", history)

    def test_stale_revision_is_rejected(self):
        _, effort = self.make_repo()
        first = self.run_ctl(
            "record", effort, "--expected-revision", "0", "--type", "checkpoint", "--result", "checkpoint",
            "--next-action", "continue",
        )
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        second = self.run_ctl(
            "record", effort, "--expected-revision", "0", "--type", "checkpoint", "--result", "stale",
            "--next-action", "continue",
        )
        self.assertNotEqual(second.returncode, 0)
        self.assertIn("stale Revision", second.stdout + second.stderr)

    def test_correction_of_correction_restores_original_evidence_effect(self):
        _, effort = self.make_repo()
        record = self.run_ctl(
            "verify-directed", effort, "--expected-revision", "0", "--check", "D1", "--outcome", "pass",
            "--verification", "inspected", "--result", "marker present", "--next-action", "review evidence",
        )
        self.assertEqual(record.returncode, 0, record.stdout + record.stderr)
        c1 = self.run_ctl(
            "correct", effort, "--expected-revision", "1", "--corrects", "G0-E0002", "--evidence-effect", "invalidate",
            "--result", "evidence invalid", "--next-action", "review correction",
        )
        self.assertEqual(c1.returncode, 0, c1.stdout + c1.stderr)
        c2 = self.run_ctl(
            "correct", effort, "--expected-revision", "2", "--corrects", "G0-E0003", "--evidence-effect", "invalidate",
            "--result", "the invalidation was itself wrong", "--next-action", "continue verification",
        )
        self.assertEqual(c2.returncode, 0, c2.stdout + c2.stderr)
        plan_errors: list[str] = []
        gate = v.parse_plan(STRICT_PLAN, plan_errors).gates[0]
        self.assertEqual(plan_errors, [])
        history_errors: list[str] = []
        events = v.parse_history(effort / "goal" / "history" / "G0.md", gate, history_errors)
        self.assertEqual(history_errors, [])
        self.assertEqual(v.latest_effective_check_events(events, gate)["D1"].fields["Outcome"], "pass")
        self.assertEqual(self.validate(effort), [])

    def test_recover_rejects_journal_hash_tampering(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        data = runbook.read_bytes()
        journal = {
            "schema": v.TRANSACTION_SCHEMA,
            "operation": "tampered",
            "expected_revision": 0,
            "target_revision": 1,
            "files": [{
                "path": "goal/runbook.md",
                "before_exists": True,
                "before_sha256": "0" * 64,
                "after_sha256": sha256_bytes(data),
                "before_b64": base64.b64encode(data).decode("ascii"),
                "after_b64": base64.b64encode(data).decode("ascii"),
            }],
        }
        (effort / "goal" / ".goal-loop-transaction.json").write_text(json.dumps(journal), encoding="utf-8")
        result = self.run_ctl("recover", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("before bytes hash mismatch", result.stdout + result.stderr)

    def test_status_reports_stale_check(self):
        repo, effort = self.make_repo()
        result = self.run_ctl(
            "verify-directed", effort, "--expected-revision", "0", "--check", "D1", "--outcome", "pass",
            "--verification", "inspected", "--result", "marker present", "--next-action", "continue",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        (repo / "src" / "app.txt").write_text("changed\n", encoding="utf-8")
        status = self.run_ctl("status", effort)
        self.assertEqual(status.returncode, 0, status.stdout + status.stderr)
        self.assertIn("D1", status.stdout)
        self.assertIn("stale", status.stdout.lower())

    def test_context_contains_only_current_gate_contract_and_sources(self):
        _, effort = self.make_repo()
        result = self.run_ctl("context", effort)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Gate: G0: Prepare", result.stdout)
        self.assertIn("Contract Sources:", result.stdout)
        self.assertIn("docs/decision.md", result.stdout)
        self.assertIn("Current Gate contract:", result.stdout)


    def test_state_rules_are_exact_control_invariants(self):
        _, effort = self.make_repo()
        path = effort / "goal" / "runbook.md"
        path.write_text(
            path.read_text(encoding="utf-8").replace(
                "所有运行态修改使用 goal-loop control script",
                "运行态修改可以直接编辑文件",
            ),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("State Rules" in error for error in errors), errors)

    def test_plan_top_level_sections_are_exact(self):
        _, effort = self.make_repo()
        plan = effort / "implementation-plan.md"
        plan.write_text(
            plan.read_text(encoding="utf-8").replace("## Outcome\n", "## Unexpected\n\nextra\n\n## Outcome\n"),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("top-level sections must be exactly" in error for error in errors), errors)

    def test_manifest_path_set_must_exactly_match_plan(self):
        _, effort = self.make_repo()
        self.update_manifest_and_runbook_hash(
            effort,
            lambda data: data.__setitem__(
                "files", [item for item in data["files"] if item["path"] != "docs/decision.md"]
            ),
        )
        errors = self.validate(effort)
        self.assertTrue(any("must exactly match Contract Sources" in error for error in errors), errors)

    def test_checkpoint_last_event_must_equal_history_tail(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "record", effort, "--expected-revision", "0", "--type", "slice", "--slice", "S1",
            "--result", "slice complete", "--next-action", "verify", "--last-completed-slice", "S1",
            "--current-slice", "S2", "--at", "2026-10-05",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        runbook = effort / "goal" / "runbook.md"
        runbook.write_text(
            runbook.read_text(encoding="utf-8").replace("- Last event: `G0-E0002`", "- Last event: `G0-E0001`"),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("must equal history tail" in error for error in errors), errors)

    def test_checkpoint_all_cannot_bypass_check_evidence(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        runbook.write_text(
            runbook.read_text(encoding="utf-8").replace("- Satisfied exits: `none`", "- Satisfied exits: `all`"),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("effective history evidence" in error for error in errors), errors)

    def test_history_hash_chain_detects_content_edit(self):
        _, effort = self.make_repo()
        history = effort / "goal" / "history" / "G0.md"
        history.write_text(
            history.read_text(encoding="utf-8").replace(
                "Gate activated; implementation has not started.", "Gate activation text was edited."
            ),
            encoding="utf-8",
        )
        errors = self.validate(effort)
        self.assertTrue(any("Event hash mismatch" in error for error in errors), errors)

    def test_history_head_must_match_tail_hash(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        text = runbook.read_text(encoding="utf-8")
        match = re.search(r"(?m)^- History head: `([0-9a-f]{64})`$", text)
        assert match
        runbook.write_text(text.replace(match.group(1), "0" * 64, 1), encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("History head" in error for error in errors), errors)

    def test_stable_checkpoint_event_keeps_gate_active(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "record", effort, "--expected-revision", "0", "--type", "checkpoint",
            "--verification", "repository=PASS", "--result", "stable recovery point",
            "--next-action", "execute S2", "--at", "2026-10-05",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.revision(effort), 1)
        self.assertEqual(self.validate(effort), [])
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("| G0: Prepare | active |", runbook)

    def test_correction_can_invalidate_check_evidence(self):
        _, effort = self.make_repo()
        d = self.run_ctl(
            "verify-directed", effort, "--expected-revision", "0", "--check", "D1", "--outcome", "pass",
            "--verification", "inspected", "--result", "marker present", "--next-action", "R1",
        )
        self.assertEqual(d.returncode, 0, d.stdout + d.stderr)
        r = self.run_ctl(
            "verify-repository", effort, "--expected-revision", "1", "--check", "R1", "--next-action", "continue",
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Satisfied exits: `E1`", runbook)
        correction = self.run_ctl(
            "correct", effort, "--expected-revision", "2", "--corrects", "G0-E0003",
            "--evidence-effect", "invalidate", "--result", "R1 evidence was invalid",
            "--next-action", "rerun R1",
        )
        self.assertEqual(correction.returncode, 0, correction.stdout + correction.stderr)
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Satisfied exits: `none`", runbook)
        self.assertEqual(self.validate(effort), [])

    def test_manual_handoff_requires_acceptance_field(self):
        _, effort = self.make_repo()
        result = self.run_ctl(
            "manual-handoff", effort, "--expected-revision", "0", "--result", "ready"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("the following arguments are required: --acceptance", result.stdout + result.stderr)

    def test_final_gate_pass_sets_effort_complete(self):
        _, effort = self.make_repo()
        rev = self.complete_verification_gate_checks(effort)
        passed = self.run_ctl("pass-gate", effort, "--expected-revision", str(rev))
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
        self.assertIn("- Gate: `none`", runbook)
        self.assertIn("- Next action: `effort complete`", runbook)
        self.assertIn("| G0: Prepare | passed |", runbook)
        self.assertEqual(self.validate(effort), [])

    def test_pending_transaction_blocks_validator(self):
        _, effort = self.make_repo()
        path = effort / "goal" / ".goal-loop-transaction.json"
        path.write_text(json.dumps({"schema": v.TRANSACTION_SCHEMA, "files": []}), encoding="utf-8")
        errors = self.validate(effort)
        self.assertTrue(any("pending state transaction" in error for error in errors), errors)

    def test_recover_completes_partially_applied_transaction(self):
        _, effort = self.make_repo()
        runbook = effort / "goal" / "runbook.md"
        history = effort / "goal" / "history" / "G0.md"
        before = {runbook: runbook.read_bytes(), history: history.read_bytes()}
        recorded = self.run_ctl(
            "record", effort, "--expected-revision", "0", "--type", "checkpoint",
            "--verification", "repository=PASS", "--result", "recoverable checkpoint",
            "--next-action", "continue", "--at", "2026-10-05",
        )
        self.assertEqual(recorded.returncode, 0, recorded.stdout + recorded.stderr)
        after = {runbook: runbook.read_bytes(), history: history.read_bytes()}
        for path, data in before.items():
            path.write_bytes(data)
        entries = []
        for path in [history, runbook]:
            rel = path.relative_to(effort).as_posix()
            entries.append({
                "path": rel,
                "before_exists": True,
                "before_sha256": sha256_bytes(before[path]),
                "after_sha256": sha256_bytes(after[path]),
                "before_b64": base64.b64encode(before[path]).decode("ascii"),
                "after_b64": base64.b64encode(after[path]).decode("ascii"),
            })
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
        recovered = self.run_ctl("recover", effort)
        self.assertEqual(recovered.returncode, 0, recovered.stdout + recovered.stderr)
        self.assertFalse((effort / "goal" / ".goal-loop-transaction.json").exists())
        self.assertEqual(self.revision(effort), 1)
        self.assertEqual(self.validate(effort), [])

    def test_recover_rejects_path_traversal(self):
        _, effort = self.make_repo()
        data = b"x"
        journal = {
            "schema": v.TRANSACTION_SCHEMA,
            "operation": "unsafe",
            "expected_revision": 0,
            "target_revision": 1,
            "files": [{
                "path": "../outside.txt",
                "before_exists": False,
                "before_sha256": sha256_bytes(b""),
                "after_sha256": sha256_bytes(data),
                "before_b64": base64.b64encode(b"").decode("ascii"),
                "after_b64": base64.b64encode(data).decode("ascii"),
            }],
        }
        (effort / "goal" / ".goal-loop-transaction.json").write_text(json.dumps(journal), encoding="utf-8")
        result = self.run_ctl("recover", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unsafe", result.stdout + result.stderr)

    def test_cli_validator_accepts_valid_fixture(self):
        _, effort = self.make_repo()
        result = subprocess.run(
            [sys.executable, str(VALIDATOR_PATH), str(effort)],
            capture_output=True, text=True, check=False,
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
