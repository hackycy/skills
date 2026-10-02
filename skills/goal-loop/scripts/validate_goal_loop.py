#!/usr/bin/env python3
"""Validate Goal Loop v2 artifacts using only the Python standard library."""

from __future__ import annotations

import argparse
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

RUNBOOK_SCHEMA = "goal-loop/runbook-v2"
HISTORY_SCHEMA = "goal-loop/history-v1"
REQUIRED_GATE_HEADINGS = (
    "Purpose",
    "Inputs",
    "Objective",
    "Scope boundary",
    "Constraints",
    "Slice policy",
    "Verification",
    "Evidence rule",
    "Stop conditions",
    "Rollback",
    "Exit conditions",
)


@dataclass
class Gate:
    number: int
    name: str
    exits: list[str]

    @property
    def id(self) -> str:
        return f"G{self.number}"

    @property
    def label(self) -> str:
        return f"{self.id}: {self.name}"


@dataclass
class LedgerRow:
    gate: str
    status: str
    depends_on: str
    plan_contract: str
    history: str
    unlock_evidence: str


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def section(text: str, heading: str, next_level: int = 2) -> str | None:
    prefix = "#" * next_level
    pattern = re.compile(
        rf"(?ms)^{re.escape(prefix + ' ' + heading)}\s*\n(.*?)(?=^{re.escape(prefix + ' ')}|\Z)"
    )
    match = pattern.search(text)
    return match.group(1).strip() if match else None


def parse_plan(text: str, errors: list[str]) -> list[Gate]:
    gate_matches = list(re.finditer(r"(?m)^## G(\d+): (.+?)\s*$", text))
    if not gate_matches:
        errors.append("plan: no Gate detail headings found")
        return []

    gates: list[Gate] = []
    for index, match in enumerate(gate_matches):
        number = int(match.group(1))
        name = match.group(2).strip()
        body_start = match.end()
        body_end = gate_matches[index + 1].start() if index + 1 < len(gate_matches) else len(text)
        body = text[body_start:body_end]

        for heading in REQUIRED_GATE_HEADINGS:
            if not re.search(rf"(?m)^### {re.escape(heading)}\s*$", body):
                errors.append(f"plan: G{number} missing '### {heading}'")

        exit_match = re.search(
            r"(?ms)^### Exit conditions\s*\n(.*?)(?=^### |\Z)", body
        )
        exits = re.findall(r"(?m)^-\s+`(E\d+)`:\s+.+$", exit_match.group(1) if exit_match else "")
        expected = [f"E{i}" for i in range(1, len(exits) + 1)]
        if not exits:
            errors.append(f"plan: G{number} has no numbered Exit conditions")
        elif exits != expected:
            errors.append(f"plan: G{number} Exit ids must be continuous from E1; got {exits}")

        evidence_match = re.search(
            r"(?ms)^### Evidence rule\s*\n(.*?)(?=^### |\Z)", body
        )
        evidence_exits = []
        if evidence_match:
            for line in evidence_match.group(1).splitlines():
                cells = [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
                if cells and re.fullmatch(r"E\d+", cells[0] if cells else ""):
                    evidence_exits.append(cells[0])
        if exits and sorted(set(evidence_exits), key=lambda x: int(x[1:])) != exits:
            errors.append(
                f"plan: G{number} Evidence rule must cover exactly {exits}; got {sorted(set(evidence_exits), key=lambda x: int(x[1:]))}"
            )

        gates.append(Gate(number=number, name=name, exits=exits))

    expected_numbers = list(range(len(gates)))
    numbers = [gate.number for gate in gates]
    if numbers != expected_numbers:
        errors.append(f"plan: Gate numbers must be continuous from G0; got {numbers}")
    return gates


def parse_markdown_table(text: str, heading: str) -> list[list[str]]:
    body = section(text, heading)
    if body is None:
        return []
    rows: list[list[str]] = []
    for line in body.splitlines():
        stripped = line.strip()
        if not (stripped.startswith("|") and stripped.endswith("|")):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells):
            continue
        rows.append(cells)
    return rows


