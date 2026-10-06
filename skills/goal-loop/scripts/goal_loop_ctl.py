#!/usr/bin/env python3
"""Deterministic state mutations for Goal Loop control-plane artifacts."""

from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import validate_goal_loop as v

try:
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None

CHECKPOINT_ORDER = (
    "Gate", "History", "History head", "Last event", "Last completed slice", "Current slice",
    "Satisfied exits", "Manual acceptance", "Blocker", "Risks", "Next action",
)

EVENT_BASE_ORDER = (
    "At", "Type", "Slice", "Check", "Outcome", "Acceptance", "Stop condition", "Corrects",
    "Evidence effect", "Changed", "Verification", "Evidence snapshot", "Output artifact",
    "Output SHA-256", "Result", "Exit evidence", "Risk", "Next",
    "Prev event hash", "Event hash",
)


def today() -> str:
    return dt.date.today().isoformat()


def die(message: str) -> "NoReturn":
    raise SystemExit(f"ERROR: {message}")


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temp.write_bytes(data)
    os.replace(temp, path)


@contextlib.contextmanager
def control_lock(effort: Path):
    lock_path = effort / "goal" / ".goal-loop.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def journal_path(effort: Path) -> Path:
    return effort / "goal" / ".goal-loop-transaction.json"


def _encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _decode(data: str) -> bytes:
    try:
        return base64.b64decode(data.encode("ascii"), validate=True)
    except Exception as exc:
        die(f"transaction journal contains invalid base64: {exc}")


def _relative_to_effort(path: Path, effort: Path) -> str:
    try:
        return path.resolve().relative_to(effort.resolve()).as_posix()
    except ValueError:
        die(f"transaction target escapes effort directory: {path}")


def _safe_journal_target(effort: Path, raw: str) -> Path:
    if Path(raw).is_absolute() or raw.startswith("../") or "/../" in raw.replace("\\", "/"):
        die(f"transaction journal path is unsafe: {raw}")
    path = (effort / raw).resolve()
    try:
        path.relative_to(effort.resolve())
    except ValueError:
        die(f"transaction journal path escapes effort directory: {raw}")
    return path


def commit_transaction(effort: Path, writes: dict[Path, bytes], *, operation: str,
                       expected_revision: int | None, target_revision: int | None) -> None:
    effort = effort.resolve()
    jpath = journal_path(effort)
    if jpath.exists():
        die("a pending transaction exists; run the recover command first")
    file_entries = []
    for path, after in sorted(writes.items(), key=lambda item: str(item[0])):
        exists = path.exists()
        before = path.read_bytes() if exists else b""
        file_entries.append({
            "path": _relative_to_effort(path, effort),
            "before_exists": exists,
            "before_sha256": v.sha256_bytes(before),
            "after_sha256": v.sha256_bytes(after),
            "before_b64": _encode(before),
            "after_b64": _encode(after),
        })
    journal = {
        "schema": v.TRANSACTION_SCHEMA,
        "operation": operation,
        "expected_revision": expected_revision,
        "target_revision": target_revision,
        "files": file_entries,
    }
    atomic_write(jpath, (json.dumps(journal, indent=2, sort_keys=True) + "\n").encode("utf-8"))
    try:
        for entry in file_entries:
            atomic_write(effort / entry["path"], _decode(entry["after_b64"]))
        errors = v.validate(effort, allow_pending_transaction=True)
        if errors:
            raise RuntimeError("; ".join(errors))
    except Exception:
        for entry in reversed(file_entries):
            path = effort / entry["path"]
            if entry["before_exists"]:
                atomic_write(path, _decode(entry["before_b64"]))
            elif path.exists():
                path.unlink()
        if jpath.exists():
            jpath.unlink()
        raise
    else:
        jpath.unlink()


