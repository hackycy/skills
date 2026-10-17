#!/usr/bin/env python3
"""Validate the lightweight Goal Loop control plane."""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

RUNBOOK_SCHEMA = "goal-loop/runbook"
HISTORY_SCHEMA = "goal-loop/history"
BASELINE_SCHEMA = "goal-loop/contract-baseline"
CONTRACT_HASH_MODE = "sha256-utf8-crlf-to-lf"
TRANSACTION_SCHEMA = "goal-loop/transaction"

REQUIRED_GATE_HEADINGS = (
    "Purpose", "Inputs", "Objective", "Scope boundary", "Constraints",
    "Slice policy", "Verification", "Evidence rule", "Stop conditions", "Exit conditions",
)
STATE_RULES = (
    "`implementation-plan.md` 是 Gate 合同唯一来源；runbook 只保存当前执行状态和最新 checkpoint。",
    "`goal/contract-baseline.json` 声明合同输入集合及内容哈希；合同输入漂移时停止执行。",
    "每个已激活 Gate 只有一个 `goal/history/G<n>.md`；history 仅用于追溯，不参与默认状态重放。",
    "一次只允许唯一 `active` 或 `blocked` Gate；`blocked` 只对应计划声明的 Stop condition。",
    "所有运行态修改使用 goal-loop control script 并携带当前 runbook Revision；陈旧 Revision 的写入必须拒绝。",
    "稳定 slice 替换 runbook checkpoint；Gate 保持 `active`，后续 Goal 从 checkpoint 恢复。",
    "人工验收 pending 时 Gate 保持 `active`；当前 Goal 结束且不轮询，只在收到对应 acceptance id 的明确结果后继续。",
    "Gate 通过时只激活直接后继；最后一个 Gate 通过后 effort complete。",
)
EMPTY_MARKERS = {"none", "无", "—", "-", ""}


@dataclass(frozen=True)
class VerificationCheck:
    id: str
    kind: str
    description: str
    inputs: tuple[str, ...]


@dataclass(frozen=True)
class Gate:
    number: int
    name: str
    exits: list[str]
    checks: dict[str, VerificationCheck] = field(default_factory=dict)
    evidence_rules: dict[str, tuple[str, ...]] = field(default_factory=dict)
    stop_conditions: dict[str, str] = field(default_factory=dict)
    body: str = ""

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


@dataclass
class CheckState:
    outcome: str
    fingerprint: str
    matched_files: int
    result: str = ""
    acceptance: str = "none"
    exit_code: str = "none"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def contract_bytes(data: bytes) -> bytes:
    """Normalize only CRLF in UTF-8 text; preserve binary and all other bytes."""
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    return data if b"\x00" in data else data.replace(b"\r\n", b"\n")


def contract_sha256(data: bytes) -> str:
    return sha256_bytes(contract_bytes(data))


def matches_contract_digest(data: bytes, expected: str, *, legacy: bool = False) -> bool:
    normalized = contract_bytes(data)
    if sha256_bytes(normalized) == expected:
        return True
    if not legacy:
        return False
    if sha256_bytes(data) == expected:
        return True
    # Raw digests recorded before hash_mode may represent uniform CRLF text.
    try:
        normalized.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return b"\x00" not in normalized and sha256_bytes(normalized.replace(b"\n", b"\r\n")) == expected


def find_repo_root(effort: Path) -> Path:
    effort = effort.resolve()
    for parent in [effort, *effort.parents]:
        if (parent / ".git").exists():
            return parent
    return effort


def repo_relative(path: Path, repo_root: Path) -> str:
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def section(text: str, heading: str, level: int = 2) -> str | None:
    marker = "#" * level + " " + heading
    pattern = re.compile(rf"(?ms)^{re.escape(marker)}\s*\n(.*?)(?=^{re.escape('#' * level + ' ')}|\Z)")
    match = pattern.search(text)
    return match.group(1).strip() if match else None


def parse_table_from_body(body: str) -> list[list[str]]:
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


def parse_markdown_table(text: str, heading: str) -> list[list[str]]:
    return parse_table_from_body(section(text, heading) or "")


def unquote_code(value: str) -> str:
    value = value.strip()
    return value[1:-1] if value.startswith("`") and value.endswith("`") else value.replace("`", "")