def unquote_code(value: str) -> str:
    # Markdown tables frequently use several inline code spans in one cell,
    # e.g. `implementation-plan.md` -> `G0: Prepare`.
    return value.strip().replace("`", "")


def parse_baseline(runbook: str, errors: list[str]) -> list[tuple[str, str]]:
    rows = parse_markdown_table(runbook, "Source Baseline")
    if len(rows) < 2:
        errors.append("runbook: Source Baseline table missing or empty")
        return []
    header = [cell.lower() for cell in rows[0]]
    if header[:2] != ["path", "sha-256"]:
        errors.append("runbook: Source Baseline header must be Path | SHA-256")
        return []
    parsed = []
    for cells in rows[1:]:
        if len(cells) < 2:
            continue
        path = unquote_code(cells[0])
        digest = unquote_code(cells[1])
        parsed.append((path, digest))
    paths = [path for path, _ in parsed]
    if paths != sorted(paths):
        errors.append("runbook: Source Baseline paths must be lexicographically sorted")
    if len(paths) != len(set(paths)):
        errors.append("runbook: Source Baseline contains duplicate paths")
    return parsed


def parse_ledger(runbook: str, errors: list[str]) -> list[LedgerRow]:
    rows = parse_markdown_table(runbook, "Goal Ledger")
    if len(rows) < 2:
        errors.append("runbook: Goal Ledger table missing or empty")
        return []
    expected = ["Gate", "Status", "Depends on", "Plan contract", "History", "Unlock evidence"]
    if rows[0] != expected:
        errors.append(f"runbook: Goal Ledger header must be {expected}")
        return []
    result = []
    for cells in rows[1:]:
        if len(cells) != 6:
            errors.append(f"runbook: malformed Goal Ledger row: {cells}")
            continue
        result.append(LedgerRow(*(unquote_code(cell) for cell in cells)))
    return result


def parse_checkpoint(runbook: str, errors: list[str]) -> dict[str, str]:
    body = section(runbook, "Current Checkpoint")
    if body is None:
        errors.append("runbook: missing Current Checkpoint")
        return {}
    values: dict[str, str] = {}
    for line in body.splitlines():
        match = re.match(r"^-\s+([^:]+):\s*(.+?)\s*$", line.strip())
        if match:
            values[match.group(1).strip()] = unquote_code(match.group(2).strip())
    required = (
        "Gate",
        "History",
        "Last event",
        "Last completed slice",
        "Current slice",
        "Satisfied exits",
        "Manual acceptance",
        "Blocker",
        "Risks",
        "Next action",
    )
    for key in required:
        if key not in values:
            errors.append(f"runbook: Current Checkpoint missing '{key}'")
    return values