def recover(effort: Path) -> None:
    effort = effort.resolve()
    jpath = journal_path(effort)
    if not jpath.exists():
        print("OK: no pending goal-loop transaction")
        return
    try:
        journal = json.loads(jpath.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        die(f"transaction journal is not valid JSON: {exc}")
    if journal.get("schema") != v.TRANSACTION_SCHEMA:
        die("transaction journal schema is not recognized")
    entries = journal.get("files")
    if not isinstance(entries, list):
        die("transaction journal files entry is invalid")

    prepared = []
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            die("transaction journal contains an invalid file entry")
        path = _safe_journal_target(effort, entry["path"])
        before = _decode(entry.get("before_b64", ""))
        after = _decode(entry.get("after_b64", ""))
        if v.sha256_bytes(before) != entry.get("before_sha256"):
            die(f"transaction journal before bytes hash mismatch: {entry['path']}")
        if v.sha256_bytes(after) != entry.get("after_sha256"):
            die(f"transaction journal after bytes hash mismatch: {entry['path']}")
        prepared.append((entry, path, before, after))

    for _, path, _, after in prepared:
        atomic_write(path, after)
    errors = v.validate(effort, allow_pending_transaction=True)
    if not errors:
        jpath.unlink()
        print(f"OK: recovered transaction '{journal.get('operation', 'unknown')}'")
        return

    for entry, path, before, _ in reversed(prepared):
        if entry.get("before_exists"):
            atomic_write(path, before)
        elif path.exists():
            path.unlink()
    rollback_errors = v.validate(effort, allow_pending_transaction=True)
    if rollback_errors:
        die("transaction target and rollback state are invalid; journal retained for manual recovery: " + "; ".join(rollback_errors))
    jpath.unlink()
    die("transaction target did not validate; original control-plane state was restored")


def plan_title(plan_text: str) -> str:
    match = re.search(r"(?m)^# (.+?) Implementation Plan\s*$", plan_text)
    if not match:
        die("implementation-plan.md title must end with 'Implementation Plan'")
    return match.group(1).strip()


def parse_runbook_title(runbook: str) -> str:
    match = re.search(r"(?m)^# (.+?) Goal Runbook\s*$", runbook)
    if not match:
        die("runbook title is missing")
    return match.group(1).strip()


def baseline_bytes(repo_root: Path, paths: list[str]) -> bytes:
    files = []
    for rel in sorted(paths):
        path = repo_root / rel
        if not path.exists():
            die(f"contract source does not exist: {rel}")
        files.append({"path": rel, "sha256": v.sha256(path)})
    payload = {"schema": v.BASELINE_SCHEMA, "files": files}
    return (json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def render_history_header(gate: v.Gate) -> str:
    return (
        f"# {gate.label} History\n\n"
        f"Schema: `{v.HISTORY_SCHEMA}`\n"
        f"Plan contract: `implementation-plan.md` -> `{gate.label}`\n\n"
        "## Events\n"
    )


def render_event(event_id: str, event_type: str, fields: dict[str, str]) -> str:
    lines = [f"### {event_id} · {event_type}", ""]
    for key in EVENT_BASE_ORDER:
        if key in fields:
            lines.append(f"- {key}: {fields[key]}")
    for key in sorted(set(fields) - set(EVENT_BASE_ORDER)):
        lines.append(f"- {key}: {fields[key]}")
    return "\n".join(lines) + "\n"


def build_event(gate: v.Gate, history_text: str, event_type: str, *, at: str, slice_id: str = "none",
                changed: str = "none", verification: str = "none", result: str,
                risk: str = "none", next_action: str, extra_fields: dict[str, str] | None = None) -> tuple[str, str, str]:
    errors: list[str] = []
    events = v.parse_history_text(history_text, gate, f"{gate.id}.md", errors)
    if errors:
        die("cannot append to invalid history: " + "; ".join(errors))
    previous = v.tail_event(events)
    event_id = f"{gate.id}-E{len(events) + 1:04d}"
    fields = {
        "At": at,
        "Type": event_type,
        "Slice": slice_id,
        "Changed": changed,
        "Verification": verification,
        "Result": result,
        "Risk": risk,
        "Next": next_action,
        "Prev event hash": previous.fields.get("Event hash", "none") if previous else "none",
    }
    if extra_fields:
        fields.update(extra_fields)
    fields["Event hash"] = v.compute_event_hash(event_id, event_type, fields)
    separator = "\n" if history_text.endswith("\n") else "\n\n"
    return history_text + separator + render_event(event_id, event_type, fields), event_id, fields["Event hash"]


def initial_history(gate: v.Gate, at: str, next_action: str) -> tuple[str, str, str]:
    header = render_history_header(gate)
    event_id = f"{gate.id}-E0001"
    fields = {
        "At": at, "Type": "initialized", "Slice": "none", "Changed": "none", "Verification": "none",
        "Result": "Gate activated; implementation has not started.", "Risk": "none",
        "Next": next_action, "Prev event hash": "none",
    }
    fields["Event hash"] = v.compute_event_hash(event_id, "initialized", fields)
    return header + "\n" + render_event(event_id, "initialized", fields), event_id, fields["Event hash"]


def render_ledger(rows: list[v.LedgerRow]) -> str:
    lines = [
        "| Gate | Status | Depends on | Plan contract | History | History head | Unlock evidence |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row.gate} | {row.status} | {row.depends_on} | `{row.plan_contract}` | `" +
            f"{row.history}` | `{row.history_head}` | `{row.unlock_evidence}` |"
        )
    return "\n".join(lines)


def render_checkpoint(checkpoint: dict[str, str]) -> str:
    return "\n".join(f"- {key}: `{checkpoint[key]}`" for key in CHECKPOINT_ORDER)


def render_runbook(title: str, revision: int, manifest_hash: str, rows: list[v.LedgerRow], checkpoint: dict[str, str]) -> str:
    state_rules = "\n".join(f"- {rule}" for rule in v.STATE_RULES)
    return (
        f"# {title} Goal Runbook\n\n"
        f"Schema: `{v.RUNBOOK_SCHEMA}`\n"
        f"Revision: `{revision}`\n\n"
        "## Contract Baseline\n\n"
        "- Manifest: `goal/contract-baseline.json`\n"
        f"- Manifest SHA-256: `{manifest_hash}`\n\n"
        "## State Rules\n\n"
        f"{state_rules}\n\n"
        "## Goal Ledger\n\n"
        f"{render_ledger(rows)}\n\n"
        "## Current Checkpoint\n\n"
        f"{render_checkpoint(checkpoint)}\n"
    )


def format_satisfied(gate: v.Gate, satisfied: set[str]) -> str:
    if not satisfied:
        return "none"
    if satisfied == set(gate.exits):
        return "all"
    return ", ".join(exit_id for exit_id in gate.exits if exit_id in satisfied)


def current_control(effort: Path, expected_revision: int, *, allow_baseline_drift: bool = False):
    errors = v.validate(effort, allow_baseline_drift=allow_baseline_drift)
    if errors:
        die("control plane is invalid: " + "; ".join(errors))
    runbook_path = effort / "goal" / "runbook.md"
    runbook = runbook_path.read_text(encoding="utf-8")
    parse_errors: list[str] = []
    revision = v.parse_revision(runbook, parse_errors)
    if parse_errors or revision is None:
        die("runbook Revision is invalid")
    if revision != expected_revision:
        die(f"stale Revision: expected {expected_revision}, current {revision}")
    plan_text = (effort / "implementation-plan.md").read_text(encoding="utf-8")
    plan_errors: list[str] = []
    plan = v.parse_plan(plan_text, plan_errors)
    rows = v.parse_ledger(runbook, parse_errors)
    checkpoint = v.parse_checkpoint(runbook, parse_errors)
    if plan_errors or parse_errors:
        die("control plane parsing failed: " + "; ".join(plan_errors + parse_errors))
    current_indices = [i for i, row in enumerate(rows) if row.status in {"active", "blocked"}]
    if len(current_indices) != 1:
        die("mutation requires exactly one active or blocked Gate")
    index = current_indices[0]
    gate = plan.gates[index]
    history_path = effort / rows[index].history
    history_text = history_path.read_text(encoding="utf-8")
    manifest_path = effort / "goal" / "contract-baseline.json"
    return {
        "runbook_path": runbook_path, "runbook": runbook, "title": parse_runbook_title(runbook),
        "revision": revision, "plan": plan, "rows": rows, "checkpoint": checkpoint, "index": index,
        "gate": gate, "history_path": history_path, "history_text": history_text,
        "manifest_path": manifest_path, "manifest_hash": v.sha256(manifest_path),
        "repo_root": v.find_repo_root(effort),
    }


def ensure_active(state: dict[str, object], operation: str) -> v.LedgerRow:
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "active":
        die(f"{operation} requires an active Gate")
    return row


def ensure_no_pending_manual(state: dict[str, object], operation: str) -> None:
    checkpoint: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    if checkpoint.get("Manual acceptance") != "none":
        die(f"{operation} is not allowed while manual acceptance is pending")


def checkpoint_after_event(state: dict[str, object], history_text: str, event_id: str, event_hash: str, *,
                           risk: str, next_action: str, last_completed_slice: str | None = None,
                           current_slice: str | None = None, manual_acceptance: str | None = None,
                           blocker: str | None = None) -> dict[str, str]:
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    old: dict[str, str] = dict(state["checkpoint"])  # type: ignore[arg-type]
    errors: list[str] = []
    events = v.parse_history_text(history_text, gate, f"{gate.id}.md", errors)
    if errors:
        die("generated history is invalid: " + "; ".join(errors))
    old.update({
        "Gate": gate.label,
        "History": f"goal/history/{gate.id}.md",
        "History head": event_hash,
        "Last event": event_id,
        "Satisfied exits": format_satisfied(gate, v.effective_satisfied_exits(events, gate)),
        "Risks": risk,
        "Next action": next_action,
    })
    if last_completed_slice is not None:
        old["Last completed slice"] = last_completed_slice
    if current_slice is not None:
        old["Current slice"] = current_slice
    if manual_acceptance is not None:
        old["Manual acceptance"] = manual_acceptance
    if blocker is not None:
        old["Blocker"] = blocker
    return old


def write_state_operation(effort: Path, state: dict[str, object], history_text: str, checkpoint: dict[str, str], *,
                          operation: str, extra_writes: dict[Path, bytes] | None = None) -> None:
    rows: list[v.LedgerRow] = state["rows"]  # type: ignore[assignment]
    revision: int = state["revision"]  # type: ignore[assignment]
    runbook = render_runbook(state["title"], revision + 1, state["manifest_hash"], rows, checkpoint)  # type: ignore[arg-type]
    writes = {
        state["history_path"]: history_text.encode("utf-8"),  # type: ignore[dict-item]
        state["runbook_path"]: runbook.encode("utf-8"),  # type: ignore[dict-item]
    }
    if extra_writes:
        writes.update(extra_writes)
    commit_transaction(effort, writes, operation=operation, expected_revision=revision, target_revision=revision + 1)
    print(f"OK: {operation}; Revision {revision + 1}")


def current_prompt_bytes(effort: Path) -> bytes:
    repo_root = v.find_repo_root(effort)
    effort_rel = v.repo_relative(effort, repo_root)
    template_path = Path(__file__).resolve().parents[1] / "references" / "goal-prompt-template.md"
    return template_path.read_text(encoding="utf-8").replace("{{EFFORT_PATH}}", effort_rel).encode("utf-8")


def command_bootstrap(args: argparse.Namespace) -> None:
    effort = args.effort.resolve()
    plan_path = effort / "implementation-plan.md"
    if not plan_path.exists():
        die(f"missing implementation plan: {plan_path}")
    if (effort / "goal" / "runbook.md").exists():
        die("goal/runbook.md already exists; bootstrap does not overwrite an existing control plane")
    plan_text = plan_path.read_text(encoding="utf-8")
    errors: list[str] = []
    plan = v.parse_plan(plan_text, errors)
    if errors:
        die("implementation plan is invalid: " + "; ".join(errors))
    if not plan.gates:
        die("implementation plan has no Gates")
    repo_root = v.find_repo_root(effort)
    plan_rel = v.repo_relative(plan_path, repo_root)
    manifest = baseline_bytes(repo_root, sorted({plan_rel, *plan.contract_sources}))
    manifest_hash = v.sha256_bytes(manifest)
    at = args.at or today()
    first_gate = plan.gates[0]
    history_text, init_event, init_hash = initial_history(first_gate, at, "select the first slice from the Gate contract")
    rows: list[v.LedgerRow] = []
    for gate in plan.gates:
        if gate.number == 0:
            rows.append(v.LedgerRow(gate.label, "active", "none", f"implementation-plan.md -> {gate.label}",
                                    f"goal/history/{gate.id}.md", init_hash, "no predecessor"))
        else:
            rows.append(v.LedgerRow(gate.label, "planned", f"G{gate.number - 1}",
                                    f"implementation-plan.md -> {gate.label}", "—", "—", f"G{gate.number - 1} pending"))
    checkpoint = {
        "Gate": first_gate.label, "History": f"goal/history/{first_gate.id}.md", "History head": init_hash,
        "Last event": init_event, "Last completed slice": "none", "Current slice": "none",
        "Satisfied exits": "none", "Manual acceptance": "none", "Blocker": "none", "Risks": "none",
        "Next action": "select the first slice from the Gate contract",
    }
    prompt = current_prompt_bytes(effort)
    if v.prompt_schema(prompt.decode("utf-8")) != v.PROMPT_SCHEMA:
        die(f"prompt template must declare {v.PROMPT_SCHEMA}")
    writes = {
        effort / "goal" / "contract-baseline.json": manifest,
        effort / "goal" / "runbook.md": render_runbook(plan_title(plan_text), 0, manifest_hash, rows, checkpoint).encode("utf-8"),
        effort / "goal" / "prompt.md": prompt,
        effort / "goal" / "history" / "G0.md": history_text.encode("utf-8"),
    }
    commit_transaction(effort, writes, operation="bootstrap", expected_revision=None, target_revision=0)
    print("OK: bootstrap; Revision 0")


def command_record(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "record")
    ensure_no_pending_manual(state, "record")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    history, event_id, event_hash = build_event(
        gate, state["history_text"], args.type, at=args.at or today(), slice_id=args.slice,  # type: ignore[arg-type]
        changed=args.changed, verification=args.verification, result=args.result,
        risk=args.risk, next_action=args.next_action,
    )
    checkpoint = checkpoint_after_event(
        state, history, event_id, event_hash, risk=args.risk, next_action=args.next_action,
        last_completed_slice=args.last_completed_slice, current_slice=args.current_slice,
    )
    row.history_head = event_hash
    write_state_operation(args.effort, state, history, checkpoint, operation=f"record-{args.type}")


def command_verify_directed(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "verify-directed")
    ensure_no_pending_manual(state, "verify-directed")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    check = gate.checks.get(args.check)
    if check is None or check.kind != "Directed":
        die(f"{args.check} is not a declared Directed verification check for {gate.id}")
    snapshot, missing = v.evidence_snapshot(state["repo_root"], check)  # type: ignore[arg-type]
    if args.outcome == "pass" and missing:
        die(f"cannot record passing {args.check}; Evidence inputs match no files: {missing}")
    extra = {"Check": check.id, "Outcome": args.outcome, "Evidence snapshot": snapshot}
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "verification", at=args.at or today(),  # type: ignore[arg-type]
        verification=f"directed {check.id}: {args.verification}", result=args.result, risk=args.risk,
        next_action=args.next_action, extra_fields=extra,
    )
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk, next_action=args.next_action)
    write_state_operation(args.effort, state, history, checkpoint, operation=f"verify-directed-{check.id}")