def parse_input_patterns(value: str, errors: list[str], *, gate_id: str, check_id: str) -> tuple[str, ...]:
    if value.strip().lower() in EMPTY_MARKERS:
        return ()
    result: list[str] = []
    for part in value.replace("<br>", ",").replace("<br/>", ",").replace("<br />", ",").split(","):
        item = unquote_code(part.strip())
        if not item:
            continue
        path = item.replace("\\", "/")
        if Path(path).is_absolute() or path.startswith("../") or "/../" in path or path.startswith("goal/") or "/goal/" in path:
            errors.append(f"plan: {gate_id} check {check_id} Evidence inputs must be repository-relative and outside goal/: {item}")
        else:
            result.append(path)
    return tuple(result)


def _parse_verification_checks(gate_id: str, body: str, errors: list[str]) -> dict[str, VerificationCheck]:
    match = re.search(r"(?ms)^### Verification\s*\n(.*?)(?=^### |\Z)", body)
    checks: dict[str, VerificationCheck] = {}
    if not match:
        return checks
    for heading, prefix, description_header in (("Directed", "D", "Check"), ("Repository", "R", "Command"), ("Manual acceptance", "M", "Scenario")):
        sub = section(match.group(1), heading, 4) or ""
        rows = parse_table_from_body(sub)
        if not rows:
            continue
        expected = ["ID", description_header, "Evidence inputs"]
        if rows[0] != expected:
            errors.append(f"plan: {gate_id} Verification/{heading} table header must be {expected}; got {rows[0]}")
            continue
        for row in rows[1:]:
            if len(row) != 3:
                errors.append(f"plan: {gate_id} malformed Verification/{heading} row: {row}")
                continue
            check_id = unquote_code(row[0])
            if not re.fullmatch(rf"{prefix}\d+", check_id):
                errors.append(f"plan: {gate_id} {heading} check id is invalid: {check_id}")
                continue
            if check_id in checks:
                errors.append(f"plan: {gate_id} duplicate verification check id {check_id}")
                continue
            checks[check_id] = VerificationCheck(check_id, heading, unquote_code(row[1]).strip(), parse_input_patterns(row[2], errors, gate_id=gate_id, check_id=check_id))
    return checks


def _parse_stop_conditions(gate_id: str, body: str, errors: list[str]) -> dict[str, str]:
    match = re.search(r"(?ms)^### Stop conditions\s*\n(.*?)(?=^### |\Z)", body)
    raw = match.group(1).strip() if match else ""
    if raw.lower() in EMPTY_MARKERS or re.fullmatch(r"-\s*(?:无|none)\s*", raw, flags=re.I):
        return {}
    conditions: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip().startswith("-"):
            continue
        found = re.match(r"^-\s+`(SC\d+)`:\s+(.+)$", line.strip())
        if found:
            conditions[found.group(1)] = found.group(2).strip()
        else:
            errors.append(f"plan: {gate_id} Stop conditions must use `SC<n>` ids: {line.strip()}")
    if list(conditions) != [f"SC{i}" for i in range(1, len(conditions) + 1)]:
        errors.append(f"plan: {gate_id} Stop condition ids must be continuous from SC1")
    return conditions