def parse_history(path: Path, gate: Gate, errors: list[str]) -> dict[str, dict[str, object]]:
    if not path.exists():
        errors.append(f"history: missing {path.as_posix()}")
        return {}

    text = path.read_text(encoding="utf-8")
    schema_match = re.search(r"(?m)^Schema:\s+`([^`]+)`\s*$", text)
    if not schema_match or schema_match.group(1) != HISTORY_SCHEMA:
        errors.append(f"history: {path.name} must declare Schema `{HISTORY_SCHEMA}`")

    title = re.search(r"(?m)^# (G\d+): (.+?) History\s*$", text)
    if not title or f"{title.group(1)}: {title.group(2)}" != gate.label:
        errors.append(f"history: {path.name} title does not match plan '{gate.label}'")

    contract = re.search(r"(?m)^Plan contract:\s+`implementation-plan\.md`\s+->\s+`([^`]+)`\s*$", text)
    if not contract or contract.group(1) != gate.label:
        errors.append(f"history: {path.name} Plan contract does not match '{gate.label}'")

    matches = list(re.finditer(r"(?m)^### (G\d+-E\d{4}) · ([a-z-]+)\s*$", text))
    event_ids = [match.group(1) for match in matches]
    expected_ids = [f"{gate.id}-E{i:04d}" for i in range(1, len(event_ids) + 1)]
    if event_ids != expected_ids:
        errors.append(f"history: {path.name} event ids must be continuous; got {event_ids}")
    if matches and matches[0].group(2) != "initialized":
        errors.append(f"history: {path.name} first event must be initialized")

    allowed_types = {
        "initialized", "slice", "verification", "failure", "correction",
        "blocked", "resumed", "manual-handoff", "manual-result",
        "rollback", "gate-passed",
    }
    required_fields = {
        "At", "Type", "Slice", "Changed", "Verification", "Result",
        "Satisfies", "Risk", "Next",
    }
    events: dict[str, dict[str, object]] = {}
    for index, match in enumerate(matches):
        event_id, heading_type = match.group(1), match.group(2)
        body_start = match.end()
        body_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[body_start:body_end]
        fields: dict[str, str] = {}
        for line in body.splitlines():
            field_match = re.match(r"^-\s+([^:]+):\s*(.*?)\s*$", line.strip())
            if field_match:
                fields[field_match.group(1).strip()] = unquote_code(field_match.group(2).strip())

        if heading_type not in allowed_types:
            errors.append(f"history: {path.name} event {event_id} has invalid type '{heading_type}'")
        if fields.get("Type") != heading_type:
            errors.append(
                f"history: {path.name} event {event_id} Type '{fields.get('Type')}' != heading '{heading_type}'"
            )
        missing = sorted(required_fields - set(fields))
        if missing:
            errors.append(f"history: {path.name} event {event_id} missing fields {missing}")

        satisfies_raw = fields.get("Satisfies", "none")
        satisfies = []
        if satisfies_raw not in {"none", "—", "-"}:
            satisfies = [item.strip() for item in satisfies_raw.split(",") if item.strip()]
            unknown = [item for item in satisfies if item not in gate.exits]
            if unknown:
                errors.append(
                    f"history: {path.name} event {event_id} Satisfies unknown Exit ids {unknown}"
                )

        acceptance = fields.get("Acceptance")
        if acceptance and not re.fullmatch(rf"{gate.id}-A\d+", acceptance):
            errors.append(
                f"history: {path.name} event {event_id} invalid Acceptance id '{acceptance}'"
            )

        events[event_id] = {
            "type": heading_type,
            "fields": fields,
            "satisfies": satisfies,
        }

    return events