def _repository_log(check: v.VerificationCheck, command: str, completed: subprocess.CompletedProcess[bytes]) -> bytes:
    header = (
        f"Check: {check.id}\nCommand: {command}\nExit code: {completed.returncode}\n"
        "--- stdout ---\n"
    ).encode("utf-8")
    return header + (completed.stdout or b"") + b"\n--- stderr ---\n" + (completed.stderr or b"") + b"\n"


def command_verify_repository(args: argparse.Namespace) -> int:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "verify-repository")
    ensure_no_pending_manual(state, "verify-repository")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    check = gate.checks.get(args.check)
    if check is None or check.kind != "Repository":
        die(f"{args.check} is not a declared Repository verification check for {gate.id}")
    command = check.description
    completed = subprocess.run(command, cwd=state["repo_root"], shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # type: ignore[arg-type]
    outcome = "pass" if completed.returncode == 0 else "fail"
    snapshot, missing = v.evidence_snapshot(state["repo_root"], check)  # type: ignore[arg-type]
    if outcome == "pass" and missing:
        die(f"repository check passed but Evidence inputs match no files: {missing}")

    # Predict the next event id so the output artifact has a stable name.
    parse_errors: list[str] = []
    events = v.parse_history_text(state["history_text"], gate, f"{gate.id}.md", parse_errors)  # type: ignore[arg-type]
    if parse_errors:
        die("current history is invalid: " + "; ".join(parse_errors))
    next_event_id = f"{gate.id}-E{len(events) + 1:04d}"
    log_bytes = _repository_log(check, command, completed)
    log_rel = f"goal/evidence/{next_event_id}-{check.id}.log"
    log_path = args.effort / log_rel
    extra = {
        "Check": check.id,
        "Outcome": outcome,
        "Evidence snapshot": snapshot,
        "Output artifact": log_rel,
        "Output SHA-256": v.sha256_bytes(log_bytes),
    }
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "verification", at=args.at or today(),  # type: ignore[arg-type]
        verification=f"repository {check.id}; exit_code={completed.returncode}",
        result=args.result or f"repository check {check.id} {outcome}", risk=args.risk,
        next_action=args.next_action, extra_fields=extra,
    )
    if event_id != next_event_id:
        die("internal event id prediction mismatch")
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk, next_action=args.next_action)
    write_state_operation(args.effort, state, history, checkpoint, operation=f"verify-repository-{check.id}",
                          extra_writes={log_path: log_bytes})
    if completed.stdout:
        sys.stdout.buffer.write(completed.stdout[-4000:])
        if not completed.stdout.endswith(b"\n"):
            print()
    if completed.stderr:
        sys.stderr.buffer.write(completed.stderr[-4000:])
        if not completed.stderr.endswith(b"\n"):
            print(file=sys.stderr)
    if outcome == "fail":
        print(f"CHECK FAIL: {check.id}; exit code {completed.returncode}", file=sys.stderr)
        return 2
    print(f"CHECK PASS: {check.id}")
    return 0