def parse_plan(text: str, errors: list[str]) -> Plan:
    rows = parse_markdown_table(text, "Contract Sources")
    sources: list[str] = []
    if len(rows) < 2 or rows[0] != ["Path", "Role"]:
        errors.append("plan: Contract Sources table missing or invalid")
    else:
        for row in rows[1:]:
            if len(row) != 2:
                errors.append(f"plan: malformed Contract Sources row: {row}")
                continue
            path = unquote_code(row[0])
            if Path(path).is_absolute() or path.startswith("../") or "/../" in path or path.startswith("goal/"):
                errors.append(f"plan: Contract Sources path must be repository-relative and outside goal/: {path}")
            sources.append(path)
    if sources != sorted(sources):
        errors.append("plan: Contract Sources paths must be lexicographically sorted")
    if len(sources) != len(set(sources)):
        errors.append("plan: Contract Sources contains duplicate paths")

    matches = list(re.finditer(r"(?m)^## G(\d+): (.+?)\s*$", text))
    gates: list[Gate] = []
    for index, match in enumerate(matches):
        number, name = int(match.group(1)), match.group(2).strip()
        body = text[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(text)]
        for heading in REQUIRED_GATE_HEADINGS:
            if not re.search(rf"(?m)^### {re.escape(heading)}\s*$", body):
                errors.append(f"plan: G{number} missing '### {heading}'")
        exit_match = re.search(r"(?ms)^### Exit conditions\s*\n(.*?)(?=^### |\Z)", body)
        exits = re.findall(r"(?m)^-\s+`(E\d+)`:\s+.+$", exit_match.group(1) if exit_match else "")
        if not exits or exits != [f"E{i}" for i in range(1, len(exits) + 1)]:
            errors.append(f"plan: G{number} Exit ids must be continuous from E1 and non-empty")
        checks = _parse_verification_checks(f"G{number}", body, errors)
        if not checks:
            errors.append(f"plan: G{number} must declare at least one Verification check")
        for prefix in "DRM":
            ids = [cid for cid in checks if cid.startswith(prefix)]
            if ids != [f"{prefix}{i}" for i in range(1, len(ids) + 1)]:
                errors.append(f"plan: G{number} {prefix} check ids must be continuous from {prefix}1")
        evidence_match = re.search(r"(?ms)^### Evidence rule\s*\n(.*?)(?=^### |\Z)", body)
        evidence_rows = parse_table_from_body(evidence_match.group(1) if evidence_match else "")
        rules: dict[str, tuple[str, ...]] = {}
        if not evidence_rows or evidence_rows[0] != ["Exit", "Required checks"]:
            errors.append(f"plan: G{number} Evidence rule table missing or invalid")
        else:
            for row in evidence_rows[1:]:
                if len(row) != 2:
                    errors.append(f"plan: G{number} malformed Evidence rule row: {row}")
                    continue
                exit_id = unquote_code(row[0])
                reqs = tuple(unquote_code(x.strip()) for x in row[1].replace("<br>", ",").split(",") if x.strip())
                if exit_id not in exits or not reqs or any(cid not in checks for cid in reqs):
                    errors.append(f"plan: G{number} Evidence rule has invalid checks for {exit_id}")
                rules[exit_id] = reqs
            if set(rules) != set(exits):
                errors.append(f"plan: G{number} Evidence rule must cover exactly {exits}")
            unused = [cid for cid in checks if not any(cid in reqs for reqs in rules.values())]
            if unused:
                errors.append(f"plan: G{number} verification checks are not referenced by any Exit: {unused}")
        gates.append(Gate(number, name, exits, checks, rules, _parse_stop_conditions(f"G{number}", body, errors), body.strip()))
    if [gate.number for gate in gates] != list(range(len(gates))):
        errors.append("plan: Gate numbers must be continuous from G0")
    expected_top = ["Contract Sources", "Source Decisions", "Outcome", "Non-Negotiable Rules", "Gate Overview", *[gate.label for gate in gates], "Definition Of Done", "Explicitly Out Of Scope"]
    if re.findall(r"(?m)^## (.+?)\s*$", text) != expected_top:
        errors.append("plan: top-level sections do not match required order")
    overview = parse_markdown_table(text, "Gate Overview")
    if len(overview) < 2 or overview[0] != ["Gate", "Name", "Unlock condition", "Outcome"]:
        errors.append("plan: Gate Overview table missing or invalid")
    elif [(unquote_code(row[0]), unquote_code(row[1])) for row in overview[1:] if len(row) >= 2] != [(gate.id, gate.name) for gate in gates]:
        errors.append("plan: Gate Overview rows do not match Gate detail headings")
    return Plan(gates, sources)


def parse_revision(runbook: str, errors: list[str]) -> int | None:
    match = re.search(r"(?m)^Revision:\s+`(\d+)`\s*$", runbook)
    if not match:
        errors.append("runbook: missing numeric Revision")
        return None
    return int(match.group(1))


