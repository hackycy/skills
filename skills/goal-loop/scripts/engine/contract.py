"""Compile the explicit contract block in an authored Markdown plan."""

from __future__ import annotations

import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from .common import GoalError, canonical, decode, digest, local_path, relative_name, require

CONTRACT_SCHEMA = "goal-loop/contract"
FORMAT = 1
GATE_FIELDS = {"id", "name", "objective", "inputs", "scope", "constraints", "slice_policy", "checks", "exits", "stop_conditions", "rollback"}
TOP_FIELDS = {"schema", "format_version", "sources", "outcome", "rules", "definition_of_done", "out_of_scope", "coverage", "gates"}


def fields(value: Any, required: set[str], optional: set[str] | None = None) -> None:
    require(isinstance(value, dict), "contract item must be an object")
    require(required <= value.keys(), f"missing contract fields: {sorted(required - value.keys())}")
    require(value.keys() <= required | (optional or set()), f"unknown contract fields: {sorted(value.keys() - required - (optional or set()))}")


def text(value: Any, label: str) -> None:
    require(isinstance(value, str) and bool(value.strip()), f"{label} must be nonempty text")


def texts(value: Any, label: str) -> None:
    require(isinstance(value, list), f"{label} must be a list")
    for item in value:
        text(item, label)