def command_correct(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "correction")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "correction", at=args.at or today(),  # type: ignore[arg-type]
        result=args.result, verification=args.verification, risk=args.risk,
        next_action=args.next_action, extra_fields={"Corrects": args.corrects, "Evidence effect": args.evidence_effect},
    )
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk, next_action=args.next_action)
    row.history_head = event_hash
    write_state_operation(args.effort, state, history, checkpoint, operation="correction")


def command_block(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "block")
    ensure_no_pending_manual(state, "block")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    if args.condition not in gate.stop_conditions:
        die(f"unknown Stop condition {args.condition}; declared: {sorted(gate.stop_conditions)}")
    desc = gate.stop_conditions[args.condition]
    blocker = f"{args.condition}: {desc}"
    if args.details:
        blocker += f"; {args.details}"
    extra: dict[str, str] = {"Stop condition": args.condition}
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "blocked", at=args.at or today(),  # type: ignore[arg-type]
        result=blocker, risk=args.risk, next_action=args.next_action, extra_fields=extra,
    )
    row.status = "blocked"
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk,
                                        next_action=args.next_action, blocker=blocker)
    write_state_operation(args.effort, state, history, checkpoint, operation="block")


def command_resume(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "blocked":
        die("resume requires a blocked Gate")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "resumed", at=args.at or today(), result=args.result,  # type: ignore[arg-type]
        risk=args.risk, next_action=args.next_action,
    )
    row.status = "active"
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk,
                                        next_action=args.next_action, blocker="none")
    write_state_operation(args.effort, state, history, checkpoint, operation="resume")