def parse_contract_baseline(runbook: str, errors: list[str]) -> tuple[str, str]:
    values: dict[str, str] = {}
    for line in (section(runbook, "Contract Baseline") or "").splitlines():
        match = re.match(r"^-\s+([^:]+):\s*(.+?)\s*$", line.strip())
        if match:
            values[match.group(1).strip()] = unquote_code(match.group(2).strip())
    manifest, digest = values.get("Manifest", ""), values.get("Manifest SHA-256", "")
    if manifest != "goal/contract-baseline.json":
        errors.append("runbook: Contract Baseline Manifest must be goal/contract-baseline.json")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        errors.append("runbook: Contract Baseline Manifest SHA-256 must be 64 lowercase hex characters")
    return manifest, digest


def parse_ledger(runbook: str, errors: list[str]) -> list[LedgerRow]:
    rows = parse_markdown_table(runbook, "Goal Ledger")
    expected = ["Gate", "Status", "Depends on", "Plan contract", "History", "History head", "Unlock evidence"]
    if len(rows) < 2 or rows[0] != expected:
        errors.append("runbook: Goal Ledger table missing or invalid")
        return []
    result: list[LedgerRow] = []
    for row in rows[1:]:
        if len(row) != 7:
            errors.append(f"runbook: malformed Goal Ledger row: {row}")
        else:
            result.append(LedgerRow(*(unquote_code(cell) for cell in row)))
    return result