def normalize(value: Any, *, key: str = "") -> Any:
    if key == "argv":
        return value
    if isinstance(value, dict):
        return {k: normalize(v, key=k) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    return value.replace("\r\n", "\n").strip() if isinstance(value, str) else value


def compile_plan(data: bytes) -> dict:
    try:
        raw = data.decode("utf-8").replace("\r\n", "\n")
    except UnicodeError as exc:
        raise GoalError("implementation plan must be UTF-8") from exc
    blocks = re.findall(r"(?ms)^```goal-loop-contract[ \t]*\r?\n(.*?)^```[ \t]*$", raw)
    require(len(blocks) == 1, "plan requires exactly one fenced goal-loop-contract JSON block")
    contract = normalize(decode(blocks[0].encode("utf-8")))
    fields(contract, TOP_FIELDS)
    require(contract["schema"] == CONTRACT_SCHEMA and type(contract["format_version"]) is int and contract["format_version"] == FORMAT,
            "unsupported contract format")
    text(contract["outcome"], "outcome")
    texts(contract["rules"], "rules")
    texts(contract["out_of_scope"], "out_of_scope")
    sources = contract["sources"]
    require(isinstance(sources, list) and bool(sources), "Contract Sources must not be empty")
    for source in sources:
        fields(source, {"path", "role"})
        relative_name(source["path"])
        text(source["role"], "source role")
    paths = [s["path"] for s in sources]
    require(len(set(paths)) == len(paths), "duplicate Contract Sources")
    contract["sources"] = sorted(sources, key=lambda s: s["path"])
    gates = contract["gates"]
    require(isinstance(gates, list) and bool(gates), "contract requires at least one Gate")
    all_exits: set[str] = set()
    for index, gate in enumerate(gates):
        fields(gate, GATE_FIELDS)
        require(gate["id"] == f"G{index}", "Gate ids must be continuous from G0")
        for key in ("name", "objective", "scope", "slice_policy", "rollback"):
            text(gate[key], f"{gate['id']}.{key}")
        for key in ("inputs", "constraints"):
            texts(gate[key], key)
        require(isinstance(gate["checks"], list) and bool(gate["checks"]), "Gate requires verification checks")
        ids = []
        for check in gate["checks"]:
            fields(check, {"id", "description", "evidence_inputs"}, {"environment", "argv", "timeout_seconds"})
            cid = check["id"]
            require(isinstance(cid, str) and bool(re.fullmatch(r"[DRM][1-9]\d*", cid)), "invalid check id")
            text(check["description"], "check description")
            texts(check["evidence_inputs"], "evidence_inputs")
            require(len(set(check["evidence_inputs"])) == len(check["evidence_inputs"]), "duplicate evidence input")
            for pattern in check["evidence_inputs"]:
                relative_name(pattern, glob=True)
            check.setdefault("environment", False)
            require(type(check["environment"]) is bool, "environment must be boolean")
            require(bool(check["evidence_inputs"]) != check["environment"], "empty evidence_inputs require an explicit environment check; environment checks have no file inputs")
            if cid.startswith("R"):
                require(isinstance(check.get("argv"), list) and bool(check["argv"]), "Repository check requires argv")
                require(all(isinstance(arg, str) and "\x00" not in arg for arg in check["argv"]) and bool(check["argv"][0]), "argv must contain strings and a nonempty executable")
                check.setdefault("timeout_seconds", 900)
                require(type(check["timeout_seconds"]) in {int, float} and 0 < check["timeout_seconds"] <= 86400, "timeout_seconds must be between 0 and 86400")
            else:
                require("argv" not in check and "timeout_seconds" not in check, "only Repository checks may declare execution parameters")
            ids.append(cid)
        for prefix in "DRM":
            group = [cid for cid in ids if cid.startswith(prefix)]
            require(group == [f"{prefix}{i+1}" for i in range(len(group))], f"{prefix} ids must be continuous from 1")
        require(isinstance(gate["exits"], list) and bool(gate["exits"]), "Gate requires exits")
        used: set[str] = set()
        for i, exit_rule in enumerate(gate["exits"]):
            fields(exit_rule, {"id", "description", "checks"})
            require(exit_rule["id"] == f"E{i+1}", "Exit ids must be continuous from E1")
            text(exit_rule["description"], "Exit description")
            texts(exit_rule["checks"], "Exit checks")
            require(bool(exit_rule["checks"]) and len(set(exit_rule["checks"])) == len(exit_rule["checks"]), "Exit requires distinct checks")
            require(set(exit_rule["checks"]) <= set(ids), "Exit references unknown checks")
            used.update(exit_rule["checks"])
            all_exits.add(f"{gate['id']}:{exit_rule['id']}")
        require(used == set(ids), "every check must be referenced by an Exit")
        require(isinstance(gate["stop_conditions"], list), "stop_conditions must be a list")
        for i, stop in enumerate(gate["stop_conditions"]):
            fields(stop, {"id", "description"})
            require(stop["id"] == f"SC{i+1}", "Stop condition ids must be continuous from SC1")
            text(stop["description"], "Stop condition description")
    require(isinstance(contract["definition_of_done"], list) and bool(contract["definition_of_done"]), "Definition of Done must not be empty")
    for item in contract["definition_of_done"]:
        fields(item, {"description", "exits"})
        text(item["description"], "Definition of Done")
        texts(item["exits"], "Definition of Done exits")
        require(bool(item["exits"]) and set(item["exits"]) <= all_exits, "Definition of Done must reference declared Gate Exits")
    require(isinstance(contract["coverage"], list) and bool(contract["coverage"]), "source decision coverage is required")
    covered: set[str] = set()
    used_sources: set[str] = set()
    for item in contract["coverage"]:
        fields(item, {"source", "decision", "exits"})
        require(item["source"] in paths, "coverage references unknown source")
        text(item["decision"], "source decision locator")
        texts(item["exits"], "coverage exits")
        require(bool(item["exits"]) and set(item["exits"]) <= all_exits, "coverage must reference declared Gate Exits")
        covered.update(item["exits"])
        used_sources.add(item["source"])
    require(covered == all_exits and used_sources == set(paths), "coverage must account for every Exit and Contract Source")
    return contract


def behavior(contract: dict) -> dict:
    return {k: v for k, v in contract.items() if k not in {"sources", "coverage", "schema", "format_version"}}


def impact(before: dict, after: dict) -> int | None:
    left, right = behavior(before), behavior(after)
    if any(left[key] != right[key] for key in left if key != "gates"):
        return 0
    for i, (a, b) in enumerate(zip(left["gates"], right["gates"])):
        if a != b:
            return i
    return min(len(left["gates"]), len(right["gates"])) if len(left["gates"]) != len(right["gates"]) else None


def capture_revision(repo: Path, effort: Path, candidate: Path, reason: str) -> tuple[dict, dict[str, bytes]]:
    require(candidate.resolve().is_relative_to(repo), "candidate plan must be inside the repository")
    data = candidate.read_bytes()
    contract = compile_plan(data)
    objects = {digest(data): data}
    sources = []
    for source in contract["sources"]:
        path = local_path(repo, source["path"])
        require(not path.resolve().is_relative_to(effort / "goal") and path.resolve() != (effort / "implementation-plan.md"), "Contract Sources must exclude the plan and runtime files")
        require(path.is_file(), f"missing Contract Source: {source['path']}")
        content = path.read_bytes()
        sha = digest(content)
        objects[sha] = content
        sources.append({"path": source["path"], "sha256": sha})
    revision = {"schema": "goal-loop/contract-revision", "format_version": FORMAT, "plan": digest(data), "contract": contract,
                "sources": sources, "reason": reason, "replacement_base": None}
    working = effort / "implementation-plan.md"
    if candidate.resolve() != working and working.exists():
        revision["replacement_base"] = digest(working.read_bytes())
    return revision, objects


def proposal(current: dict, candidate: dict, mode: str, from_gate: str | None) -> dict:
    first = impact(current["contract"], candidate["contract"])
    if mode == "equivalent":
        require(first is None, "equivalent revision requires identical normalized behavior")
        require(from_gate is None, "equivalent revision cannot reopen Gates")
    else:
        require(mode == "revalidate", "invalid revision mode")
        if first is None:
            require(from_gate is not None, "revalidate with identical behavior requires --from-gate")
        if from_gate is not None:
            require(bool(re.fullmatch(r"G\d+", from_gate)), "invalid --from-gate")
            requested = int(from_gate[1:])
            require(requested < len(candidate["contract"]["gates"]), "--from-gate must exist in the candidate")
            require(first is None or requested <= first, "--from-gate cannot skip an affected Gate")
            first = requested
    return {"mode": mode, "reopen_from": first, "candidate": deepcopy(candidate)}
