"""Canonical serialization and checked local paths."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from typing import Any


class GoalError(Exception):
    """An actionable contract, state, or integrity error."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise GoalError(message)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def decode(data: bytes) -> Any:
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result
    def invalid_number(value):
        raise GoalError(f"invalid JSON number: {value}")
    try:
        return json.loads(data, object_pairs_hook=pairs, parse_constant=invalid_number)
    except (UnicodeError, ValueError) as exc:
        raise GoalError(f"invalid UTF-8 JSON: {exc}") from exc


def repo_root(effort: Path) -> Path:
    for parent in (effort, *effort.parents):
        if (parent / ".git").exists():
            return parent
    raise GoalError(f"cannot locate Git repository for {effort}")


def relative_name(value: str, *, glob: bool = False) -> str:
    require(isinstance(value, str) and bool(value), "repository path must be a nonempty string")
    parts = PurePosixPath(value).parts
    require(not value.startswith("/") and "\\" not in value and ":" not in value and ".." not in parts,
            f"path must be repository-relative POSIX: {value}")
    require(".git" not in parts and all(part not in {"", "."} for part in value.split("/")), f"invalid path: {value}")
    if not glob:
        require(not any(c in value for c in "*?[]"), f"file path cannot contain glob syntax: {value}")
    return value


def local_path(root: Path, relative: str) -> Path:
    path = root / relative_name(relative)
    require(path.resolve().is_relative_to(root.resolve()), f"path escapes repository: {relative}")
    return path


def hash_name(value: str) -> str:
    require(isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{64}", value)), "invalid SHA-256 object reference")
    return value
