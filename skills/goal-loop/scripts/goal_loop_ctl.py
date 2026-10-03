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
import sys
from pathlib import Path

import validate_goal_loop as v

try:
    import fcntl
except ImportError:  # pragma: no cover - Unix is the primary execution environment.
    fcntl = None


CHECKPOINT_ORDER = (
    "Gate",
    "History",
    "History head",
    "Last event",
    "Last completed slice",
    "Current slice",
    "Satisfied exits",
    "Manual acceptance",
    "Blocker",
    "Risks",
    "Next action",
)

EVENT_BASE_ORDER = (
    "At",
    "Type",
    "Slice",
    "Acceptance",
    "Corrects",
    "Evidence effect",
    "Changed",
    "Verification",
    "Result",
    "Satisfies",
    "Exit evidence",
    "Risk",
    "Next",
    "Prev event hash",
    "Event hash",
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
    return base64.b64decode(data.encode("ascii"))


def _relative_to_effort(path: Path, effort: Path) -> str:
    return path.resolve().relative_to(effort.resolve()).as_posix()


def commit_transaction(
    effort: Path,
    writes: dict[Path, bytes],
    *,
    operation: str,
    expected_revision: int | None,
    target_revision: int | None,
) -> None:
    effort = effort.resolve()
    jpath = journal_path(effort)
    if jpath.exists():
        die("a pending transaction exists; run the recover command first")

    file_entries = []
    for path, after in sorted(writes.items(), key=lambda item: str(item[0])):
        exists = path.exists()
        before = path.read_bytes() if exists else b""
        file_entries.append(
            {
                "path": _relative_to_effort(path, effort),
                "before_exists": exists,
                "before_sha256": v.sha256_bytes(before),
                "after_sha256": v.sha256_bytes(after),
                "before_b64": _encode(before),
                "after_b64": _encode(after),
            }
        )

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

    for entry in entries:
        path = effort / entry["path"]
        atomic_write(path, _decode(entry["after_b64"]))
    errors = v.validate(effort, allow_pending_transaction=True)
    if not errors:
        jpath.unlink()
        print(f"OK: recovered transaction '{journal.get('operation', 'unknown')}'")
        return

    for entry in reversed(entries):
        path = effort / entry["path"]
        if entry.get("before_exists"):
            atomic_write(path, _decode(entry["before_b64"]))
        elif path.exists():
            path.unlink()
    rollback_errors = v.validate(effort, allow_pending_transaction=True)
    if rollback_errors:
        die(
            "transaction target and rollback state are invalid; journal retained for manual recovery: "
            + "; ".join(rollback_errors)
        )
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
    extra_keys = sorted(set(fields) - set(EVENT_BASE_ORDER))
    for key in extra_keys:
        lines.append(f"- {key}: {fields[key]}")
    return "\n".join(lines) + "\n"


def build_event(
    gate: v.Gate,
    history_text: str,
    event_type: str,
    *,
    at: str,
    slice_id: str = "none",
    changed: str = "none",
    verification: str = "none",
    result: str,
    satisfies: str = "none",
    risk: str = "none",
    next_action: str,
    extra_fields: dict[str, str] | None = None,
) -> tuple[str, str, str]:
    errors: list[str] = []
    events = v.parse_history_text(history_text, gate, f"{gate.id}.md", errors)
    if errors:
        die("cannot append to invalid history: " + "; ".join(errors))
    previous = v.tail_event(events)
    sequence = len(events) + 1
    event_id = f"{gate.id}-E{sequence:04d}"
    previous_hash = previous.fields.get("Event hash", "none") if previous else "none"
    fields = {
        "At": at,
        "Type": event_type,
        "Slice": slice_id,
        "Changed": changed,
        "Verification": verification,
        "Result": result,
        "Satisfies": satisfies,
        "Risk": risk,
        "Next": next_action,
        "Prev event hash": previous_hash,
    }
    if extra_fields:
        fields.update(extra_fields)
    fields["Event hash"] = v.compute_event_hash(event_id, event_type, fields)
    separator = "\n" if history_text.endswith("\n") else "\n\n"
    updated = history_text + separator + render_event(event_id, event_type, fields)
    return updated, event_id, fields["Event hash"]


def initial_history(gate: v.Gate, at: str, next_action: str) -> tuple[str, str, str]:
    header = render_history_header(gate)
    # parse_history_text expects at least one event, so construct the first event directly.
    event_id = f"{gate.id}-E0001"
    fields = {
        "At": at,
        "Type": "initialized",
        "Slice": "none",
        "Changed": "none",
        "Verification": "none",
        "Result": "Gate activated; implementation has not started.",
        "Satisfies": "none",
        "Risk": "none",
        "Next": next_action,
        "Prev event hash": "none",
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
            f"| {row.gate} | {row.status} | {row.depends_on} | `{row.plan_contract}` | "
            f"`{row.history}` | `{row.history_head}` | `{row.unlock_evidence}` |"
        )
    return "\n".join(lines)


def render_checkpoint(checkpoint: dict[str, str]) -> str:
    return "\n".join(f"- {key}: `{checkpoint[key]}`" for key in CHECKPOINT_ORDER)


def render_runbook(
    title: str,
    revision: int,
    manifest_hash: str,
    rows: list[v.LedgerRow],
    checkpoint: dict[str, str],
) -> str:
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


def parse_satisfies_arg(raw: str, gate: v.Gate) -> str:
    if raw in v.EMPTY_MARKERS:
        return "none"
    ids = [item.strip() for item in raw.split(",") if item.strip()]
    unknown = [item for item in ids if item not in gate.exits]
    if unknown:
        die(f"unknown Exit ids in --satisfies: {unknown}")
    return ", ".join(ids) if ids else "none"


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
    manifest_hash = v.sha256(manifest_path)
    return {
        "runbook_path": runbook_path,
        "runbook": runbook,
        "title": parse_runbook_title(runbook),
        "revision": revision,
        "plan": plan,
        "rows": rows,
        "checkpoint": checkpoint,
        "index": index,
        "gate": gate,
        "history_path": history_path,
        "history_text": history_text,
        "manifest_path": manifest_path,
        "manifest_hash": manifest_hash,
    }


def checkpoint_after_event(
    state: dict[str, object],
    history_text: str,
    event_id: str,
    event_hash: str,
    *,
    risk: str,
    next_action: str,
    last_completed_slice: str | None = None,
    current_slice: str | None = None,
    manual_acceptance: str | None = None,
    blocker: str | None = None,
) -> dict[str, str]:
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    old: dict[str, str] = dict(state["checkpoint"])  # type: ignore[arg-type]
    errors: list[str] = []
    events = v.parse_history_text(history_text, gate, f"{gate.id}.md", errors)
    if errors:
        die("generated history is invalid: " + "; ".join(errors))
    old.update(
        {
            "Gate": gate.label,
            "History": f"goal/history/{gate.id}.md",
            "History head": event_hash,
            "Last event": event_id,
            "Satisfied exits": format_satisfied(gate, v.effective_satisfied_exits(events)),
            "Risks": risk,
            "Next action": next_action,
        }
    )
    if last_completed_slice is not None:
        old["Last completed slice"] = last_completed_slice
    if current_slice is not None:
        old["Current slice"] = current_slice
    if manual_acceptance is not None:
        old["Manual acceptance"] = manual_acceptance
    if blocker is not None:
        old["Blocker"] = blocker
    return old


def write_state_operation(
    effort: Path,
    state: dict[str, object],
    history_text: str,
    checkpoint: dict[str, str],
    *,
    operation: str,
    extra_writes: dict[Path, bytes] | None = None,
) -> None:
    rows: list[v.LedgerRow] = state["rows"]  # type: ignore[assignment]
    revision: int = state["revision"]  # type: ignore[assignment]
    runbook = render_runbook(
        state["title"],  # type: ignore[arg-type]
        revision + 1,
        state["manifest_hash"],  # type: ignore[arg-type]
        rows,
        checkpoint,
    )
    writes = {
        state["history_path"]: history_text.encode("utf-8"),  # type: ignore[dict-item]
        state["runbook_path"]: runbook.encode("utf-8"),  # type: ignore[dict-item]
    }
    if extra_writes:
        writes.update(extra_writes)
    commit_transaction(
        effort,
        writes,
        operation=operation,
        expected_revision=revision,
        target_revision=revision + 1,
    )
    print(f"OK: {operation}; Revision {revision + 1}")


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
    source_paths = sorted({plan_rel, *plan.contract_sources})
    manifest = baseline_bytes(repo_root, source_paths)
    manifest_hash = v.sha256_bytes(manifest)

    at = args.at or today()
    first_gate = plan.gates[0]
    history_text, init_event, init_hash = initial_history(
        first_gate, at, "select the first slice from the Gate contract"
    )
    rows: list[v.LedgerRow] = []
    for gate in plan.gates:
        if gate.number == 0:
            rows.append(
                v.LedgerRow(
                    gate.label,
                    "active",
                    "none",
                    f"implementation-plan.md -> {gate.label}",
                    f"goal/history/{gate.id}.md",
                    init_hash,
                    "no predecessor",
                )
            )
        else:
            rows.append(
                v.LedgerRow(
                    gate.label,
                    "planned",
                    f"G{gate.number - 1}",
                    f"implementation-plan.md -> {gate.label}",
                    "—",
                    "—",
                    f"G{gate.number - 1} pending",
                )
            )

    checkpoint = {
        "Gate": first_gate.label,
        "History": f"goal/history/{first_gate.id}.md",
        "History head": init_hash,
        "Last event": init_event,
        "Last completed slice": "none",
        "Current slice": "none",
        "Satisfied exits": "none",
        "Manual acceptance": "none",
        "Blocker": "none",
        "Risks": "none",
        "Next action": "select the first slice from the Gate contract",
    }
    title = plan_title(plan_text)
    runbook = render_runbook(title, 0, manifest_hash, rows, checkpoint)

    template_path = Path(__file__).resolve().parents[1] / "references" / "goal-prompt-template.md"
    effort_rel = v.repo_relative(effort, repo_root)
    prompt = template_path.read_text(encoding="utf-8").replace("{{EFFORT_PATH}}", effort_rel)

    writes = {
        effort / "goal" / "contract-baseline.json": manifest,
        effort / "goal" / "runbook.md": runbook.encode("utf-8"),
        effort / "goal" / "prompt.md": prompt.encode("utf-8"),
        effort / "goal" / "history" / "G0.md": history_text.encode("utf-8"),
    }
    commit_transaction(
        effort,
        writes,
        operation="bootstrap",
        expected_revision=None,
        target_revision=0,
    )
    print("OK: bootstrap; Revision 0")


def command_record(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "active":
        die("record requires an active Gate")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    satisfies = parse_satisfies_arg(args.satisfies, gate)
    history, event_id, event_hash = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        args.type,
        at=args.at or today(),
        slice_id=args.slice,
        changed=args.changed,
        verification=args.verification,
        result=args.result,
        satisfies=satisfies,
        risk=args.risk,
        next_action=args.next_action,
    )
    checkpoint = checkpoint_after_event(
        state,
        history,
        event_id,
        event_hash,
        risk=args.risk,
        next_action=args.next_action,
        last_completed_slice=args.last_completed_slice,
        current_slice=args.current_slice,
    )
    rows: list[v.LedgerRow] = state["rows"]  # type: ignore[assignment]
    rows[state["index"]].history_head = event_hash  # type: ignore[index]
    write_state_operation(args.effort, state, history, checkpoint, operation=f"record-{args.type}")


def command_correct(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "active":
        die("correction requires an active Gate")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    satisfies = parse_satisfies_arg(args.satisfies, gate)
    history, event_id, event_hash = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        "correction",
        at=args.at or today(),
        result=args.result,
        satisfies=satisfies,
        verification=args.verification,
        risk=args.risk,
        next_action=args.next_action,
        extra_fields={"Corrects": args.corrects, "Evidence effect": args.evidence_effect},
    )
    checkpoint = checkpoint_after_event(
        state,
        history,
        event_id,
        event_hash,
        risk=args.risk,
        next_action=args.next_action,
    )
    state["rows"][state["index"]].history_head = event_hash  # type: ignore[index]
    write_state_operation(args.effort, state, history, checkpoint, operation="correction")


def command_block(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "active":
        die("block requires an active Gate")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    history, event_id, event_hash = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        "blocked",
        at=args.at or today(),
        result=args.blocker,
        risk=args.risk,
        next_action=args.next_action,
    )
    row.status = "blocked"
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(
        state,
        history,
        event_id,
        event_hash,
        risk=args.risk,
        next_action=args.next_action,
        blocker=args.blocker,
    )
    write_state_operation(args.effort, state, history, checkpoint, operation="block")


def command_resume(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "blocked":
        die("resume requires a blocked Gate")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    history, event_id, event_hash = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        "resumed",
        at=args.at or today(),
        result=args.result,
        risk=args.risk,
        next_action=args.next_action,
    )
    row.status = "active"
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(
        state,
        history,
        event_id,
        event_hash,
        risk=args.risk,
        next_action=args.next_action,
        blocker="none",
    )
    write_state_operation(args.effort, state, history, checkpoint, operation="resume")


def next_acceptance_id(gate: v.Gate, history_text: str) -> str:
    ids = [int(match.group(1)) for match in re.finditer(rf"{gate.id}-A(\d+)", history_text)]
    return f"{gate.id}-A{max(ids, default=0) + 1}"


def command_manual_handoff(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    checkpoint0: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    if row.status != "active":
        die("manual-handoff requires an active Gate")
    if checkpoint0.get("Manual acceptance") != "none":
        die("a manual acceptance is already pending")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    acceptance = next_acceptance_id(gate, state["history_text"])  # type: ignore[arg-type]
    history, event_id, event_hash = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        "manual-handoff",
        at=args.at or today(),
        verification=args.verification,
        result=args.result,
        risk=args.risk,
        next_action=f"wait for explicit result for {acceptance}",
        extra_fields={"Acceptance": acceptance},
    )
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(
        state,
        history,
        event_id,
        event_hash,
        risk=args.risk,
        next_action=f"wait for explicit result for {acceptance}",
        manual_acceptance=f"pending {acceptance}",
    )
    write_state_operation(args.effort, state, history, checkpoint, operation="manual-handoff")
    print(f"Acceptance: {acceptance}")


def command_manual_result(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    checkpoint0: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    if row.status != "active":
        die("manual-result requires an active Gate")
    expected = checkpoint0.get("Manual acceptance", "none")
    if expected != f"pending {args.acceptance}":
        die(f"checkpoint expects '{expected}', not acceptance '{args.acceptance}'")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    if args.outcome == "fail" and args.satisfies not in v.EMPTY_MARKERS:
        die("failed manual acceptance must not satisfy Exit ids")
    satisfies = parse_satisfies_arg(args.satisfies, gate)
    result = f"{args.outcome}: {args.result}"
    history, event_id, event_hash = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        "manual-result",
        at=args.at or today(),
        result=result,
        satisfies=satisfies,
        risk=args.risk,
        next_action=args.next_action,
        extra_fields={"Acceptance": args.acceptance},
    )
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(
        state,
        history,
        event_id,
        event_hash,
        risk=args.risk,
        next_action=args.next_action,
        manual_acceptance="none",
    )
    write_state_operation(args.effort, state, history, checkpoint, operation="manual-result")


def latest_evidence_for_exits(events: dict[str, v.Event], gate: v.Gate) -> dict[str, str]:
    invalidated = v.invalidated_evidence_events(events)
    mapping: dict[str, str] = {}
    for event_id, event in events.items():
        if event_id in invalidated or event.event_type == "gate-passed":
            continue
        for exit_id in event.satisfies:
            mapping[exit_id] = event_id
    missing = [exit_id for exit_id in gate.exits if exit_id not in mapping]
    if missing:
        die(f"cannot pass Gate; missing effective evidence for {missing}")
    return mapping


def command_pass_gate(args: argparse.Namespace) -> None:
    state = current_control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    checkpoint0: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    if row.status != "active":
        die("pass-gate requires an active Gate")
    if checkpoint0.get("Manual acceptance") != "none":
        die("cannot pass Gate while manual acceptance is pending")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    parse_errors: list[str] = []
    events0 = v.parse_history_text(state["history_text"], gate, f"{gate.id}.md", parse_errors)  # type: ignore[arg-type]
    if parse_errors:
        die("current history is invalid: " + "; ".join(parse_errors))
    if v.effective_satisfied_exits(events0) != set(gate.exits):
        die("cannot pass Gate until every Exit has effective evidence")
    if v.unresolved_acceptances(events0):
        die("cannot pass Gate with unresolved manual acceptance")

    at = args.at or today()
    history, _, _ = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        "verification",
        at=at,
        verification=args.verification,
        result=args.result,
        risk=args.risk,
        next_action="record Gate pass after evidence mapping",
    )
    temp_errors: list[str] = []
    events1 = v.parse_history_text(history, gate, f"{gate.id}.md", temp_errors)
    if temp_errors:
        die("generated final verification event is invalid: " + "; ".join(temp_errors))
    evidence = latest_evidence_for_exits(events1, gate)
    exit_evidence = "; ".join(f"{exit_id}={evidence[exit_id]}" for exit_id in gate.exits)
    index: int = state["index"]  # type: ignore[assignment]
    has_successor = index + 1 < len(state["plan"].gates)  # type: ignore[index]
    gate_next = (
        f"activate {state['plan'].gates[index + 1].id} for a subsequent Goal"  # type: ignore[index]
        if has_successor
        else "effort complete"
    )
    history, passed_event, passed_hash = build_event(
        gate,
        history,
        "gate-passed",
        at=at,
        verification=args.verification,
        result="all Gate exit conditions satisfied",
        risk=args.risk,
        next_action=gate_next,
        extra_fields={"Exit evidence": exit_evidence},
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
        successor_history, successor_event, successor_hash = initial_history(
            successor, at, "select the first slice from the Gate contract"
        )
        successor_row = rows[index + 1]
        successor_row.status = "active"
        successor_row.history = f"goal/history/{successor.id}.md"
        successor_row.history_head = successor_hash
        successor_row.unlock_evidence = locator
        checkpoint = {
            "Gate": successor.label,
            "History": f"goal/history/{successor.id}.md",
            "History head": successor_hash,
            "Last event": successor_event,
            "Last completed slice": "none",
            "Current slice": "none",
            "Satisfied exits": "none",
            "Manual acceptance": "none",
            "Blocker": "none",
            "Risks": "none",
            "Next action": "select the first slice from the Gate contract",
        }
        extra_writes[args.effort / "goal" / "history" / f"{successor.id}.md"] = successor_history.encode("utf-8")
    else:
        checkpoint = {
            "Gate": "none",
            "History": "none",
            "History head": passed_hash,
            "Last event": passed_event,
            "Last completed slice": "none",
            "Current slice": "none",
            "Satisfied exits": "all",
            "Manual acceptance": "none",
            "Blocker": "none",
            "Risks": "none",
            "Next action": "effort complete",
        }

    write_state_operation(
        args.effort,
        state,
        history,
        checkpoint,
        operation="pass-gate",
        extra_writes=extra_writes,
    )


def command_reconcile_baseline(args: argparse.Namespace) -> None:
    if not args.confirm_plan_valid:
        die("reconcile-baseline requires --confirm-plan-valid")
    state = current_control(args.effort, args.expected_revision, allow_baseline_drift=True)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    manifest_path: Path = state["manifest_path"]  # type: ignore[assignment]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    repo_root = v.find_repo_root(args.effort)
    current_entries = {item["path"]: item["sha256"] for item in manifest["files"]}
    plan_rel = v.repo_relative(args.effort / "implementation-plan.md", repo_root)
    actual_plan_hash = v.sha256(repo_root / plan_rel)
    if current_entries.get(plan_rel) != actual_plan_hash:
        die("implementation-plan.md changed; recompile and review the Gate contracts instead of reconciling baseline hashes")

    expected_paths = sorted({plan_rel, *state["plan"].contract_sources})  # type: ignore[index]
    if sorted(current_entries) != expected_paths:
        die("Contract Sources path set changed; recompile and review the implementation plan")
    changed = [rel for rel in expected_paths if current_entries[rel] != v.sha256(repo_root / rel)]
    if not changed:
        print("OK: Contract Baseline already matches all contract sources")
        return

    manifest_bytes = baseline_bytes(repo_root, expected_paths)
    manifest_hash = v.sha256_bytes(manifest_bytes)
    result = f"Contract source hashes reconciled after explicit plan-valid confirmation: {', '.join(changed)}; reason: {args.reason}"
    history, event_id, event_hash = build_event(
        gate,
        state["history_text"],  # type: ignore[arg-type]
        "contract-reconciled",
        at=args.at or today(),
        result=result,
        risk=args.risk,
        next_action=args.next_action,
    )
    row.history_head = event_hash
    checkpoint = checkpoint_after_event(
        state,
        history,
        event_id,
        event_hash,
        risk=args.risk,
        next_action=args.next_action,
    )
    state["manifest_hash"] = manifest_hash
    write_state_operation(
        args.effort,
        state,
        history,
        checkpoint,
        operation="reconcile-baseline",
        extra_writes={manifest_path: manifest_bytes},
    )


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

    p = sub.add_parser("record", help="append an execution event and refresh the current checkpoint")
    add_common_mutation_args(p)
    p.add_argument("--type", choices=["slice", "verification", "failure", "checkpoint", "rollback"], required=True)
    p.add_argument("--slice", default="none")
    p.add_argument("--changed", default="none")
    p.add_argument("--verification", default="none")
    p.add_argument("--result", required=True)
    p.add_argument("--satisfies", default="none")
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.add_argument("--last-completed-slice")
    p.add_argument("--current-slice")
    p.set_defaults(func=command_record)

    p = sub.add_parser("correct", help="append a correction without rewriting earlier history bytes")
    add_common_mutation_args(p)
    p.add_argument("--corrects", required=True)
    p.add_argument("--evidence-effect", choices=["retain", "invalidate"], required=True)
    p.add_argument("--verification", default="none")
    p.add_argument("--result", required=True)
    p.add_argument("--satisfies", default="none")
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_correct)

    p = sub.add_parser("block", help="record a declared Stop condition and set the Gate blocked")
    add_common_mutation_args(p)
    p.add_argument("--blocker", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_block)

    p = sub.add_parser("resume", help="record blocker resolution and return the Gate to active")
    add_common_mutation_args(p)
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_resume)

    p = sub.add_parser("manual-handoff", help="create a stable manual acceptance id")
    add_common_mutation_args(p)
    p.add_argument("--verification", default="none")
    p.add_argument("--result", required=True)
    p.add_argument("--risk", default="none")
    p.set_defaults(func=command_manual_handoff)

    p = sub.add_parser("manual-result", help="record an explicit manual acceptance result")
    add_common_mutation_args(p)
    p.add_argument("--acceptance", required=True)
    p.add_argument("--outcome", choices=["pass", "fail"], required=True)
    p.add_argument("--result", required=True)
    p.add_argument("--satisfies", default="none")
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_manual_result)

    p = sub.add_parser("pass-gate", help="record Gate pass evidence and activate only the direct successor")
    add_common_mutation_args(p)
    p.add_argument("--verification", required=True)
    p.add_argument("--result", default="final verification passed")
    p.add_argument("--risk", default="none")
    p.set_defaults(func=command_pass_gate)

    p = sub.add_parser("reconcile-baseline", help="refresh changed contract-source hashes after explicit plan-valid confirmation")
    add_common_mutation_args(p)
    p.add_argument("--confirm-plan-valid", action="store_true")
    p.add_argument("--reason", required=True)
    p.add_argument("--risk", default="none")
    p.add_argument("--next-action", required=True)
    p.set_defaults(func=command_reconcile_baseline)

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
            args.func(args)
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