def command_manual_handoff(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "manual-handoff")
    checkpoint0: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    if checkpoint0.get("Manual acceptance") != "none":
        die("a manual acceptance is already pending")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    check = gate.checks.get(args.acceptance)
    if check is None or check.kind != "Manual acceptance":
        die(f"{args.acceptance} is not a declared Manual acceptance check")
    acceptance = f"{gate.id}-{check.id}"
    extra: dict[str, str] = {"Check": check.id, "Acceptance": acceptance}
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "manual-handoff", at=args.at or today(), verification=args.verification,  # type: ignore[arg-type]
        result=args.result, risk=args.risk, next_action=f"wait for explicit result for {acceptance}", extra_fields=extra,
    )
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk,
                                        next_action=f"wait for explicit result for {acceptance}",
                                        manual_acceptance=f"pending {acceptance}")
    write_state_operation(args.effort, state, history, checkpoint, operation="manual-handoff")
    print(f"Acceptance: {acceptance}")


def command_manual_result(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "manual-result")
    checkpoint0: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    expected = checkpoint0.get("Manual acceptance", "none")
    if expected != f"pending {args.acceptance}":
        die(f"checkpoint expects '{expected}', not acceptance '{args.acceptance}'")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    extra = {"Acceptance": args.acceptance, "Outcome": args.outcome}
    prefix = f"{gate.id}-"
    if not args.acceptance.startswith(prefix):
        die("acceptance id does not match current Gate")
    check_id = args.acceptance[len(prefix):]
    check = gate.checks.get(check_id)
    if check is None or check.kind != "Manual acceptance":
        die(f"acceptance {args.acceptance} does not map to a declared Manual acceptance check")
    snapshot, missing = v.evidence_snapshot(state["repo_root"], check)  # type: ignore[arg-type]
    if args.outcome == "pass" and missing:
        die(f"cannot record passing {check_id}; Evidence inputs match no files: {missing}")
    extra.update({"Check": check_id, "Evidence snapshot": snapshot})
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "manual-result", at=args.at or today(), result=f"{args.outcome}: {args.result}",  # type: ignore[arg-type]
        risk=args.risk, next_action=args.next_action, extra_fields=extra,
    )
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk,
                                        next_action=args.next_action, manual_acceptance="none")
    write_state_operation(args.effort, state, history, checkpoint, operation="manual-result")