def parse_checkpoint(runbook: str, errors: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (section(runbook, "Current Checkpoint") or "").splitlines():
        match = re.match(r"^-\s+([^:]+):\s*(.+?)\s*$", line.strip())
        if match:
            values[match.group(1).strip()] = unquote_code(match.group(2).strip())
    required = ("Gate", "History", "History head", "Last completed slice", "Current slice", "Checks", "Satisfied exits", "Manual acceptance", "Blocker", "Risks", "Next action", "Contract revision")
    missing = [key for key in required if key not in values]
    if missing:
        errors.append(f"runbook: Current Checkpoint missing {missing}")
    return values


def parse_history_text(text: str, gate: Gate, source_name: str, errors: list[str]) -> dict[str, Event]:
    """Read recorded facts only when importing a runbook without a check snapshot."""
    events: dict[str, Event] = {}
    chunks = re.split(r"(?m)^### (" + re.escape(gate.id) + r"-E\d+) · ([^\n]+)\s*$", text)[1:]
    for index in range(0, len(chunks), 3):
        event_id, event_type, body = chunks[index:index + 3]
        fields: dict[str, str] = {}
        for line in body.splitlines():
            match = re.match(r"^-\s+([^:]+):\s*(.*)$", line.strip())
            if match:
                fields[match.group(1).strip()] = unquote_code(match.group(2).strip())
        if event_id in events:
            errors.append(f"history {source_name}: duplicate event {event_id}")
        events[event_id] = Event(event_id, event_type, fields)
    return events


def parse_history(path: Path, gate: Gate, errors: list[str]) -> dict[str, Event]:
    try:
        return parse_history_text(path.read_text(encoding="utf-8"), gate, path.name, errors)
    except (OSError, UnicodeError) as exc:
        errors.append(f"cannot read history needed for current facts: {path}: {exc}")
        return {}


def tail_event(events: dict[str, Event]) -> Event | None:
    return events[next(reversed(events))] if events else None


def expand_evidence_inputs(repo_root: Path, patterns: tuple[str, ...]) -> tuple[list[tuple[str, str]], list[str]]:
    matches: list[str] = []
    missing: list[str] = []
    for pattern in patterns:
        files = [Path(item) for item in glob.glob(str(repo_root / pattern), recursive=True) if Path(item).is_file()]
        if not files:
            missing.append(pattern)
        matches.extend(repo_relative(path, repo_root) for path in files)
    return [(path, sha256(repo_root / path)) for path in sorted(set(matches))], missing


def evidence_fingerprint(repo_root: Path, check: VerificationCheck) -> tuple[str, int, list[str]]:
    entries, missing = expand_evidence_inputs(repo_root, check.inputs)
    payload = "\n".join(f"{path} {digest}" for path, digest in entries).encode("utf-8")
    return sha256_bytes(payload), len(entries), missing


def latest_check_events(events: dict[str, Event], gate: Gate) -> dict[str, Event]:
    latest: dict[str, Event] = {}
    for event in events.values():
        check = event.fields.get("Check")
        if check in gate.checks and event.event_type in {"verification", "manual-result"}:
            latest[check] = event
    return latest


def check_summary(checks: dict[str, CheckState], gate: Gate) -> str:
    return ", ".join(f"{cid}={checks[cid].outcome}" for cid in gate.checks if cid in checks) or "none"


def effective_satisfied_exits(checks: dict[str, CheckState], gate: Gate) -> set[str]:
    return {exit_id for exit_id, required in gate.evidence_rules.items() if all(cid in checks and checks[cid].outcome == "pass" for cid in required)}


def stale_checks(repo_root: Path, gate: Gate, checks: dict[str, CheckState]) -> dict[str, str]:
    stale: dict[str, str] = {}
    for check_id, check in checks.items():
        if check.outcome not in {"pass", "started"}:
            continue
        fingerprint, count, missing = evidence_fingerprint(repo_root, gate.checks[check_id])
        if missing or fingerprint != check.fingerprint or count != check.matched_files:
            stale[check_id] = ", ".join(missing) if missing else "evidence fingerprint changed"
    return stale


def parse_current_checks(runbook: str, errors: list[str]) -> dict[str, CheckState] | None:
    body = section(runbook, "Current Checks")
    if body is None:
        return None
    match = re.fullmatch(r"\s*```json\s*\n(.*?)\n```\s*", body, re.S)
    try:
        data = json.loads(match.group(1)) if match else None
        if not isinstance(data, dict):
            raise ValueError("expected a JSON object")
        checks = {}
        for cid, fields in data.items():
            if not isinstance(fields, dict):
                raise ValueError(f"{cid}: expected a check object")
            check = CheckState(**{key: fields[key] for key in CheckState.__dataclass_fields__ if key in fields})
            if check.outcome not in {"started", "pass", "fail", "timed-out", "interrupted", "cancelled"}:
                raise ValueError(f"{cid}: unknown outcome")
            if not isinstance(check.fingerprint, str) or not re.fullmatch(r"[0-9a-f]{64}", check.fingerprint):
                raise ValueError(f"{cid}: invalid evidence fingerprint")
            if type(check.matched_files) is not int or check.matched_files < 0:
                raise ValueError(f"{cid}: invalid matched file count")
            if not all(isinstance(value, str) for value in (check.result, check.acceptance, check.exit_code)):
                raise ValueError(f"{cid}: invalid check details")
            checks[cid] = check
        return checks
    except (ValueError, TypeError) as exc:
        errors.append(f"runbook: invalid Current Checks: {exc}")
        return {}


def load_current_checks(effort: Path, runbook: str, gate: Gate | None, checkpoint: dict[str, str], errors: list[str]) -> dict[str, CheckState]:
    checks = parse_current_checks(runbook, errors)
    if checks is not None:
        return checks
    # Compatibility is read-only. Only records needed for the current facts are consulted.
    if gate is None or (checkpoint.get("Checks") == "none" and checkpoint.get("Manual acceptance") == "none"):
        return {}
    path = effort / "goal" / "history" / f"{gate.id}.md"
    events = parse_history(path, gate, errors)
    tail = tail_event(events)
    if not tail or tail.event_id != checkpoint.get("History head"):
        errors.append("current check snapshot is missing and the current history does not reach the saved checkpoint")
    latest = latest_check_events(events, gate)
    advertised = checkpoint.get("Checks", "none")
    actual = {f"{cid}={event.fields.get('Outcome')}" for cid, event in latest.items()}
    if ({item.strip() for item in advertised.split(",")} if advertised != "none" else set()) != actual:
        errors.append("current check snapshot is missing and history disagrees with checkpoint Checks")
    # Include pending handoffs and cancellation, which older summaries did not contain.
    for event in events.values():
        cid = event.fields.get("Check")
        if cid in gate.checks and event.event_type == "manual-handoff":
            latest[cid] = event
        elif cid in gate.checks and event.event_type in {"verification", "manual-result"}:
            latest[cid] = event
        elif cid in latest and event.fields.get("Outcome") == "cancelled":
            previous = latest[cid]
            latest[cid] = Event(event.event_id, event.event_type, {**previous.fields, **event.fields})
    checks = {}
    for cid, event in latest.items():
        fields = event.fields
        try:
            fingerprint = fields["Evidence fingerprint"]
            count = int(fields["Matched files"])
            if not re.fullmatch(r"[0-9a-f]{64}", fingerprint) or count < 0:
                raise ValueError("invalid evidence metadata")
            acceptance = fields.get("Acceptance", f"{gate.id}-{cid}" if gate.checks[cid].kind == "Manual acceptance" else "none")
            checks[cid] = CheckState(fields["Outcome"], fingerprint, count, fields.get("Result", ""), acceptance, fields.get("Exit code", "none"))
        except (KeyError, ValueError) as exc:
            errors.append(f"cannot restore current check {cid} from history: {exc}")
    return checks


def load_baseline_manifest(path: Path, errors: list[str]) -> dict[str, object] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        errors.append(f"baseline: cannot read manifest: {exc}")
        return None
    if not isinstance(data, dict) or data.get("schema") not in {BASELINE_SCHEMA, "goal-loop/contract-baseline-v2"} or not isinstance(data.get("files"), list):
        errors.append(f"baseline: schema must be {BASELINE_SCHEMA} with files")
        return None
    if "hash_mode" in data and data["hash_mode"] != CONTRACT_HASH_MODE:
        errors.append("baseline: unsupported hash_mode")
        return None
    return data


def validate_baseline(effort: Path, repo_root: Path, plan_path: Path, plan: Plan, runbook: str, errors: list[str], *, check_drift: bool = True) -> None:
    manifest_path = effort / "goal" / "contract-baseline.json"
    manifest = load_baseline_manifest(manifest_path, errors)
    if manifest is None:
        return
    entries = manifest["files"]
    actual = {item.get("path"): item.get("sha256") for item in entries if isinstance(item, dict)}
    plan_rel = repo_relative(plan_path, repo_root)
    expected = sorted({plan_rel, *plan.contract_sources})
    if sorted(actual) != expected:
        errors.append("baseline: file paths must exactly match implementation-plan.md and Contract Sources")
    if check_drift:
        drift = [rel for rel in expected if rel not in actual or not (repo_root / rel).exists()
                 or not matches_contract_digest((repo_root / rel).read_bytes(), actual[rel], legacy="hash_mode" not in manifest)]
        if drift:
            errors.append("baseline: contract input drift detected: " + ", ".join(drift))
    _, digest = parse_contract_baseline(runbook, errors)
    if not matches_contract_digest(manifest_path.read_bytes(), digest, legacy=True):
        errors.append("runbook: Contract Baseline Manifest SHA-256 does not match manifest")


def validate_prompt(effort: Path, errors: list[str]) -> None:
    try:
        text = (effort / "goal" / "prompt.md").read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"prompt: cannot read goal/prompt.md: {exc}")
        return
    if not text.strip():
        errors.append("prompt: saved entry is empty")


