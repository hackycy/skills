#!/usr/bin/env python3
"""Validate Goal Loop control-plane artifacts using only the Python standard library."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

RUNBOOK_SCHEMA = "goal-loop/runbook-v3"
HISTORY_SCHEMA = "goal-loop/history-v2"
BASELINE_SCHEMA = "goal-loop/contract-baseline-v1"
PROMPT_SCHEMA = "goal-loop/prompt-v2"
TRANSACTION_SCHEMA = "goal-loop/transaction-v1"

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

STATE_RULES = (
    "`implementation-plan.md` 是 Gate 合同唯一来源；runbook 只保存当前执行状态和压缩 checkpoint。",
    "`goal/contract-baseline.json` 精确声明合同输入集合及内容哈希；合同输入漂移时停止执行，直到完成显式 reconcile。",
    "`goal/history/G<n>.md` 是带 event hash chain 的 append-only 证据历史；runbook 保存当前 history tail hash。",
    "一次只允许唯一 `active` Gate 执行；`blocked` 只对应计划声明的 Stop condition，恢复执行前必须追加 `resumed` event。",
    "所有运行态修改使用 goal-loop control script 并携带当前 runbook Revision；陈旧 Revision 的写入必须拒绝。",
    "稳定且已验证的 slice 完成后允许追加 `checkpoint` event 并以 Gate 仍为 `active` 的状态成功结束；后续 Goal 从该 checkpoint 恢复。",
    "人工验收 pending 时 Gate 保持 `active`；当前 Goal 结束且不轮询，只在收到对应 acceptance id 的明确结果后继续。",
    "Gate 通过时记录完整 Exit evidence，只激活直接后继，压缩 checkpoint，运行 validator，并结束当前 Goal。",
)

ALLOWED_EVENT_TYPES = {
    "initialized",
    "slice",
    "verification",
    "failure",
    "checkpoint",
    "correction",
    "blocked",
    "resumed",
    "manual-handoff",
    "manual-result",
    "rollback",
    "contract-reconciled",
    "gate-passed",
}

EMPTY_MARKERS = {"none", "—", "-", ""}


@dataclass(frozen=True)
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


@dataclass(frozen=True)
class Plan:
    gates: list[Gate]
    contract_sources: list[str]


@dataclass
class LedgerRow:
    gate: str
    status: str
    depends_on: str
    plan_contract: str
    history: str
    history_head: str
    unlock_evidence: str


@dataclass
class Event:
    event_id: str
    event_type: str
    fields: dict[str, str]
    satisfies: list[str]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_repo_root(effort: Path) -> Path:
    effort = effort.resolve()
    for parent in [effort, *effort.parents]:
        if (parent / ".git").exists():
            return parent
    return effort


def repo_relative(path: Path, repo_root: Path) -> str:
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def section(text: str, heading: str, next_level: int = 2) -> str | None:
    prefix = "#" * next_level
    pattern = re.compile(
        rf"(?ms)^{re.escape(prefix + ' ' + heading)}\s*\n(.*?)(?=^{re.escape(prefix + ' ')}|\Z)"
    )
    match = pattern.search(text)
    return match.group(1).strip() if match else None


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
    return value.strip().replace("`", "")


def parse_plan(text: str, errors: list[str]) -> Plan:
    contract_rows = parse_markdown_table(text, "Contract Sources")
    contract_sources: list[str] = []
    if len(contract_rows) < 2:
        errors.append("plan: Contract Sources table missing or empty")
    else:
        if contract_rows[0] != ["Path", "Role"]:
            errors.append("plan: Contract Sources header must be Path | Role")
        else:
            for row in contract_rows[1:]:
                if len(row) != 2:
                    errors.append(f"plan: malformed Contract Sources row: {row}")
                    continue
                path = unquote_code(row[0])
                if not path:
                    errors.append("plan: Contract Sources path must not be empty")
                    continue
                if Path(path).is_absolute() or path.startswith("../") or "/../" in path:
                    errors.append(f"plan: Contract Sources path must be repository-relative: {path}")
                if path.startswith("goal/") or "/goal/" in path:
                    errors.append(f"plan: runtime artifact must not appear in Contract Sources: {path}")
                contract_sources.append(path)
    if contract_sources != sorted(contract_sources):
        errors.append("plan: Contract Sources paths must be lexicographically sorted")
    if len(contract_sources) != len(set(contract_sources)):
        errors.append("plan: Contract Sources contains duplicate paths")

    gate_matches = list(re.finditer(r"(?m)^## G(\d+): (.+?)\s*$", text))
    if not gate_matches:
        errors.append("plan: no Gate detail headings found")
        return Plan(gates=[], contract_sources=contract_sources)

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

        exit_match = re.search(r"(?ms)^### Exit conditions\s*\n(.*?)(?=^### |\Z)", body)
        exits = re.findall(r"(?m)^-\s+`(E\d+)`:\s+.+$", exit_match.group(1) if exit_match else "")
        expected = [f"E{i}" for i in range(1, len(exits) + 1)]
        if not exits:
            errors.append(f"plan: G{number} has no numbered Exit conditions")
        elif exits != expected:
            errors.append(f"plan: G{number} Exit ids must be continuous from E1; got {exits}")

        evidence_match = re.search(r"(?ms)^### Evidence rule\s*\n(.*?)(?=^### |\Z)", body)
        evidence_exits: list[str] = []
        if evidence_match:
            for line in evidence_match.group(1).splitlines():
                cells = [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
                if cells and re.fullmatch(r"E\d+", cells[0] if cells else ""):
                    evidence_exits.append(cells[0])
        normalized_evidence = sorted(set(evidence_exits), key=lambda x: int(x[1:]))
        if exits and normalized_evidence != exits:
            errors.append(
                f"plan: G{number} Evidence rule must cover exactly {exits}; got {normalized_evidence}"
            )

        gates.append(Gate(number=number, name=name, exits=exits))

    expected_numbers = list(range(len(gates)))
    numbers = [gate.number for gate in gates]
    if numbers != expected_numbers:
        errors.append(f"plan: Gate numbers must be continuous from G0; got {numbers}")

    top_headings = re.findall(r"(?m)^## (.+?)\s*$", text)
    expected_top_headings = [
        "Contract Sources",
        "Source Decisions",
        "Outcome",
        "Non-Negotiable Rules",
        "Gate Overview",
        *[gate.label for gate in gates],
        "Definition Of Done",
        "Explicitly Out Of Scope",
    ]
    if top_headings != expected_top_headings:
        errors.append(
            f"plan: top-level sections must be exactly {expected_top_headings}; got {top_headings}"
        )

    overview_rows = parse_markdown_table(text, "Gate Overview")
    if len(overview_rows) < 2:
        errors.append("plan: Gate Overview table missing or empty")
    elif overview_rows[0] != ["Gate", "Name", "Unlock condition", "Outcome"]:
        errors.append("plan: Gate Overview header must be Gate | Name | Unlock condition | Outcome")
    else:
        overview_pairs = [(unquote_code(row[0]), unquote_code(row[1])) for row in overview_rows[1:] if len(row) >= 2]
        expected_pairs = [(gate.id, gate.name) for gate in gates]
        if overview_pairs != expected_pairs:
            errors.append(
                f"plan: Gate Overview Gate/Name rows must match Gate detail headings; expected {expected_pairs}, got {overview_pairs}"
            )

    return Plan(gates=gates, contract_sources=contract_sources)


def parse_revision(runbook: str, errors: list[str]) -> int | None:
    match = re.search(r"(?m)^Revision:\s+`(\d+)`\s*$", runbook)
    if not match:
        errors.append("runbook: missing numeric Revision")
        return None
    return int(match.group(1))


def parse_contract_baseline(runbook: str, errors: list[str]) -> tuple[str, str]:
    body = section(runbook, "Contract Baseline")
    if body is None:
        errors.append("runbook: missing Contract Baseline")
        return "", ""
    values: dict[str, str] = {}
    for line in body.splitlines():
        match = re.match(r"^-\s+([^:]+):\s*(.+?)\s*$", line.strip())
        if match:
            values[match.group(1).strip()] = unquote_code(match.group(2).strip())
    manifest = values.get("Manifest", "")
    digest = values.get("Manifest SHA-256", "")
    if manifest != "goal/contract-baseline.json":
        errors.append("runbook: Contract Baseline Manifest must be 'goal/contract-baseline.json'")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        errors.append("runbook: Contract Baseline Manifest SHA-256 must be 64 lowercase hex characters")
    return manifest, digest


def parse_state_rules(runbook: str, errors: list[str]) -> None:
    body = section(runbook, "State Rules")
    if body is None:
        errors.append("runbook: missing State Rules")
        return
    rules = [line[2:].strip() for line in body.splitlines() if line.strip().startswith("- ")]
    if rules != list(STATE_RULES):
        errors.append("runbook: State Rules do not match the required goal-loop invariants")


def parse_ledger(runbook: str, errors: list[str]) -> list[LedgerRow]:
    rows = parse_markdown_table(runbook, "Goal Ledger")
    if len(rows) < 2:
        errors.append("runbook: Goal Ledger table missing or empty")
        return []
    expected = [
        "Gate",
        "Status",
        "Depends on",
        "Plan contract",
        "History",
        "History head",
        "Unlock evidence",
    ]
    if rows[0] != expected:
        errors.append(f"runbook: Goal Ledger header must be {expected}")
        return []
    result: list[LedgerRow] = []
    for cells in rows[1:]:
        if len(cells) != 7:
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
    for key in required:
        if key not in values:
            errors.append(f"runbook: Current Checkpoint missing '{key}'")
    return values


def canonical_event_payload(event_id: str, event_type: str, fields: dict[str, str]) -> bytes:
    payload_fields = {key: value for key, value in fields.items() if key != "Event hash"}
    payload = {
        "id": event_id,
        "type": event_type,
        "fields": {key: payload_fields[key] for key in sorted(payload_fields)},
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def compute_event_hash(event_id: str, event_type: str, fields: dict[str, str]) -> str:
    return sha256_bytes(canonical_event_payload(event_id, event_type, fields))


def parse_history_text(text: str, gate: Gate, source_name: str, errors: list[str]) -> dict[str, Event]:
    schema_match = re.search(r"(?m)^Schema:\s+`([^`]+)`\s*$", text)
    if not schema_match or schema_match.group(1) != HISTORY_SCHEMA:
        errors.append(f"history: {source_name} must declare Schema `{HISTORY_SCHEMA}`")

    title = re.search(r"(?m)^# (G\d+): (.+?) History\s*$", text)
    if not title or f"{title.group(1)}: {title.group(2)}" != gate.label:
        errors.append(f"history: {source_name} title does not match plan '{gate.label}'")

    contract = re.search(r"(?m)^Plan contract:\s+`implementation-plan\.md`\s+->\s+`([^`]+)`\s*$", text)
    if not contract or contract.group(1) != gate.label:
        errors.append(f"history: {source_name} Plan contract does not match '{gate.label}'")

    matches = list(re.finditer(r"(?m)^### (G\d+-E\d{4}) · ([a-z-]+)\s*$", text))
    event_ids = [match.group(1) for match in matches]
    expected_ids = [f"{gate.id}-E{i:04d}" for i in range(1, len(event_ids) + 1)]
    if event_ids != expected_ids:
        errors.append(f"history: {source_name} event ids must be continuous; got {event_ids}")
    if not matches:
        errors.append(f"history: {source_name} has no events")
    elif matches[0].group(2) != "initialized":
        errors.append(f"history: {source_name} first event must be initialized")

    required_fields = {
        "At",
        "Type",
        "Slice",
        "Changed",
        "Verification",
        "Result",
        "Satisfies",
        "Risk",
        "Next",
        "Prev event hash",
        "Event hash",
    }

    events: dict[str, Event] = {}
    previous_hash = "none"
    handoffs: set[str] = set()
    resolved_acceptances: set[str] = set()
    mode = "active"
    passed_seen = 0

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

        if heading_type not in ALLOWED_EVENT_TYPES:
            errors.append(f"history: {source_name} event {event_id} has invalid type '{heading_type}'")
        if fields.get("Type") != heading_type:
            errors.append(
                f"history: {source_name} event {event_id} Type '{fields.get('Type')}' != heading '{heading_type}'"
            )
        missing = sorted(required_fields - set(fields))
        if missing:
            errors.append(f"history: {source_name} event {event_id} missing fields {missing}")

        prev = fields.get("Prev event hash", "")
        if prev != previous_hash:
            errors.append(
                f"history: {source_name} event {event_id} Prev event hash '{prev}' != expected '{previous_hash}'"
            )
        event_hash = fields.get("Event hash", "")
        expected_hash = compute_event_hash(event_id, heading_type, fields)
        if event_hash != expected_hash:
            errors.append(
                f"history: {source_name} event {event_id} Event hash mismatch: expected {expected_hash}, got {event_hash}"
            )
        if re.fullmatch(r"[0-9a-f]{64}", event_hash):
            previous_hash = event_hash

        satisfies_raw = fields.get("Satisfies", "none")
        satisfies: list[str] = []
        if satisfies_raw not in EMPTY_MARKERS:
            satisfies = [item.strip() for item in satisfies_raw.split(",") if item.strip()]
            unknown = [item for item in satisfies if item not in gate.exits]
            if unknown:
                errors.append(
                    f"history: {source_name} event {event_id} Satisfies unknown Exit ids {unknown}"
                )
            if len(satisfies) != len(set(satisfies)):
                errors.append(f"history: {source_name} event {event_id} has duplicate Satisfies ids")

        acceptance = fields.get("Acceptance")
        if heading_type == "manual-handoff":
            if not acceptance or not re.fullmatch(rf"{gate.id}-A\d+", acceptance):
                errors.append(f"history: {source_name} event {event_id} manual-handoff requires valid Acceptance")
            elif acceptance in handoffs:
                errors.append(f"history: {source_name} duplicate Acceptance id '{acceptance}'")
            else:
                handoffs.add(acceptance)
        elif heading_type == "manual-result":
            if not acceptance or acceptance not in handoffs:
                errors.append(
                    f"history: {source_name} event {event_id} manual-result must reference a prior Acceptance"
                )
            elif acceptance in resolved_acceptances:
                errors.append(f"history: {source_name} Acceptance '{acceptance}' resolved more than once")
            else:
                resolved_acceptances.add(acceptance)
        elif acceptance and not re.fullmatch(rf"{gate.id}-A\d+", acceptance):
            errors.append(f"history: {source_name} event {event_id} invalid Acceptance id '{acceptance}'")

        if heading_type == "correction":
            corrects = fields.get("Corrects", "")
            if corrects not in events:
                errors.append(
                    f"history: {source_name} event {event_id} correction must reference a prior event in Corrects"
                )
            effect = fields.get("Evidence effect", "")
            if effect not in {"retain", "invalidate"}:
                errors.append(
                    f"history: {source_name} event {event_id} Evidence effect must be retain or invalidate"
                )

        if heading_type == "blocked":
            if mode != "active":
                errors.append(f"history: {source_name} event {event_id} blocked requires active state")
            mode = "blocked"
        elif heading_type == "resumed":
            if mode != "blocked":
                errors.append(f"history: {source_name} event {event_id} resumed requires blocked state")
            mode = "active"
        elif heading_type == "gate-passed":
            passed_seen += 1
            if mode != "active":
                errors.append(f"history: {source_name} event {event_id} gate-passed requires active state")
            mode = "passed"
        elif mode == "passed":
            errors.append(f"history: {source_name} event {event_id} appears after gate-passed")

        events[event_id] = Event(event_id=event_id, event_type=heading_type, fields=fields, satisfies=satisfies)

    if passed_seen > 1:
        errors.append(f"history: {source_name} contains multiple gate-passed events")
    return events


def parse_history(path: Path, gate: Gate, errors: list[str]) -> dict[str, Event]:
    if not path.exists():
        errors.append(f"history: missing {path.as_posix()}")
        return {}
    return parse_history_text(path.read_text(encoding="utf-8"), gate, path.name, errors)


def tail_event(events: dict[str, Event]) -> Event | None:
    if not events:
        return None
    return next(reversed(events.values()))


def invalidated_evidence_events(events: dict[str, Event]) -> set[str]:
    invalidated: set[str] = set()
    for event in events.values():
        if event.event_type == "correction" and event.fields.get("Evidence effect") == "invalidate":
            target = event.fields.get("Corrects")
            if target:
                invalidated.add(target)
    return invalidated


def effective_satisfied_exits(events: dict[str, Event]) -> set[str]:
    invalidated = invalidated_evidence_events(events)
    result: set[str] = set()
    for event_id, event in events.items():
        if event_id in invalidated or event.event_type == "gate-passed":
            continue
        result.update(event.satisfies)
    return result


def unresolved_acceptances(events: dict[str, Event]) -> set[str]:
    handoffs: set[str] = set()
    resolved: set[str] = set()
    for event in events.values():
        acceptance = event.fields.get("Acceptance")
        if event.event_type == "manual-handoff" and acceptance:
            handoffs.add(acceptance)
        elif event.event_type == "manual-result" and acceptance:
            resolved.add(acceptance)
    return handoffs - resolved


def parse_exit_evidence(value: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for item in value.split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue
        exit_id, event_id = item.split("=", 1)
        mapping[exit_id.strip()] = event_id.strip()
    return mapping


def history_mode(events: dict[str, Event]) -> str:
    mode = "active"
    for event in events.values():
        if event.event_type == "blocked":
            mode = "blocked"
        elif event.event_type == "resumed":
            mode = "active"
        elif event.event_type == "gate-passed":
            mode = "passed"
    return mode


def parse_checkpoint_exits(value: str, gate: Gate, errors: list[str]) -> set[str]:
    if value == "none":
        return set()
    if value == "all":
        return set(gate.exits)
    ids = [part.strip() for part in value.split(",") if part.strip()]
    unknown = [item for item in ids if item not in gate.exits]
    if unknown:
        errors.append(f"runbook: checkpoint Satisfied exits contains unknown ids: {unknown}")
    if len(ids) != len(set(ids)):
        errors.append("runbook: checkpoint Satisfied exits contains duplicates")
    return set(ids)


def load_baseline_manifest(path: Path, errors: list[str]) -> dict[str, object] | None:
    if not path.exists():
        errors.append(f"baseline: missing manifest {path.as_posix()}")
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        errors.append(f"baseline: invalid manifest JSON: {exc}")
        return None
    if data.get("schema") != BASELINE_SCHEMA:
        errors.append(f"baseline: manifest schema must be '{BASELINE_SCHEMA}'")
    files = data.get("files")
    if not isinstance(files, list):
        errors.append("baseline: manifest files must be a list")
        return None
    return data


def validate_baseline(
    effort: Path,
    repo_root: Path,
    plan_path: Path,
    plan: Plan,
    runbook_text: str,
    errors: list[str],
    *,
    allow_baseline_drift: bool,
) -> None:
    manifest_rel, manifest_digest = parse_contract_baseline(runbook_text, errors)
    if not manifest_rel:
        return
    manifest_path = effort / manifest_rel
    manifest = load_baseline_manifest(manifest_path, errors)
    if manifest is None:
        return
    if re.fullmatch(r"[0-9a-f]{64}", manifest_digest) and sha256(manifest_path) != manifest_digest:
        errors.append("baseline: manifest content does not match runbook Manifest SHA-256")

    raw_files = manifest.get("files", [])
    entries: list[tuple[str, str]] = []
    for item in raw_files if isinstance(raw_files, list) else []:
        if not isinstance(item, dict):
            errors.append("baseline: each manifest file entry must be an object")
            continue
        path = item.get("path")
        digest = item.get("sha256")
        if not isinstance(path, str) or not isinstance(digest, str):
            errors.append("baseline: each manifest entry requires string path and sha256")
            continue
        entries.append((path, digest))

    paths = [path for path, _ in entries]
    if paths != sorted(paths):
        errors.append("baseline: manifest paths must be lexicographically sorted")
    if len(paths) != len(set(paths)):
        errors.append("baseline: manifest contains duplicate paths")

    expected_plan_path = repo_relative(plan_path, repo_root)
    expected_paths = sorted({expected_plan_path, *plan.contract_sources})
    if paths != expected_paths:
        errors.append(f"baseline: manifest paths must exactly match Contract Sources plus plan: expected {expected_paths}, got {paths}")

    for rel, expected_digest in entries:
        if not re.fullmatch(r"[0-9a-f]{64}", expected_digest):
            errors.append(f"baseline: invalid SHA-256 for {rel}")
            continue
        candidate = repo_root / rel
        if not candidate.exists():
            errors.append(f"baseline: missing contract source {rel}")
            continue
        actual = sha256(candidate)
        if actual != expected_digest and not allow_baseline_drift:
            errors.append(f"baseline: drift detected for {rel}: expected {expected_digest}, got {actual}")


def validate_prompt(effort: Path, repo_root: Path, errors: list[str]) -> None:
    prompt_path = effort / "goal" / "prompt.md"
    if not prompt_path.exists():
        errors.append(f"prompt: missing {prompt_path.as_posix()}")
        return
    template_path = Path(__file__).resolve().parents[1] / "references" / "goal-prompt-template.md"
    if not template_path.exists():
        errors.append(f"prompt: skill template missing {template_path.as_posix()}")
        return
    effort_rel = repo_relative(effort, repo_root)
    if effort_rel == ".":
        effort_rel = "."
    expected = template_path.read_text(encoding="utf-8").replace("{{EFFORT_PATH}}", effort_rel)
    actual = prompt_path.read_text(encoding="utf-8")
    if actual != expected:
        errors.append("prompt: goal/prompt.md must exactly match the fixed template after EFFORT_PATH substitution")
    if f"Prompt schema: `{PROMPT_SCHEMA}`" not in actual:
        errors.append(f"prompt: must declare Prompt schema `{PROMPT_SCHEMA}`")


def _valid_ledger_shape(items: list[str]) -> bool:
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


def validate(
    effort: Path,
    *,
    allow_baseline_drift: bool = False,
    allow_pending_transaction: bool = False,
) -> list[str]:
    errors: list[str] = []
    effort = effort.resolve()
    plan_path = effort / "implementation-plan.md"
    runbook_path = effort / "goal" / "runbook.md"
    transaction_path = effort / "goal" / ".goal-loop-transaction.json"

    if transaction_path.exists() and not allow_pending_transaction:
        errors.append("transaction: pending state transaction exists; run goal_loop_ctl.py recover before execution")

    if not plan_path.exists():
        return errors + [f"missing plan: {plan_path}"]
    if not runbook_path.exists():
        return errors + [f"missing runbook: {runbook_path}"]

    plan_text = plan_path.read_text(encoding="utf-8")
    runbook_text = runbook_path.read_text(encoding="utf-8")
    repo_root = find_repo_root(effort)

    top_headings = re.findall(r"(?m)^## (.+?)\s*$", runbook_text)
    expected_headings = ["Contract Baseline", "State Rules", "Goal Ledger", "Current Checkpoint"]
    if top_headings != expected_headings:
        errors.append(f"runbook: top-level sections must be exactly {expected_headings}; got {top_headings}")
    if "## Progress Log" in runbook_text or re.search(r"(?m)^### G\d+:", runbook_text):
        errors.append("runbook: execution history must not be embedded in the hot runbook")

    schema_match = re.search(r"(?m)^Schema:\s+`([^`]+)`\s*$", runbook_text)
    if not schema_match or schema_match.group(1) != RUNBOOK_SCHEMA:
        errors.append(f"runbook: must declare Schema `{RUNBOOK_SCHEMA}`")
    parse_revision(runbook_text, errors)
    parse_state_rules(runbook_text, errors)

    plan = parse_plan(plan_text, errors)
    validate_baseline(
        effort,
        repo_root,
        plan_path,
        plan,
        runbook_text,
        errors,
        allow_baseline_drift=allow_baseline_drift,
    )
    validate_prompt(effort, repo_root, errors)

    ledger = parse_ledger(runbook_text, errors)
    checkpoint = parse_checkpoint(runbook_text, errors)

    if len(ledger) != len(plan.gates):
        errors.append(f"runbook: Ledger has {len(ledger)} Gates but plan has {len(plan.gates)}")

    statuses: list[str] = []
    histories: dict[str, dict[str, Event]] = {}
    for index, row in enumerate(ledger):
        if index >= len(plan.gates):
            break
        gate = plan.gates[index]
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
            events = parse_history(history_path, gate, errors)
            histories[gate.id] = events
            tail = tail_event(events)
            if tail and row.history_head != tail.fields.get("Event hash"):
                errors.append(f"runbook: {row.gate} History head does not match history tail hash")
            if history_mode(events) != row.status:
                errors.append(
                    f"runbook: {row.gate} status '{row.status}' does not match history transition state '{history_mode(events)}'"
                )

            if row.status == "passed":
                gate_passed = [event for event in events.values() if event.event_type == "gate-passed"]
                if len(gate_passed) != 1:
                    errors.append(f"history: {gate.id} passed requires exactly one gate-passed event")
                elif tail and tail.event_id != gate_passed[0].event_id:
                    errors.append(f"history: {gate.id} passed but gate-passed is not the final event")
                if gate_passed:
                    passed_event = gate_passed[-1]
                    exit_map = parse_exit_evidence(passed_event.fields.get("Exit evidence", ""))
                    if set(exit_map) != set(gate.exits):
                        errors.append(
                            f"history: {gate.id} gate-passed Exit evidence is {sorted(exit_map)}; expected {gate.exits}"
                        )
                    invalidated = invalidated_evidence_events(events)
                    for exit_id, evidence_event_id in exit_map.items():
                        if evidence_event_id == passed_event.event_id:
                            errors.append(f"history: {gate.id} {exit_id} cannot use gate-passed as its own evidence")
                            continue
                        if evidence_event_id in invalidated:
                            errors.append(f"history: {gate.id} {exit_id} references invalidated evidence {evidence_event_id}")
                            continue
                        evidence = events.get(evidence_event_id)
                        if evidence is None:
                            errors.append(f"history: {gate.id} {exit_id} references missing event {evidence_event_id}")
                        elif exit_id not in evidence.satisfies:
                            errors.append(
                                f"history: {gate.id} {exit_id} evidence event {evidence_event_id} does not Satisfy {exit_id}"
                            )
                    expected_locator = (
                        f"goal/history/{gate.id}.md@{passed_event.event_id}#{passed_event.fields.get('Event hash', '')}"
                    )
                    if row.unlock_evidence != expected_locator:
                        errors.append(f"runbook: {row.gate} passed Unlock evidence must be '{expected_locator}'")
        else:
            if row.history not in {"—", "-", "none"}:
                errors.append(f"runbook: {row.gate} planned Gate must not have history")
            if row.history_head not in {"—", "-", "none"}:
                errors.append(f"runbook: {row.gate} planned Gate must not have History head")

        if index > 0 and row.status in {"active", "blocked"} and ledger[index - 1].status == "passed":
            if row.unlock_evidence != ledger[index - 1].unlock_evidence:
                errors.append(
                    f"runbook: {row.gate} Unlock evidence must reuse predecessor locator '{ledger[index - 1].unlock_evidence}'"
                )

    if statuses and not _valid_ledger_shape(statuses):
        errors.append(f"runbook: illegal Ledger state shape {statuses}")

    current_rows = [row for row in ledger if row.status in {"active", "blocked"}]
    if current_rows:
        current = current_rows[0]
        blocker = checkpoint.get("Blocker", "none")
        if current.status == "blocked" and blocker in EMPTY_MARKERS:
            errors.append("runbook: blocked Gate requires a non-empty checkpoint Blocker")
        if current.status == "active" and blocker not in EMPTY_MARKERS:
            errors.append("runbook: active Gate checkpoint Blocker must be none")
        if checkpoint.get("Gate") != current.gate:
            errors.append(f"runbook: checkpoint Gate '{checkpoint.get('Gate')}' != current '{current.gate}'")
        if checkpoint.get("History") != current.history:
            errors.append(f"runbook: checkpoint History '{checkpoint.get('History')}' != '{current.history}'")

        gate_id = current.gate.split(":", 1)[0]
        gate = next((g for g in plan.gates if g.id == gate_id), None)
        events = histories.get(gate_id, {})
        tail = tail_event(events)
        if tail:
            if checkpoint.get("Last event") != tail.event_id:
                errors.append(
                    f"runbook: checkpoint Last event '{checkpoint.get('Last event')}' must equal history tail '{tail.event_id}'"
                )
            if checkpoint.get("History head") != tail.fields.get("Event hash"):
                errors.append("runbook: checkpoint History head must equal current history tail hash")

        if gate:
            expected_satisfied = effective_satisfied_exits(events)
            checkpoint_satisfied = parse_checkpoint_exits(checkpoint.get("Satisfied exits", "none"), gate, errors)
            if checkpoint_satisfied != expected_satisfied:
                errors.append(
                    f"runbook: checkpoint Satisfied exits {sorted(checkpoint_satisfied)} != effective history evidence {sorted(expected_satisfied)}"
                )

        unresolved = unresolved_acceptances(events)
        manual = checkpoint.get("Manual acceptance", "none")
        pending_match = re.fullmatch(r"pending (G\d+-A\d+)", manual)
        if pending_match:
            acceptance = pending_match.group(1)
            if current.status != "active":
                errors.append("runbook: pending manual acceptance requires Gate status active")
            if unresolved != {acceptance}:
                errors.append(
                    f"runbook: pending acceptance '{acceptance}' must match the single unresolved handoff {sorted(unresolved)}"
                )
        elif unresolved:
            errors.append(f"runbook: unresolved manual acceptance must be represented in checkpoint: {sorted(unresolved)}")
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
                errors.append(f"runbook: completed effort checkpoint {key} must be '{expected}'")
        if plan.gates:
            final_gate = plan.gates[-1]
            final_events = histories.get(final_gate.id, {})
            tail = tail_event(final_events)
            if not tail or tail.event_type != "gate-passed":
                errors.append("runbook: completed effort Last event must reference final Gate gate-passed event")
            else:
                if checkpoint.get("Last event") != tail.event_id:
                    errors.append("runbook: completed effort Last event must equal final Gate history tail")
                if checkpoint.get("History head") != tail.fields.get("Event hash"):
                    errors.append("runbook: completed effort History head must equal final Gate history tail hash")
    elif ledger:
        errors.append("runbook: Ledger has no active/blocked Gate and is not complete")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Goal Loop control-plane artifacts")
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
