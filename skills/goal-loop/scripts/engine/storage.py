"""Append-only commits are the publication point; all views are replaceable."""

from __future__ import annotations

import contextlib
import errno
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .common import GoalError, canonical, decode, digest, file_digest, hash_name, require
from .model import State, transition

COMMIT_SCHEMA = "goal-loop/commit"
FORMAT = 1


class Busy(GoalError):
    pass


@contextlib.contextmanager
def lock(path: Path):
    """Fail-fast process lock. Never continue without the platform lock."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            # A byte-range lock also works on an empty file and avoids initializing races.
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise Busy(f"lock is held: {path.name}") from exc
            try:
                yield handle
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                if exc.errno in {errno.EACCES, errno.EAGAIN}:
                    raise Busy(f"lock is held: {path.name}") from exc
                raise
            try:
                yield handle
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        if os.name != "nt":
            directory = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


@dataclass(frozen=True)
class CommitRecord:
    schema: str
    format_version: int
    revision: int
    previous: str | None
    at: str
    events: list[dict]
    objects: list[str]


class ObjectReader:
    def __init__(self, store, staged=None, allowed=None):
        self.store = store
        self.staged = staged or {}
        self.allowed = allowed

    def verify(self, sha):
        hash_name(sha)
        require(self.allowed is None or sha in self.allowed, "event references an object outside committed object manifests")
        if sha in self.staged:
            require(digest(self.staged[sha]) == sha, "staged object hash mismatch")
        else:
            self.store.verify(sha)

    def __call__(self, sha):
        self.verify(sha)
        return self.staged[sha] if sha in self.staged else self.store.get(sha)


class Store:
    def __init__(self, effort: Path, fault: Callable[[str], None] | None = None):
        self.effort = effort.resolve()
        self.root = self.effort / "goal"
        self.fault = fault or (lambda stage: None)

    @property
    def lock_path(self) -> Path:
        # Keep locks outside the unpublished control directory.
        return self.effort / ".goal-loop-control.lock"

    @property
    def runner_lock(self) -> Path:
        return self.effort / ".goal-loop-runner.lock"

    def object_path(self, sha: str) -> Path:
        return self.root / "objects" / hash_name(sha)

    def get(self, sha: str) -> bytes:
        path = self.object_path(sha)
        require(path.is_file() and not path.is_symlink(), f"missing immutable object: {sha}")
        data = path.read_bytes()
        require(digest(data) == sha, f"immutable object hash mismatch: {sha}")
        return data

    def verify(self, sha: str) -> None:
        path = self.object_path(sha)
        require(path.is_file() and not path.is_symlink() and file_digest(path) == sha, f"immutable object missing or damaged: {sha}")

    def put(self, content: bytes) -> str:
        sha = digest(content)
        path = self.object_path(sha)
        if path.exists():
            self.verify(sha)
        else:
            atomic_write(path, content)
        return sha

    def put_file(self, source: Path) -> str:
        """Publish a potentially large process log without loading it into RAM."""
        sha = file_digest(source)
        path = self.object_path(sha)
        if path.exists():
            require(file_digest(path) == sha, f"immutable object hash mismatch: {sha}")
            return sha
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
        try:
            with source.open("rb") as incoming, os.fdopen(fd, "wb") as outgoing:
                while chunk := incoming.read(1024 * 1024):
                    outgoing.write(chunk)
                outgoing.flush()
                os.fsync(outgoing.fileno())
            require(file_digest(Path(temp)) == sha, "process output changed while being published")
            os.replace(temp, path)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
        return sha

    def load(self) -> State:
        directory = self.root / "commits"
        require(directory.is_dir() and not directory.is_symlink(), "unsupported or uninitialized control directory; bootstrap requires a directory without goal artifacts")
        files = sorted(directory.glob("*.json"))
        require(bool(files), "control directory contains no committed initialization")
        state = State()
        committed_objects = set()
        for index, path in enumerate(files):
            require(path.name == f"{index:08d}.json" and not path.is_symlink(), "commit records are missing or out of sequence")
            raw = path.read_bytes()
            record = decode(raw)
            require(isinstance(record, dict) and set(record) == {"schema", "format_version", "revision", "previous", "at", "events", "objects", "hash"}, "invalid commit fields")
            require(record["schema"] == COMMIT_SCHEMA and type(record["format_version"]) is int and record["format_version"] == FORMAT, "unsupported commit format")
            sha = record.pop("hash")
            require(sha == digest(canonical(record)), f"commit hash mismatch: {path.name}")
            require(type(record["revision"]) is int and record["revision"] == index and record["previous"] == state.head, f"commit chain mismatch: {path.name}")
            refs = record["objects"]
            require(isinstance(refs, list) and refs == sorted(set(refs)), "commit objects must be sorted and unique")
            for ref in refs:
                self.verify(ref)
            committed_objects.update(refs)
            reader = ObjectReader(self, allowed=committed_objects)
            try:
                state = transition(state, record["events"], reader)
            except (KeyError, TypeError, AttributeError, ValueError) as exc:
                raise GoalError(f"invalid event payload in {path.name}: {exc}") from exc
            state.revision = index
            state.head = sha
        return state

    def commit(self, state: State, expected: int, events: list[dict], objects: dict[str, bytes] | None = None,
               extra_refs: list[str] | None = None) -> State:
        require(state.revision == expected, f"stale Revision: expected {expected}, current {state.revision}")
        # Validate the complete transition before publication.
        objects = objects or {}
        target = transition(state, events, ObjectReader(self, staged=objects))
        refs = set(extra_refs or []) | set(objects)
        for sha, data in objects.items():
            require(self.put(data) == sha, "staged object digest mismatch")
        for sha in refs:
            require(file_digest(self.object_path(sha)) == sha, "commit object hash mismatch")
        self.fault("objects-written")
        record = asdict(CommitRecord(COMMIT_SCHEMA, FORMAT, expected + 1, state.head,
                                    datetime.now(timezone.utc).isoformat(), events, sorted(refs)))
        sha = digest(canonical(record))
        record["hash"] = sha
        path = self.root / "commits" / f"{expected + 1:08d}.json"
        require(not path.exists(), "commit Revision already exists; reload state")
        self.fault("before-publish")
        atomic_write(path, canonical(record))
        target.revision, target.head = expected + 1, sha
        self.fault("after-publish")
        return target

    def bootstrap_allowed(self) -> None:
        require(not self.root.exists() or self.root.is_dir() and not any(self.root.iterdir()), "bootstrap refuses existing goal artifacts; select an empty effort control directory")

    def check_expected(self, state: State, expected: int) -> None:
        require(type(expected) is int and expected == state.revision, f"stale Revision: expected {expected}, current {state.revision}")