def valid_ledger_shape(rows: list[LedgerRow]) -> bool:
    statuses = [row.status for row in rows]
    if any(status not in {"planned", "active", "blocked", "passed"} for status in statuses):
        return False
    if statuses.count("active") + statuses.count("blocked") > 1:
        return False
    current = next((index for index, status in enumerate(statuses) if status in {"active", "blocked"}), None)
    if current is None:
        return all(status == "passed" for status in statuses)
    return statuses[:current] == ["passed"] * current and statuses[current + 1:] == ["planned"] * (len(statuses) - current - 1)


def old_runtime_present(effort: Path) -> list[str]:
    return [name for name in ("commits", "objects", "spool", "state.json", "evidence") if (effort / "goal" / name).exists()]


def validate(effort: Path, *, allow_baseline_drift: bool = False, allow_pending_transaction: bool = False, check_prompt: bool = True) -> list[str]:
    effort = effort.resolve()
    errors: list[str] = []
    old = old_runtime_present(effort)
    if old:
        errors.append("unsupported legacy runtime directory; existing files retained: " + ", ".join(old))
    goal = effort / "goal"
    if (goal / ".goal-loop-transaction.json").exists() and not allow_pending_transaction:
        errors.append("pending control-plane transaction exists; run recover")
    plan_path, runbook_path = effort / "implementation-plan.md", goal / "runbook.md"
    if not plan_path.exists() or not runbook_path.exists():
        return errors + ["missing implementation-plan.md or goal/runbook.md"]
    plan_errors: list[str] = []
    plan = parse_plan(plan_path.read_text(encoding="utf-8"), plan_errors)
    errors.extend(plan_errors)
    runbook = runbook_path.read_text(encoding="utf-8")
    revision_errors: list[str] = []
    parse_revision(runbook, revision_errors)
    errors.extend(revision_errors)
    parse_contract_baseline(runbook, errors)
    rows = parse_ledger(runbook, errors)
    checkpoint = parse_checkpoint(runbook, errors)
    if len(rows) != len(plan.gates) and not allow_baseline_drift:
        errors.append("runbook: Goal Ledger must contain exactly one row per plan Gate")
    if rows and not valid_ledger_shape(rows):
        errors.append("runbook: Goal Ledger state is not a linear Gate sequence")
    repo_root = find_repo_root(effort)
    if plan.gates:
        validate_baseline(effort, repo_root, plan_path, plan, runbook, errors, check_drift=not allow_baseline_drift)
    if check_prompt:
        validate_prompt(effort, errors)
    active = [index for index, row in enumerate(rows) if row.status in {"active", "blocked"}]
    if len(active) > 1:
        errors.append("runbook: more than one active or blocked Gate")
    if active and rows[active[0]].gate != checkpoint.get("Gate"):
        errors.append("runbook: checkpoint Gate must equal the active Gate")
    if not active and checkpoint.get("Gate") != "none":
        errors.append("runbook: completed ledger must have no current Gate")
    for index, row in enumerate(rows):
        if index >= len(plan.gates) or row.gate != plan.gates[index].label:
            if allow_baseline_drift:
                continue
            errors.append(f"runbook: Ledger Gate row {index} does not match plan")
            continue
        if row.status in {"active", "blocked", "passed"}:
            if row.history != f"goal/history/{plan.gates[index].id}.md":
                errors.append(f"runbook: {row.gate} has an invalid history path")
        elif row.history != "—" or row.history_head != "—":
            errors.append(f"runbook: planned Gate {row.gate} must not have history")
    if checkpoint.get("Gate") == "none" and rows and any(row.status != "passed" for row in rows):
        errors.append("runbook: completed checkpoint requires every Gate passed")
    gate = next((g for g in plan.gates if g.label == checkpoint.get("Gate")), None)
    checks = load_current_checks(effort, runbook, gate, checkpoint, errors)
    if gate is None:
        if checks or checkpoint.get("Gate") != "none" or checkpoint.get("Manual acceptance") != "none":
            errors.append("runbook: completed effort must have no current checks or pending acceptance")
    else:
        for cid, check in checks.items():
            if cid not in gate.checks:
                errors.append(f"runbook: unknown current check {cid}")
            if check.outcome not in {"started", "pass", "fail", "timed-out", "interrupted", "cancelled"}:
                errors.append(f"runbook: invalid outcome for {cid}")
        pending = [check.acceptance for cid, check in checks.items() if cid in gate.checks and gate.checks[cid].kind == "Manual acceptance" and check.outcome == "started"]
        manual = checkpoint.get("Manual acceptance")
        if (pending and (len(pending) != 1 or pending[0] == "none" or manual != f"pending {pending[0]}")) or (not pending and manual != "none"):
            errors.append("runbook: pending acceptance does not match current check snapshot")
        if section(runbook, "Current Checks") is not None:
            if checkpoint.get("Checks") != check_summary(checks, gate):
                errors.append("runbook: checkpoint Checks do not match current check snapshot")
            satisfied = effective_satisfied_exits(checks, gate)
            expected = "all" if satisfied == set(gate.exits) else (", ".join(e for e in gate.exits if e in satisfied) or "none")
            if checkpoint.get("Satisfied exits") != expected:
                errors.append("runbook: Satisfied exits do not match current check snapshot")
        if active and rows[active[0]].status == "blocked" and checkpoint.get("Blocker", "").split(":", 1)[0] not in gate.stop_conditions:
            errors.append("runbook: blocked Gate requires a declared Stop condition")
    return errors


def configure_stdio() -> None:
    # Pipe consumers use UTF-8 even when Windows defaults to a legacy code page.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser()
    parser.add_argument("effort", type=Path)
    args = parser.parse_args()
    errors = validate(args.effort)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors))
        return 1
    print("OK: goal-loop artifacts are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
