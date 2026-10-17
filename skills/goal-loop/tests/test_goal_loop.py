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
from unittest.mock import patch
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

    def test_context_ignores_contract_and_manifest_line_endings_without_writes(self):
        for legacy in (False, True):
            for original_ending in (b"\n", b"\r\n"):
                with self.subTest(legacy=legacy, original_ending=original_ending):
                    repo, effort = self.make_repo()
                    manifest_path = effort / "goal/contract-baseline.json"
                    manifest = json.loads(manifest_path.read_bytes())
                    paths = [repo / item["path"] for item in manifest["files"]]
                    if legacy:
                        manifest.pop("hash_mode", None)
                        for item, path in zip(manifest["files"], paths):
                            data = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", original_ending)
                            path.write_bytes(data)
                            item["sha256"] = hashlib.sha256(data).hexdigest()
                        data = (json.dumps(manifest, indent=2) + "\n").encode().replace(b"\n", original_ending)
                        previous_digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
                        manifest_path.write_bytes(data)
                        runbook = effort / "goal/runbook.md"
                        runbook.write_bytes(runbook.read_bytes().replace(previous_digest.encode(), hashlib.sha256(data).hexdigest().encode()))
                    target_ending = b"\r\n" if original_ending == b"\n" else b"\n"
                    for path in [*paths, manifest_path]:
                        path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", target_ending))
                    before = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
                    result = self.ctl("context", effort)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertEqual(before, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})
                    (repo / "docs/decision.md").write_bytes(b"changed\r\n")
                    result = self.ctl("context", effort)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("contract input drift", result.stdout)

    def test_contract_changes_beyond_crlf_still_drift(self):
        for change in (b"changed\n", b"accepted \n", b"accepted", b"\xef\xbb\xbfaccepted\n", b"accepted\r"):
            with self.subTest(change=change):
                repo, effort = self.make_repo()
                (repo / "docs/decision.md").write_bytes(change)
                result = self.ctl("context", effort)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("contract input drift", result.stdout)

    def test_contract_baseline_normalizes_mixed_endings_but_not_binary(self):
        repo, effort = self.make_repo()
        manifest = json.loads((effort / "goal/contract-baseline.json").read_bytes())
        self.assertEqual(manifest["hash_mode"], v.CONTRACT_HASH_MODE)
        path = effort / "implementation-plan.md"
        lines = path.read_bytes().replace(b"\r\n", b"\n").split(b"\n")
        path.write_bytes(b"".join(line + (b"\r\n" if i % 2 else b"\n") for i, line in enumerate(lines[:-1])) + lines[-1])
        result = self.ctl("context", effort)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for data in (b"\xff\r\n", b"\x00\r\n"):
            self.assertEqual(v.contract_sha256(data), hashlib.sha256(data).hexdigest())
            self.assertFalse(v.matches_contract_digest(data.replace(b"\r\n", b"\n"), v.contract_sha256(data), legacy=True))

    def test_evidence_fingerprint_stays_byte_sensitive_for_line_endings(self):
        repo, effort = self.make_repo()
        (repo / "src/app.txt").write_bytes(b"ok\n")
        self.complete_g0(effort)
        (repo / "src/app.txt").write_bytes(b"ok\r\n")
        result = self.ctl("context", effort)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("D1: stale", result.stdout)
        result = self.ctl("pass-gate", effort, "--expected-revision", "5")
        self.assertNotEqual(result.returncode, 0)

    def test_manifest_changes_are_not_hidden_by_line_ending_tolerance(self):
        _, effort = self.make_repo()
        path = effort / "goal/contract-baseline.json"
        original = path.read_bytes()
        path.write_bytes(original + b" ")
        result = self.ctl("context", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Manifest SHA-256", result.stdout)
        manifest = json.loads(original)
        manifest["hash_mode"] = "unknown"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        result = self.ctl("context", effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unsupported hash_mode", result.stdout)

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

    def prepare_legacy(self, effort: Path, *, with_scripts: bool = False):
        goal = effort / "goal"
        original = (ROOT / "tests/fixtures/prompt-v2.md").read_bytes()
        (goal / "prompt.md").write_bytes(original.replace(b"{{EFFORT_PATH}}", effort.name.encode()))
        runbook_path = goal / "runbook.md"
        runbook = runbook_path.read_text(encoding="utf-8").split("## Current Checks")[0]
        runbook = runbook.replace("goal-loop/runbook`", "goal-loop/runbook-v2`")
        manifest_path = goal / "contract-baseline.json"
        old_digest = v.sha256(manifest_path)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["schema"] = "goal-loop/contract-baseline-v2"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        runbook = runbook.replace(old_digest, v.sha256(manifest_path))
        # Earlier checkpoints did not include pending manual handoffs in Checks.
        runbook = re.sub(r",? ?M1=started", "", runbook).replace("Checks: ``", "Checks: `none`")
        runbook_path.write_text(runbook, encoding="utf-8")
        for path in (goal / "history").glob("*.md"):
            path.write_bytes(path.read_bytes().replace(b"goal-loop/history`", b"goal-loop/history-v2`"))
        for name in ("goal_loop_ctl.py", "validate_goal_loop.py"):
            if with_scripts:
                (goal / name).write_bytes(b"# saved execution script\n")
            else:
                (goal / name).unlink()
        return {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}

    def reviewed_prompt(self, effort: Path, *, addition: str = "") -> Path:
        candidate = effort.parent / "reviewed-prompt.md"
        text = (ROOT / "references/goal-prompt-template.md").read_text(encoding="utf-8")
        text = text.replace("{{EFFORT_PATH}}", effort.name).replace("{{PYTHON}}", "python" if os.name == "nt" else "python3")
        candidate.write_text(text + addition, encoding="utf-8")
        return candidate

    def refresh(self, effort: Path, *, revision: int | None = None, addition: str = ""):
        return self.ctl("refresh", effort, "--expected-revision", str(self.revision(effort) if revision is None else revision),
                        "--prompt", str(self.reviewed_prompt(effort, addition=addition)))

    def test_refresh_preserves_progress_and_runs_saved_entry(self):
        for with_scripts in (False, True):
            with self.subTest(with_scripts=with_scripts):
                repo, effort = self.make_repo(two_gates=True)
                self.complete_g0(effort)
                self.assertEqual(self.ctl("pass-gate", effort, "--expected-revision", "5").returncode, 0)
                before = self.prepare_legacy(effort, with_scripts=with_scripts)
                result = self.refresh(effort)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                changed = {effort / "goal" / n for n in ("prompt.md", "goal_loop_ctl.py", "validate_goal_loop.py", "runbook.md")}
                backup = next((effort / "goal/backups").iterdir())
                for path, data in before.items():
                    if path in changed:
                        self.assertEqual((backup / path.name).read_bytes(), data)
                    else:
                        self.assertEqual(path.read_bytes(), data)
                self.assertEqual(self.revision(effort), 6)
                prompt = (effort / "goal/prompt.md").read_text(encoding="utf-8")
                command = re.findall(r"^python[^\n]+ context [^\n]+$", prompt, re.MULTILINE)[0]
                argv = shlex.split(command)
                argv[0] = sys.executable
                context = subprocess.run(argv, cwd=repo, capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(context.returncode, 0, context.stdout + context.stderr)
                self.assertIn("Gate: G1: Finish", context.stdout)
                after = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
                repeated = self.refresh(effort)
                self.assertEqual(repeated.returncode, 0, repeated.stdout + repeated.stderr)
                self.assertEqual(after, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})

    def test_refresh_rejects_stale_revision_drift_and_transaction(self):
        for problem in ("revision", "drift", "transaction"):
            with self.subTest(problem=problem):
                repo, effort = self.make_repo()
                self.prepare_legacy(effort)
                if problem == "drift":
                    (repo / "docs/decision.md").write_text("changed", encoding="utf-8")
                elif problem == "transaction":
                    (effort / "goal/.goal-loop-transaction.json").write_text("{}", encoding="utf-8")
                before = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
                result = self.refresh(effort, revision=1 if problem == "revision" else 0)
                self.assertNotEqual(result.returncode, 0)
                expected = {"revision": "stale Revision", "drift": "drift", "transaction": "run recover"}
                self.assertIn(expected[problem], result.stdout + result.stderr)
                self.assertEqual(before, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})

    def test_refresh_preserves_blocked_pending_and_complete_states(self):
        for state in ("blocked", "pending", "complete", "passing"):
            with self.subTest(state=state):
                _, effort = self.make_repo()
                if state == "blocked":
                    result = self.ctl("block", effort, "--expected-revision", "0", "--condition", "SC1", "--next-action", "restore")
                elif state == "pending":
                    result = self.ctl("check", effort, "start", "--expected-revision", "0", "--kind", "Manual acceptance", "--check", "M1", "--result", "ready", "--next-action", "wait")
                else:
                    self.complete_g0(effort)
                    if state == "complete":
                        self.assertEqual(self.ctl("pass-gate", effort, "--expected-revision", "5").returncode, 0)
                before = self.prepare_legacy(effort)
                checkpoint_before = v.parse_checkpoint((effort / "goal/runbook.md").read_text(encoding="utf-8"), [])
                revision = self.revision(effort)
                result = self.refresh(effort)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                checkpoint_after = v.parse_checkpoint((effort / "goal/runbook.md").read_text(encoding="utf-8"), [])
                for key in checkpoint_before:
                    if key != "Checks":
                        self.assertEqual(checkpoint_before[key], checkpoint_after[key])
                self.assertEqual(self.revision(effort), revision)
                for path, data in before.items():
                    if path.name not in {"prompt.md", "runbook.md"}:
                        self.assertEqual(path.read_bytes(), data)
                # The saved facts remain usable without reading historical evidence again.
                (effort / "goal/history/G0.md").write_bytes(b"older notes, no machine-readable events\r\n")
                if state == "pending":
                    result = self.ctl("check", effort, "finish", "--expected-revision", str(revision), "--kind", "Manual acceptance", "--check", "M1", "--acceptance", "G0-M1", "--outcome", "pass", "--result", "accepted", "--next-action", "continue")
                elif state == "passing":
                    result = self.ctl("pass-gate", effort, "--expected-revision", str(revision))
                else:
                    result = self.ctl("context", effort)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_refresh_is_repeatable_and_keeps_reviewed_additions(self):
        _, effort = self.make_repo()
        prompt = effort / "goal/prompt.md"
        addition = "\n每完成一个 slice，向我汇报验证结果。\n"
        prompt.write_text(prompt.read_text(encoding="utf-8") + addition, encoding="utf-8")
        saved_script = effort / "goal/goal_loop_ctl.py"
        saved_script.write_bytes(b"# earlier script\n")
        before = saved_script.read_bytes()
        result = self.refresh(effort, addition=addition)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(saved_script.read_bytes(), CTL.read_bytes())
        self.assertIn(addition.strip(), prompt.read_text(encoding="utf-8"))
        first_backup = next((effort / "goal/backups").iterdir())
        self.assertEqual((first_backup / saved_script.name).read_bytes(), before)
        saved_script.write_bytes(b"# another saved script\n")
        result = self.refresh(effort, addition=addition)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(list((effort / "goal/backups").iterdir())), 2)
        self.assertEqual((first_backup / saved_script.name).read_bytes(), before)
        self.assertEqual(self.revision(effort), 0)

    def test_refresh_requires_reviewed_prompt_and_preview_is_read_only(self):
        _, effort = self.make_repo()
        before = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
        preview = self.ctl("refresh", effort, "--preview")
        self.assertEqual(preview.returncode, 0, preview.stdout + preview.stderr)
        self.assertIn(f'"{effort.name}/goal/goal_loop_ctl.py" context', preview.stdout)
        missing = self.ctl("refresh", effort, "--expected-revision", "0")
        self.assertNotEqual(missing.returncode, 0)
        self.assertEqual(before, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})

    def test_refresh_refuses_unknown_current_facts_without_modifying_records(self):
        _, effort = self.make_repo()
        self.complete_g0(effort)
        self.prepare_legacy(effort)
        (effort / "goal/history/G0.md").write_text("old notes without check evidence", encoding="utf-8")
        before = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
        result = self.refresh(effort)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("current check snapshot is missing", result.stdout + result.stderr)
        self.assertEqual(before, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})

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

    def test_current_checks_survive_opaque_history_and_rule_wording_changes(self):
        _, effort = self.make_repo(two_gates=True)
        self.complete_g0(effort)
        history = effort / "goal/history/G0.md"
        original = b"# Notes\r\nOld layout, irregular numbering and free-form notes.\r\n"
        history.write_bytes(original)
        runbook = effort / "goal/runbook.md"
        runbook.write_text(runbook.read_text(encoding="utf-8").replace(v.STATE_RULES[0], "Follow the saved task contract."), encoding="utf-8")
        result = self.ctl("pass-gate", effort, "--expected-revision", "5")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(history.read_bytes().startswith(original))
        # Even unreadable completed history is not part of startup validation.
        history.write_bytes(b"\xff\xfe archived notes")
        context = self.ctl("context", effort)
        self.assertEqual(context.returncode, 0, context.stdout + context.stderr)
        self.assertIn("Gate: G1: Finish", context.stdout)

    def test_missing_history_does_not_remove_current_checks(self):
        _, effort = self.make_repo()
        self.complete_g0(effort)
        (effort / "goal/history/G0.md").unlink()
        result = self.ctl("pass-gate", effort, "--expected-revision", "5")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_snapshot_is_bounded_and_internal_evidence_stays_out_of_context(self):
        _, effort = self.make_repo()
        sizes, contexts = [], []
        for revision in range(20):
            result = self.ctl("check", effort, "run", "--expected-revision", str(revision), "--check", "R1", "--next-action", "continue")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            sizes.append((effort / "goal/runbook.md").stat().st_size)
            contexts.append(self.ctl("context", effort).stdout)
        self.assertLess(max(sizes) - min(sizes), 50)
        self.assertLess(max(map(len, contexts)) - min(map(len, contexts)), 50)
        text = (effort / "goal/runbook.md").read_text(encoding="utf-8")
        checks = v.parse_current_checks(text, [])
        self.assertEqual(list(checks), ["R1"])
        self.assertIn("R1=pass", contexts[-1])
        self.assertNotIn(checks["R1"].fingerprint, contexts[-1])
        self.assertNotIn("Current Checks", contexts[-1])

    def test_refresh_preserves_pending_object_and_rejects_accepting_changed_inputs(self):
        repo, effort = self.make_repo()
        start = self.ctl("check", effort, "start", "--expected-revision", "0", "--kind", "Manual acceptance", "--check", "M1", "--result", "build reader-42", "--next-action", "wait")
        self.assertEqual(start.returncode, 0, start.stdout + start.stderr)
        before = (effort / "goal/runbook.md").read_bytes()
        self.assertEqual(self.refresh(effort).returncode, 0)
        self.assertEqual((effort / "goal/runbook.md").read_bytes(), before)
        self.assertIn("build reader-42", self.ctl("context", effort).stdout)
        (repo / "src/app.txt").write_text("different build", encoding="utf-8")
        finish = self.ctl("check", effort, "finish", "--expected-revision", "1", "--kind", "Manual acceptance", "--check", "M1", "--acceptance", "G0-M1", "--outcome", "pass", "--result", "accepted old build", "--next-action", "continue")
        self.assertNotEqual(finish.returncode, 0)
        self.assertIn("evidence changed", finish.stdout + finish.stderr)
        self.assertEqual((effort / "goal/runbook.md").read_bytes(), before)
        cancelled = self.ctl("check", effort, "cancel", "--expected-revision", "1", "--kind", "Manual acceptance", "--check", "M1", "--result", "request new build", "--next-action", "start again")
        self.assertEqual(cancelled.returncode, 0, cancelled.stdout + cancelled.stderr)
        self.assertIn("M1=cancelled", self.ctl("context", effort).stdout)

    def test_refresh_and_record_do_not_overlap_another_control_command(self):
        _, effort = self.make_repo()
        spec = importlib.util.spec_from_file_location("goal_loop_ctl_test", CTL)
        ctl = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ctl)
        with ctl.control_lock(effort):
            result = self.refresh(effort)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("another control command is running", result.stdout + result.stderr)

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
        initial_revision = self.revision(effort)
        commands = [
            ("check", "start", "--expected-revision", "0", "--kind", "Directed", "--check", "D1", "--result", "inspected", "--next-action", "finish D1"),
            ("check", "finish", "--expected-revision", "1", "--kind", "Directed", "--check", "D1", "--outcome", "pass", "--result", "accepted", "--next-action", "R1"),
            ("check", "run", "--expected-revision", "2", "--check", "R1", "--next-action", "M1"),
            ("check", "start", "--expected-revision", "3", "--kind", "Manual acceptance", "--check", "M1", "--result", "ready", "--next-action", "wait"),
            ("check", "finish", "--expected-revision", "4", "--kind", "Manual acceptance", "--check", "M1", "--acceptance", "G0-M1", "--outcome", "pass", "--result", "accepted", "--next-action", "pass Gate"),
        ]
        for command in commands:
            command = list(command)
            revision_index = command.index("--expected-revision") + 1
            command[revision_index] = str(initial_revision + int(command[revision_index]))
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
        self.complete_g0(effort)
        history = effort / "goal/history/G0.md"
        before = history.read_bytes().replace(b"\n", b"\r\n")
        history.write_bytes(before)
        candidate = repo / "candidate-plan.md"
        candidate.write_text(plan_text(), encoding="utf-8")
        preview = self.ctl("revise-contract", effort, "--plan", str(candidate), "--mode", "revalidate", "--reason", "accepted clarification")
        self.assertEqual(preview.returncode, 0, preview.stdout + preview.stderr)
        proposal = json.loads(preview.stdout)
        committed = self.ctl("revise-contract", effort, "--plan", str(candidate), "--mode", "revalidate", "--reason", "accepted clarification", "--preview-digest", proposal["digest"], "--expected-revision", "5")
        self.assertEqual(committed.returncode, 0, committed.stdout + committed.stderr)
        self.assertEqual(v.validate(effort), [])
        self.assertTrue(history.read_bytes().startswith(before))
        result = self.ctl("pass-gate", effort, "--expected-revision", "6")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checks incomplete", result.stdout + result.stderr)

    def test_reactivation_retains_successor_history_and_clears_old_results(self):
        repo, effort = self.make_repo(two_gates=True)
        self.complete_g0(effort)
        self.assertEqual(self.ctl("pass-gate", effort, "--expected-revision", "5").returncode, 0)
        self.assertEqual(self.ctl("check", effort, "run", "--expected-revision", "6", "--check", "R1", "--next-action", "pass").returncode, 0)
        histories = {p: p.read_bytes() for p in (effort / "goal/history").glob("*.md")}
        candidate = repo / "candidate-plan.md"
        candidate.write_text(plan_text(True).replace("Prepare the behavior.", "Prepare the clarified behavior."), encoding="utf-8")
        preview = self.ctl("revise-contract", effort, "--plan", str(candidate), "--reason", "clarification")
        committed = self.ctl("revise-contract", effort, "--plan", str(candidate), "--reason", "clarification", "--preview-digest", json.loads(preview.stdout)["digest"], "--expected-revision", "7")
        self.assertEqual(committed.returncode, 0, committed.stdout + committed.stderr)
        self.complete_g0(effort)
        passed = self.ctl("pass-gate", effort, "--expected-revision", str(self.revision(effort)))
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        for path, data in histories.items():
            self.assertTrue(path.read_bytes().startswith(data))
        stale_pass = self.ctl("pass-gate", effort, "--expected-revision", str(self.revision(effort)))
        self.assertNotEqual(stale_pass.returncode, 0)
        self.assertIn("checks incomplete", stale_pass.stdout + stale_pass.stderr)

    def test_completed_effort_can_be_revalidated_without_erasing_history(self):
        repo, effort = self.make_repo()
        self.complete_g0(effort)
        self.assertEqual(self.ctl("pass-gate", effort, "--expected-revision", "5").returncode, 0)
        history = effort / "goal/history/G0.md"
        before = history.read_bytes()
        candidate = repo / "candidate-plan.md"
        candidate.write_text(plan_text(), encoding="utf-8")
        for mode, revision in (("equivalent", 6), ("revalidate", 7)):
            preview = self.ctl("revise-contract", effort, "--plan", str(candidate), "--mode", mode, "--reason", "explicit review")
            commit = self.ctl("revise-contract", effort, "--plan", str(candidate), "--mode", mode, "--reason", "explicit review", "--preview-digest", json.loads(preview.stdout)["digest"], "--expected-revision", str(revision))
            self.assertEqual(commit.returncode, 0, commit.stdout + commit.stderr)
            self.assertIn("State: complete" if mode == "equivalent" else "State: active", self.ctl("context", effort).stdout)
            self.assertTrue(history.read_bytes().startswith(before))

    def test_failed_refresh_transaction_restores_original_bytes(self):
        _, effort = self.make_repo()
        spec = importlib.util.spec_from_file_location("goal_loop_ctl_rollback_test", CTL)
        ctl = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ctl)
        prompt = effort / "goal/prompt.md"
        backup = effort / "goal/backups/refresh-test/prompt.md"
        before = {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()}
        with patch.object(ctl.v, "validate", return_value=["injected failure"]):
            with self.assertRaisesRegex(RuntimeError, "injected failure"):
                ctl.commit_transaction(effort, {prompt: b"replacement", backup: prompt.read_bytes()}, operation="refresh")
        self.assertEqual(before, {p: p.read_bytes() for p in effort.rglob("*") if p.is_file()})


if __name__ == "__main__":
    unittest.main()