def exit_evidence(state: dict[str, object], events: dict[str, v.Event]) -> dict[str, list[tuple[str, str]]]:
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    latest = v.latest_effective_check_events(events, gate)
    stale = v.stale_check_evidence(state["repo_root"], gate, events)  # type: ignore[arg-type]
    problems: list[str] = []
    mapping: dict[str, list[tuple[str, str]]] = {}
    for exit_id, required in gate.evidence_rules.items():
        refs: list[tuple[str, str]] = []
        for check_id in required:
            event = latest.get(check_id)
            if event is None:
                problems.append(f"{exit_id}:{check_id}=missing")
            elif event.fields.get("Outcome") != "pass":
                problems.append(f"{exit_id}:{check_id}=latest-{event.fields.get('Outcome')}")
            elif check_id in stale:
                problems.append(f"{exit_id}:{check_id}=stale ({stale[check_id]})")
            else:
                refs.append((check_id, event.event_id))
        mapping[exit_id] = refs
    if problems:
        die("cannot pass Gate; Verification evidence is incomplete or stale: " + "; ".join(problems))
    return mapping


def command_pass_gate(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row = ensure_active(state, "pass-gate")
    checkpoint0: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    if checkpoint0.get("Manual acceptance") != "none":
        die("cannot pass Gate while manual acceptance is pending")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    parse_errors: list[str] = []
    events0 = v.parse_history_text(state["history_text"], gate, f"{gate.id}.md", parse_errors)  # type: ignore[arg-type]
    if parse_errors:
        die("current history is invalid: " + "; ".join(parse_errors))
    if v.unresolved_acceptances(events0):
        die("cannot pass Gate with unresolved manual acceptance")

    check_map = exit_evidence(state, events0)
    exit_evidence_value = "; ".join(
        f"{exit_id}=" + ",".join(f"{cid}@{eid}" for cid, eid in check_map[exit_id])
        for exit_id in gate.exits
    )

    at = args.at or today()
    final_verification = args.verification or "all declared checks are passing and fresh"
    history, _, _ = build_event(
        gate, state["history_text"], "verification", at=at, verification=final_verification,  # type: ignore[arg-type]
        result=args.result, risk=args.risk, next_action="record Gate pass after evidence mapping",
    )
    index: int = state["index"]  # type: ignore[assignment]
    has_successor = index + 1 < len(state["plan"].gates)  # type: ignore[index]
    gate_next = f"activate {state['plan'].gates[index + 1].id} for a subsequent Goal" if has_successor else "effort complete"  # type: ignore[index]
    history, passed_event, passed_hash = build_event(
        gate, history, "gate-passed", at=at, verification=final_verification,
        result="all Gate exit conditions satisfied by effective evidence", risk=args.risk,
        next_action=gate_next, extra_fields={"Exit evidence": exit_evidence_value},
    )

    rows: list[v.LedgerRow] = state["rows"]  # type: ignore[assignment]
    current = rows[index]
    current.status = "passed"
    current.history_head = passed_hash
    locator = f"goal/history/{gate.id}.md@{passed_event}#{passed_hash}"
    current.unlock_evidence = locator
    extra_writes: dict[Path, bytes] = {}
    if has_successor:
        successor: v.Gate = state["plan"].gates[index + 1]  # type: ignore[index]
        successor_history, successor_event, successor_hash = initial_history(successor, at, "select the first slice from the Gate contract")
        successor_row = rows[index + 1]
        successor_row.status = "active"
        successor_row.history = f"goal/history/{successor.id}.md"
        successor_row.history_head = successor_hash
        successor_row.unlock_evidence = locator
        checkpoint = {
            "Gate": successor.label, "History": f"goal/history/{successor.id}.md", "History head": successor_hash,
            "Last event": successor_event, "Last completed slice": "none", "Current slice": "none",
            "Satisfied exits": "none", "Manual acceptance": "none", "Blocker": "none", "Risks": "none",
            "Next action": "select the first slice from the Gate contract",
        }
        extra_writes[args.effort / "goal" / "history" / f"{successor.id}.md"] = successor_history.encode("utf-8")
    else:
        checkpoint = {
            "Gate": "none", "History": "none", "History head": passed_hash, "Last event": passed_event,
            "Last completed slice": "none", "Current slice": "none", "Satisfied exits": "all",
            "Manual acceptance": "none", "Blocker": "none", "Risks": "none", "Next action": "effort complete",
        }
    write_state_operation(args.effort, state, history, checkpoint, operation="pass-gate", extra_writes=extra_writes)


def command_reconcile_baseline(args: argparse.Namespace) -> None:
    if not args.confirm_plan_valid:
        die("reconcile-baseline requires --confirm-plan-valid")
    state = current_control(args.effort, args.expected_revision, allow_baseline_drift=True)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    manifest_path: Path = state["manifest_path"]  # type: ignore[assignment]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    repo_root: Path = state["repo_root"]  # type: ignore[assignment]
    current_entries = {item["path"]: item["sha256"] for item in manifest["files"]}
    plan_rel = v.repo_relative(args.effort / "implementation-plan.md", repo_root)
    actual_plan_hash = v.sha256(repo_root / plan_rel)
    if current_entries.get(plan_rel) != actual_plan_hash:
        die("implementation-plan.md changed; recompile and review Gate contracts instead of reconciling baseline hashes")
    expected_paths = sorted({plan_rel, *state["plan"].contract_sources})  # type: ignore[index]
    if sorted(current_entries) != expected_paths:
        die("Contract Sources path set changed; recompile and review implementation-plan.md")
    changed = [rel for rel in expected_paths if current_entries[rel] != v.sha256(repo_root / rel)]
    if not changed:
        print("OK: Contract Baseline already matches all contract sources")
        return
    manifest_bytes = baseline_bytes(repo_root, expected_paths)
    manifest_hash = v.sha256_bytes(manifest_bytes)
    result = f"Contract source hashes reconciled after explicit Gate-contract confirmation: {', '.join(changed)}; reason: {args.reason}"
    history, event_id, event_hash = build_event(
        gate, state["history_text"], "contract-reconciled", at=args.at or today(), result=result,  # type: ignore[arg-type]
        risk=args.risk, next_action=args.next_action,
    )
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(state, history, event_id, event_hash, risk=args.risk, next_action=args.next_action)
    state["manifest_hash"] = manifest_hash
    write_state_operation(args.effort, state, history, checkpoint, operation="reconcile-baseline",
                          extra_writes={manifest_path: manifest_bytes})


def command_status(args: argparse.Namespace) -> int:
    effort = args.effort.resolve()
    errors = v.validate(effort)
    if errors:
        print("Status: invalid")
        for error in errors:
            print(f"- {error}")
        return 1
    runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
    parse_errors: list[str] = []
    revision = v.parse_revision(runbook, parse_errors)
    rows = v.parse_ledger(runbook, parse_errors)
    checkpoint = v.parse_checkpoint(runbook, parse_errors)
    plan_errors: list[str] = []
    plan = v.parse_plan((effort / "implementation-plan.md").read_text(encoding="utf-8"), plan_errors)
    current_index = next((i for i, row in enumerate(rows) if row.status in {"active", "blocked"}), None)
    print(f"Revision: {revision}")
    if current_index is None:
        print("Gate: none")
        print("State: complete")
        return 0
    row = rows[current_index]
    gate = plan.gates[current_index]
    print(f"Gate: {gate.label}")
    print(f"State: {row.status}")
    print(f"Manual acceptance: {checkpoint.get('Manual acceptance')}")
    print(f"Satisfied exits: {checkpoint.get('Satisfied exits')}")
    print(f"Next action: {checkpoint.get('Next action')}")
    hist_errors: list[str] = []
    events = v.parse_history(effort / row.history, gate, hist_errors)
    stale = v.stale_check_evidence(v.find_repo_root(effort), gate, events)
    print("Stale checks: " + (", ".join(f"{k} ({reason})" for k, reason in stale.items()) if stale else "none"))
    return 0


def command_context(args: argparse.Namespace) -> int:
    effort = args.effort.resolve()
    errors = v.validate(effort)
    if errors:
        print("ERROR: control plane is invalid: " + "; ".join(errors), file=sys.stderr)
        return 1
    runbook = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
    parse_errors: list[str] = []
    revision = v.parse_revision(runbook, parse_errors)
    rows = v.parse_ledger(runbook, parse_errors)
    checkpoint = v.parse_checkpoint(runbook, parse_errors)
    plan_errors: list[str] = []
    plan = v.parse_plan((effort / "implementation-plan.md").read_text(encoding="utf-8"), plan_errors)
    index = next((i for i, row in enumerate(rows) if row.status in {"active", "blocked"}), None)
    if index is None:
        print(f"Revision: {revision}\nGate: none\nNext action: effort complete")
        return 0
    gate = plan.gates[index]
    print(f"Revision: {revision}")
    print(f"Gate: {gate.label}")
    print(f"Status: {rows[index].status}")
    print(f"Checkpoint: {json.dumps(checkpoint, ensure_ascii=False, sort_keys=True)}")
    print("Contract Sources:")
    for source in plan.contract_sources:
        print(f"- {source}")
    print("\nCurrent Gate contract:\n")
    print(f"## {gate.label}\n\n{gate.body}")
    return 0


def add_common_mutation_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("effort", type=Path)
    parser.add_argument("--expected-revision", type=int, required=True)
    parser.add_argument("--at", help="event date in YYYY-MM-DD; defaults to local date")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Goal Loop deterministic state control")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("bootstrap", help="create the control plane from implementation-plan.md")
    p.add_argument("effort", type=Path)
    p.add_argument("--at")
    p.set_defaults(func=command_bootstrap)

    p = sub.add_parser("record", help="append a non-check execution event and refresh the checkpoint")
    add_common_mutation_args(p)
    p.add_argument("--type", choices=["slice", "verification", "failure", "checkpoint", "rollback"], required=True)
    p.add_argument("--slice", default="none")
    p.add_argument("--changed", default="none")
    p.add_argument("--verification", default="none")
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.add_argument("--last-completed-slice")
    p.add_argument("--current-slice")
    p.set_defaults(func=command_record)

    p = sub.add_parser("verify-directed", help="record a declared Directed check result with an evidence snapshot")
    add_common_mutation_args(p)
    p.add_argument("--check", required=True)
    p.add_argument("--outcome", choices=["pass", "fail"], required=True)
    p.add_argument("--verification", required=True)
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_verify_directed)

    p = sub.add_parser("verify-repository", help="execute a declared Repository check and persist its output artifact")
    add_common_mutation_args(p)
    p.add_argument("--check", required=True)
    p.add_argument("--result")
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_verify_repository)

    p = sub.add_parser("correct", help="append a correction without rewriting earlier history bytes")
    add_common_mutation_args(p)
    p.add_argument("--corrects", required=True)
    p.add_argument("--evidence-effect", choices=["retain", "invalidate"], required=True)
    p.add_argument("--verification", default="none")
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_correct)

    p = sub.add_parser("block", help="record a declared Stop condition and set the Gate blocked")
    add_common_mutation_args(p)
    p.add_argument("--condition", required=True, help="declared Stop condition id such as SC1")
    p.add_argument("--details")
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_block)

    p = sub.add_parser("resume", help="record blocker resolution and return the Gate to active")
    add_common_mutation_args(p)
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_resume)

    p = sub.add_parser("manual-handoff", help="open a declared Manual acceptance check")
    add_common_mutation_args(p)
    p.add_argument("--acceptance", required=True, help="declared Manual acceptance check id such as M1")
    p.add_argument("--verification", default="none")
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.set_defaults(func=command_manual_handoff)

    p = sub.add_parser("manual-result", help="record the explicit result for a pending Manual acceptance")
    add_common_mutation_args(p)
    p.add_argument("--acceptance", required=True)
    p.add_argument("--outcome", choices=["pass", "fail"], required=True)
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_manual_result)

    p = sub.add_parser("pass-gate", help="record Gate pass after required evidence is complete and fresh")
    add_common_mutation_args(p)
    p.add_argument("--verification")
    p.add_argument("--result", default="final verification passed")
    p.add_argument("--risk", default="none")
    p.set_defaults(func=command_pass_gate)

    p = sub.add_parser("reconcile-baseline", help="refresh changed contract-source hashes after explicit Gate-contract confirmation")
    add_common_mutation_args(p)
    p.add_argument("--confirm-plan-valid", action="store_true")
    p.add_argument("--reason", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_reconcile_baseline)

    p = sub.add_parser("status", help="show current control-plane status and stale evidence")
    p.add_argument("effort", type=Path)
    p.set_defaults(func=command_status)

    p = sub.add_parser("context", help="print the minimal current Gate execution context")
    p.add_argument("effort", type=Path)
    p.set_defaults(func=command_context)

    p = sub.add_parser("recover", help="complete or roll back a pending state transaction")
    p.add_argument("effort", type=Path)
    p.set_defaults(func=lambda args: recover(args.effort))
    return parser


def main() -> int:
    args = build_parser().parse_args()
    effort = args.effort.resolve()
    with control_lock(effort):
        try:
            args.effort = effort
            result = args.func(args)
            return int(result or 0)
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
