"""The single state-transition implementation used by execution and replay.

Transitions operate on a copy and immutable observed objects. They perform no writes,
run no commands, and do not consult the current workspace.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
from typing import Protocol

from .common import canonical, decode, digest, require
from .contract import compile_plan, proposal
from .evidence import matches, validate_snapshot

class Reader(Protocol):
    def __call__(self, ref: str) -> bytes: ...
    def verify(self, ref: str) -> None: ...


@dataclass(frozen=True)
class ContractRevision:
    id: str
    object: str
    payload: dict


@dataclass(frozen=True)
class CheckDefinition:
    id: str
    kind: str
    payload: dict


@dataclass
class GateRun:
    id: str
    gate_id: str
    contract_id: str
    definition: dict
    status: str
    superseded: bool = False
    latest: dict[str, str] = field(default_factory=dict)
    evidence: dict[str, list[str]] = field(default_factory=dict)
    checkpoint: dict = field(default_factory=lambda: {"last_completed_slice": None, "current_slice": None, "next_action": "select a slice", "risks": [], "blocker": None})


@dataclass
class CheckAttempt:
    id: str
    run_id: str
    check_id: str
    snapshot: str
    subject: str
    owner: str | None
    status: str = "running"
    reported_outcome: str | None = None
    end_snapshot: str | None = None
    result: str | None = None
    revoked: bool = False
    output: dict = field(default_factory=dict)


@dataclass
class State:
    revision: int = -1
    head: str | None = None
    protocol: dict = field(default_factory=dict)
    contracts: dict[str, ContractRevision] = field(default_factory=dict)
    contract_id: str = ""
    runs: dict[str, GateRun] = field(default_factory=dict)
    current: list[str] = field(default_factory=list)
    attempts: dict[str, CheckAttempt] = field(default_factory=dict)
    notes: list[dict] = field(default_factory=list)

    def payload(self) -> dict:
        return asdict(self)

    @property
    def contract(self) -> dict:
        return self.contracts[self.contract_id].payload

    def active(self) -> GateRun | None:
        return next((self.runs[key] for key in self.current if self.runs[key].status in {"active", "blocked"}), None)

    def pending(self) -> CheckAttempt | None:
        return next((attempt for attempt in self.attempts.values() if attempt.status == "running"), None)

    def check(self, run: GateRun, check_id: str) -> CheckDefinition:
        item = next((check for check in run.definition["checks"] if check["id"] == check_id), None)
        require(item is not None, f"unknown check {check_id} for {run.gate_id}")
        return CheckDefinition(check_id, {"D": "directed", "R": "repository", "M": "manual"}[check_id[0]], item)


def read_json(reader: Reader, ref: str) -> dict:
    result = decode(reader(ref))
    require(isinstance(result, dict), "referenced JSON object must be an object")
    return result


def checked_contract(reader: Reader, ref: str) -> dict:
    value = read_json(reader, ref)
    require(value.get("schema") == "goal-loop/contract-revision" and type(value.get("format_version")) is int and value["format_version"] == 1, "unsupported ContractRevision format")
    require(compile_plan(reader(value["plan"])) == value["contract"], "frozen plan and compiled contract differ")
    expected = [item["path"] for item in value["contract"]["sources"]]
    require([item["path"] for item in value["sources"]] == expected, "ContractRevision source manifest mismatch")
    for source in value["sources"]:
        reader.verify(source["sha256"])
    require(isinstance(value["reason"], str) and bool(value["reason"].strip()), "contract revision requires a reason")
    return value


def reopen(state: State, start: int, reason: str) -> None:
    retired = set(state.current[start:])
    for key in retired:
        state.runs[key].superseded = True
    for attempt in state.attempts.values():
        if attempt.run_id in retired and attempt.status == "running":
            require(attempt.owner is None, "cancel the Repository execution before revising its contract")
            attempt.status = "cancelled"
            attempt.result = reason
    state.current = state.current[:start]
    for gate in state.contract["contract"]["gates"][start:]:
        key = f"GR{len(state.runs) + 1:06d}"
        status = "active" if all(state.runs[item].status == "passed" for item in state.current) else "planned"
        state.runs[key] = GateRun(key, gate["id"], state.contract_id, deepcopy(gate), status)
        state.current.append(key)


def require_active(state: State) -> GateRun:
    run = state.active()
    require(run is not None and run.status == "active", "operation requires an active Gate")
    return run


def effective(state: State, run: GateRun) -> dict[str, str]:
    return {check: key for check, key in run.latest.items() if state.attempts[key].status == "pass" and not state.attempts[key].revoked}


def satisfied(state: State, run: GateRun) -> list[str]:
    checks = effective(state, run)
    return [rule["id"] for rule in run.definition["exits"] if all(cid in checks for cid in rule["checks"])]


def transition(original: State, events: list[dict], reader: Reader) -> State:
    state = deepcopy(original)
    require(isinstance(events, list) and bool(events), "commit requires events")
    for event in events:
        kind = event["type"]
        if kind == "initialized":
            require(not state.contracts, "effort is already initialized")
            value = checked_contract(reader, event["contract"])
            protocol = read_json(reader, event["protocol"])
            require(protocol.get("schema") == "goal-loop/protocol" and type(protocol.get("format_version")) is int and protocol["format_version"] == 1, "unsupported execution protocol")
            reader.verify(protocol["template"])
            reader.verify(protocol["prompt"])
            state.protocol = protocol
            state.contract_id = "C000001"
            state.contracts[state.contract_id] = ContractRevision(state.contract_id, event["contract"], value)
            reopen(state, 0, "initialize Gate execution")
            continue
        require(bool(state.contracts), "first event must initialize the effort")
        if kind == "contract-revised":
            require(not (state.pending() and state.pending().owner), "cancel the Repository execution before revising its contract")
            value = checked_contract(reader, event["contract"])
            requested = f"G{event['reopen_from']}" if event["reopen_from"] is not None and event["reopen_from"] < len(value["contract"]["gates"]) else None
            expected = proposal(state.contract, value, event["mode"], requested)
            require(expected["reopen_from"] == event["reopen_from"], "contract revision impact mismatch")
            state.contract_id = f"C{len(state.contracts) + 1:06d}"
            state.contracts[state.contract_id] = ContractRevision(state.contract_id, event["contract"], value)
            if event["mode"] == "revalidate":
                reopen(state, event["reopen_from"], value["reason"])
        elif kind == "check-started":
            run = require_active(state)
            require(state.pending() is None, "another check attempt is unfinished")
            require(event["run_id"] == run.id, "check start targets a different GateRun")
            check = state.check(run, event["check_id"])
            require(event["attempt_id"] == f"A{len(state.attempts) + 1:06d}", "attempt id must be generated in sequence")
            snap = read_json(reader, event["snapshot"])
            validate_snapshot(snap, run.id, check.payload)
            require(not snap["missing"], "cannot start a check with missing evidence inputs")
            require(isinstance(event["subject"], str) and bool(event["subject"].strip()), "check requires an observed subject")
            require(bool(event.get("owner")) == (check.kind == "repository"), "Repository attempts require a runner owner")
            attempt = CheckAttempt(event["attempt_id"], run.id, check.id, event["snapshot"], event["subject"], event.get("owner"))
            state.attempts[attempt.id] = attempt
            run.latest[check.id] = attempt.id
            run.checkpoint["next_action"] = f"finish {attempt.id}: {attempt.subject}"
        elif kind == "check-finished":
            attempt = state.attempts.get(event["attempt_id"])
            require(attempt is not None and attempt.status == "running", "attempt is not awaiting a result")
            run = require_active(state)
            require(run.id == attempt.run_id, "attempt belongs to another GateRun")
            require(event.get("owner") == attempt.owner, "attempt owner mismatch")
            check = state.check(run, attempt.check_id)
            before = read_json(reader, attempt.snapshot)
            after = read_json(reader, event["snapshot"])
            validate_snapshot(after, run.id, check.payload)
            termination = event.get("termination")
            require(termination in {None, "interrupted", "timed-out"}, "invalid termination reason")
            outcome = event.get("outcome")
            if check.kind == "repository":
                output = event.get("output", {})
                for key in ("stdout", "stderr"):
                    reader.verify(output[key])
                code = output.get("exit_code")
                require(code is None or type(code) is int, "invalid process exit code")
                require(termination is not None or code is not None, "finished command requires an exit code")
                expected = None if termination else ("pass" if code == 0 else "fail")
                require(outcome == expected, "Repository outcome must match its exit code")
                attempt.output = output
            else:
                require(termination is None and outcome in {"pass", "fail"}, "Directed and Manual results require pass or fail")
            require(isinstance(event["result"], str) and bool(event["result"].strip()), "check result must describe an observed fact")
            attempt.reported_outcome = outcome
            attempt.end_snapshot = event["snapshot"]
            attempt.result = event["result"]
            attempt.status = termination or ("stale" if event.get("contract_drift") or not matches(before, after) else outcome)
            run.checkpoint["next_action"] = "review check results and select the next action"
        elif kind == "check-cancelled":
            attempt = state.attempts.get(event["attempt_id"])
            require(attempt is not None and attempt.status == "running", "attempt is not awaiting a result")
            require(bool(event["reason"].strip()), "cancellation requires a reason")
            attempt.status = "cancelled"
            attempt.result = event["reason"]
            state.runs[attempt.run_id].checkpoint["next_action"] = "start a check when its inputs are ready"
        elif kind == "check-output":
            attempt = state.attempts.get(event["attempt_id"])
            require(attempt is not None and attempt.status == "cancelled" and attempt.owner == event["owner"], "output requires the owner of a cancelled Repository attempt")
            require(not attempt.output, "Repository output was already recorded")
            for key in ("stdout", "stderr"):
                reader.verify(event["output"][key])
            attempt.output = event["output"]
        elif kind == "gate-passed":
            run = require_active(state)
            require(state.pending() is None and run.id == event["run_id"], "Gate pass requires its active run with no pending check")
            mapping = {rule["id"]: [run.latest.get(cid) for cid in rule["checks"]] for rule in run.definition["exits"]}
            require(mapping == event["evidence"], "Gate pass must reference each latest check attempt")
            attempts = {key for keys in mapping.values() for key in keys}
            require(None not in attempts and set(event["snapshots"]) == attempts, "Gate pass requires every declared check")
            for key in attempts:
                attempt = state.attempts[key]
                require(attempt.status == "pass" and not attempt.revoked, "Gate pass requires effective passing attempts")
                check = state.check(run, attempt.check_id)
                current = read_json(reader, event["snapshots"][key])
                validate_snapshot(current, run.id, check.payload)
                require(matches(read_json(reader, attempt.snapshot), current), f"stale evidence for {attempt.check_id}")
            run.status = "passed"
            run.evidence = mapping
            index = state.current.index(run.id)
            if index + 1 < len(state.current):
                state.runs[state.current[index + 1]].status = "active"
        elif kind == "blocked":
            run = require_active(state)
            require(bool(event["reason"].strip()) and bool(event["next_action"].strip()), "block requires a reason and next action")
            require(state.pending() is None, "finish or cancel the check before blocking")
            stop = next((item for item in run.definition["stop_conditions"] if item["id"] == event["condition"]), None)
            require(stop is not None, "unknown Stop condition")
            run.status = "blocked"
            run.checkpoint["blocker"] = f"{stop['id']}: {stop['description']}; {event['reason']}"
            run.checkpoint["next_action"] = event["next_action"]
        elif kind == "resumed":
            run = state.active()
            require(run is not None and run.status == "blocked", "resume requires a blocked Gate")
            require(bool(event["reason"].strip()) and bool(event["next_action"].strip()), "resume requires a reason and next action")
            run.status = "active"
            run.checkpoint["blocker"] = None
            run.checkpoint["next_action"] = event["next_action"]
        elif kind == "recorded":
            run = require_active(state)
            require(state.pending() is None, "finish or cancel the check before recording a slice")
            require(event["kind"] in {"slice", "checkpoint", "failure", "rollback"}, "invalid execution note kind")
            require(bool(event["result"].strip()) and bool(event["next_action"].strip()), "execution note requires result and next action")
            for key in ("last_completed_slice", "current_slice", "risks", "next_action"):
                if key in event:
                    if key == "risks":
                        require(isinstance(event[key], list) and all(isinstance(item, str) for item in event[key]), "risks must be a list of text")
                    else:
                        require(isinstance(event[key], str), f"{key} must be text")
                    run.checkpoint[key] = event[key]
        elif kind == "corrected":
            require(bool(event["reason"].strip()), "correction requires a reason")
            require(type(event["commit"]) is int and 0 <= event["commit"] <= original.revision, "correction must reference a committed record")
            key = event.get("attempt_id")
            if key:
                require(key in state.attempts, "correction references unknown attempt")
                require(any(note["revision"] == event["commit"] and note.get("attempt_id") == key for note in state.notes), "correction commit does not describe the referenced attempt")
                attempt = state.attempts[key]
                require(attempt.status != "running", "finish or cancel the attempt before correcting it")
                attempt.revoked = True
                for index, run_id in enumerate(state.current):
                    run = state.runs[run_id]
                    if run.status == "passed" and any(key in refs for refs in run.evidence.values()):
                        reopen(state, index, event["reason"])
                        break
        else:
            require(False, f"unknown event type: {kind}")
        state.notes.append({"revision": original.revision + 1, **deepcopy(event)})
    statuses = [state.runs[key].status for key in state.current]
    pivot = next((i for i, status in enumerate(statuses) if status != "passed"), len(statuses))
    require(all(status == "passed" for status in statuses[:pivot]) and
            (pivot == len(statuses) or statuses[pivot] in {"active", "blocked"} and all(status == "planned" for status in statuses[pivot + 1:])), "invalid linear Gate state")
    require(sum(attempt.status == "running" for attempt in state.attempts.values()) <= 1, "multiple unfinished attempts")
    return state