def parse_exit_evidence(value: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for item in value.split(";"):
        item = item.strip()
        if not item:
            continue
        if "=" not in item:
            continue
        exit_id, event_id = item.split("=", 1)
        mapping[exit_id.strip()] = event_id.strip()
    return mapping


def validate(effort: Path) -> list[str]:
    errors: list[str] = []
    effort = effort.resolve()
    plan_path = effort / "implementation-plan.md"
    runbook_path = effort / "goal" / "runbook.md"

    if not plan_path.exists():
        return [f"missing plan: {plan_path}"]
    if not runbook_path.exists():
        return [f"missing runbook: {runbook_path}"]

    plan_text = plan_path.read_text(encoding="utf-8")
    runbook_text = runbook_path.read_text(encoding="utf-8")

    top_headings = re.findall(r"(?m)^## (.+?)\s*$", runbook_text)
    expected_headings = ["Source Baseline", "State Rules", "Goal Ledger", "Current Checkpoint"]
    if top_headings != expected_headings:
        errors.append(
            f"runbook: top-level sections must be exactly {expected_headings}; got {top_headings}"
        )
    if "## Progress Log" in runbook_text or re.search(r"(?m)^### G\d+:", runbook_text):
        errors.append("runbook: execution history must not be embedded in the hot runbook")

    schema_match = re.search(r"(?m)^Schema:\s+`([^`]+)`\s*$", runbook_text)
    if not schema_match or schema_match.group(1) != RUNBOOK_SCHEMA:
        errors.append(f"runbook: must declare Schema `{RUNBOOK_SCHEMA}`")

    gates = parse_plan(plan_text, errors)
    baseline = parse_baseline(runbook_text, errors)
    baseline_paths = [path for path, _ in baseline]
    repo_root = effort
    # Find the nearest Git repository root when available; otherwise paths are resolved
    # relative to effort for fixtures and standalone validation.
    for parent in [effort, *effort.parents]:
        if (parent / ".git").exists():
            repo_root = parent
            break
    for rel, expected_digest in baseline:
        if not re.fullmatch(r"[0-9a-f]{64}", expected_digest):
            errors.append(f"runbook: invalid SHA-256 for {rel}")
            continue
        candidate = repo_root / rel
        if not candidate.exists() and rel == "implementation-plan.md":
            candidate = effort / rel
        if not candidate.exists():
            errors.append(f"baseline: missing source path {rel}")
            continue
        actual = sha256(candidate)
        if actual != expected_digest:
            errors.append(f"baseline: drift detected for {rel}: expected {expected_digest}, got {actual}")
    if "implementation-plan.md" not in baseline_paths and str(plan_path.relative_to(repo_root)).replace("\\", "/") not in baseline_paths:
        errors.append("runbook: Source Baseline must include implementation-plan.md")

    ledger = parse_ledger(runbook_text, errors)
    checkpoint = parse_checkpoint(runbook_text, errors)

    if len(ledger) != len(gates):
        errors.append(f"runbook: Ledger has {len(ledger)} Gates but plan has {len(gates)}")

    statuses = []
    histories: dict[str, dict[str, dict[str, object]]] = {}
    for index, row in enumerate(ledger):
        if index >= len(gates):
            break
        gate = gates[index]
        if row.gate != gate.label:
            errors.append(f"runbook: Ledger row {index} gate '{row.gate}' != plan '{gate.label}'")
        if row.status not in {"planned", "active", "blocked", "passed"}:
            errors.append(f"runbook: {row.gate} invalid status '{row.status}'")
        statuses.append(row.status)

        expected_dep = "none" if index == 0 else f"G{index - 1}"
        if row.depends_on != expected_dep:
            errors.append(f"runbook: {row.gate} Depends on must be '{expected_dep}'")

        expected_contract = f"implementation-plan.md -> {gate.label}"
        if row.plan_contract != expected_contract:
            errors.append(f"runbook: {row.gate} Plan contract must be '{expected_contract}'")

        if row.status in {"active", "blocked", "passed"}:
            expected_history = f"goal/history/{gate.id}.md"
            if row.history != expected_history:
                errors.append(f"runbook: {row.gate} History must be '{expected_history}'")
            history_path = effort / expected_history
            histories[gate.id] = parse_history(history_path, gate, errors)
            if row.status == "passed":
                gate_passed = [
                    (event_id, event)
                    for event_id, event in histories[gate.id].items()
                    if event.get("type") == "gate-passed"
                ]
                if not gate_passed:
                    errors.append(f"history: {gate.id} passed without gate-passed event")
                else:
                    passed_event_id, passed_event = gate_passed[-1]
                    if next(reversed(histories[gate.id])) != passed_event_id:
                        errors.append(f"history: {gate.id} passed but gate-passed is not the final event")
                    fields = passed_event.get("fields", {})
                    exit_map = parse_exit_evidence(str(fields.get("Exit evidence", "")))
                    if set(exit_map) != set(gate.exits):
                        errors.append(
                            f"history: {gate.id} gate-passed Exit evidence is {sorted(exit_map)}; expected {gate.exits}"
                        )
                    for exit_id, evidence_event_id in exit_map.items():
                        if evidence_event_id == passed_event_id:
                            errors.append(
                                f"history: {gate.id} {exit_id} cannot use gate-passed event as its own evidence"
                            )
                            continue
                        evidence = histories[gate.id].get(evidence_event_id)
                        if evidence is None:
                            errors.append(
                                f"history: {gate.id} {exit_id} references missing event {evidence_event_id}"
                            )
                        elif exit_id not in evidence.get("satisfies", []):
                            errors.append(
                                f"history: {gate.id} {exit_id} evidence event {evidence_event_id} does not Satisfy {exit_id}"
                            )
                    expected_locator = f"goal/history/{gate.id}.md@{passed_event_id}"
                    if row.unlock_evidence != expected_locator:
                        errors.append(
                            f"runbook: {row.gate} passed Unlock evidence must be '{expected_locator}'"
                        )
        elif row.status == "planned" and row.history not in {"—", "-", "none"}:
            errors.append(f"runbook: {row.gate} planned Gate should not require history yet")

        if index > 0 and row.status in {"active", "blocked"} and ledger[index - 1].status == "passed":
            if row.unlock_evidence != ledger[index - 1].unlock_evidence:
                errors.append(
                    f"runbook: {row.gate} Unlock evidence must reuse predecessor locator "
                    f"'{ledger[index - 1].unlock_evidence}'"
                )

    def valid_shape(items: list[str]) -> bool:
        if not items:
            return False
        if all(item == "passed" for item in items):
            return True
        for pivot, status in enumerate(items):
            if status in {"active", "blocked"}:
                return (
                    all(item == "passed" for item in items[:pivot])
                    and all(item == "planned" for item in items[pivot + 1 :])
                    and sum(item in {"active", "blocked"} for item in items) == 1
                )
        return False

    if statuses and not valid_shape(statuses):
        errors.append(f"runbook: illegal Ledger state shape {statuses}")

    current_rows = [row for row in ledger if row.status in {"active", "blocked"}]
    if current_rows:
        current = current_rows[0]
        blocker = checkpoint.get("Blocker", "none")
        if current.status == "blocked" and blocker in {"none", "—", "-"}:
            errors.append("runbook: blocked Gate requires a non-empty checkpoint Blocker")
        if current.status == "active" and blocker not in {"none", "—", "-"}:
            errors.append("runbook: active Gate checkpoint Blocker must be none")
        if checkpoint.get("Gate") != current.gate:
            errors.append(f"runbook: checkpoint Gate '{checkpoint.get('Gate')}' != current '{current.gate}'")
        expected_history = current.history
        if checkpoint.get("History") != expected_history:
            errors.append(f"runbook: checkpoint History '{checkpoint.get('History')}' != '{expected_history}'")
        gate_id = current.gate.split(":", 1)[0]
        events = histories.get(gate_id, {})
        last_event = checkpoint.get("Last event", "")
        if last_event and last_event not in events:
            errors.append(f"runbook: checkpoint Last event '{last_event}' not found in {gate_id} history")
        satisfied_by_history = {
            exit_id
            for event in events.values()
            for exit_id in event.get("satisfies", [])
        }
        satisfied = checkpoint.get("Satisfied exits", "none")
        if satisfied not in {"none", "all"}:
            ids = [part.strip() for part in satisfied.split(",") if part.strip()]
            unknown = [exit_id for exit_id in ids if exit_id not in satisfied_by_history]
            if unknown:
                errors.append(f"runbook: checkpoint Satisfied exits lack history evidence: {unknown}")
        manual = checkpoint.get("Manual acceptance", "none")
        pending = re.fullmatch(r"pending (G\d+-A\d+)", manual)
        if pending:
            if current.status != "active":
                errors.append("runbook: pending manual acceptance requires Gate status active")
            found = any(
                event.get("fields", {}).get("Acceptance") == pending.group(1)
                for event in events.values()
            )
            if not found:
                errors.append(f"runbook: pending acceptance {pending.group(1)} not found in current history")
    elif statuses and all(status == "passed" for status in statuses):
        expected_complete = {
            "Gate": "none",
            "History": "none",
            "Last completed slice": "none",
            "Current slice": "none",
            "Satisfied exits": "all",
            "Manual acceptance": "none",
            "Blocker": "none",
            "Next action": "effort complete",
        }
        for key, expected in expected_complete.items():
            if checkpoint.get(key) != expected:
                errors.append(
                    f"runbook: completed effort checkpoint {key} must be '{expected}'"
                )
        if gates:
            final_gate = gates[-1]
            final_events = histories.get(final_gate.id, {})
            last_event = checkpoint.get("Last event", "")
            event = final_events.get(last_event)
            if not event or event.get("type") != "gate-passed":
                errors.append(
                    "runbook: completed effort Last event must reference final Gate gate-passed event"
                )
    elif ledger:
        errors.append("runbook: Ledger has no active/blocked Gate and is not complete")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Goal Loop v2 artifacts")
    parser.add_argument("effort", type=Path, help="effort directory containing implementation-plan.md and goal/")
    args = parser.parse_args()

    errors = validate(args.effort)
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        print(f"{len(errors)} failure(s)")
        return 1
    print("OK: goal-loop artifacts are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
