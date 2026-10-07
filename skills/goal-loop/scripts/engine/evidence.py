"""Evidence describes the observed file set, never an inferred approval."""

from __future__ import annotations

import glob
from dataclasses import asdict, dataclass
from pathlib import Path

from .common import canonical, digest, file_digest, hash_name, relative_name, require


@dataclass(frozen=True)
class EvidenceSnapshot:
    run_id: str
    check_digest: str
    patterns: list[str]
    files: list[dict[str, str]]
    missing: list[str]
    environment: bool

    def payload(self) -> dict:
        return {"schema": "goal-loop/evidence-snapshot", "format_version": 1, **asdict(self)}


def snapshot(repo: Path, effort: Path, run_id: str, check: dict) -> dict:
    entries: dict[str, str] = {}
    missing = []
    runtime = (effort / "goal").resolve()
    for pattern in check["evidence_inputs"]:
        relative_name(pattern, glob=True)
        lexical = repo / pattern
        require(not lexical.is_relative_to(runtime), "evidence cannot include goal runtime files")
        found: dict[str, Path] = {}
        expanded: list[Path] = []
        for raw in glob.iglob(str(lexical), recursive=True, include_hidden=True):
            path = Path(raw)
            if any(path.is_relative_to(directory) for directory in expanded):
                continue
            if path.is_dir():
                expanded.append(path)
            paths = path.rglob("*") if path.is_dir() else [path]
            for item in paths:
                if not item.is_file():
                    continue
                resolved = item.resolve()
                require(resolved.is_relative_to(repo), f"evidence path escapes repository: {item}")
                rel = item.relative_to(repo).as_posix()
                if resolved.is_relative_to(runtime) or ".git" in item.relative_to(repo).parts or item.name.startswith(".goal-loop-"):
                    continue
                # Preserve the lexical path: changing symlink aliases changes the observed file set.
                found[rel] = item
        if not found:
            missing.append(pattern)
        for rel, path in sorted(found.items()):
            entries[rel] = file_digest(path)
    return EvidenceSnapshot(run_id, digest(canonical(check)), list(check["evidence_inputs"]),
                            [{"path": path, "sha256": sha} for path, sha in sorted(entries.items())],
                            missing, check["environment"]).payload()


def validate_snapshot(value: dict, run_id: str, check: dict) -> None:
    require(value.get("schema") == "goal-loop/evidence-snapshot" and type(value.get("format_version")) is int and value["format_version"] == 1, "unsupported evidence snapshot format")
    require(value.get("run_id") == run_id and value.get("check_digest") == digest(canonical(check)), "snapshot does not match the GateRun and check definition")
    require(value.get("patterns") == check["evidence_inputs"] and value.get("environment") == check["environment"], "snapshot input contract mismatch")
    require(isinstance(value.get("files"), list) and isinstance(value.get("missing"), list), "invalid evidence file manifest")
    names = [entry["path"] for entry in value["files"]]
    require(names == sorted(set(names)), "snapshot file paths must be sorted and unique")
    for entry in value["files"]:
        relative_name(entry["path"])
        hash_name(entry["sha256"])
    require(set(value["missing"]) <= set(check["evidence_inputs"]), "snapshot has unknown missing patterns")


def matches(before: dict, after: dict) -> bool:
    return not before["missing"] and not after["missing"] and before == after
