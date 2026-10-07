"""Public application interface for the Goal Loop execution engine."""

from __future__ import annotations

import contextlib
import os
import sys
import tempfile
import uuid
from dataclasses import asdict
from pathlib import Path

from .common import canonical, decode, digest, local_path, repo_root, require
from .contract import behavior, capture_revision, proposal
from .evidence import matches, snapshot
from .model import State, require_active
from .runner import execute
from .storage import Busy, Store, atomic_write, lock
from .views import damaged_views, refresh


class Service:
    def __init__(self, effort: Path, *, fault=None, template: Path | None = None):
        self.effort = effort.resolve()
        self.repo = repo_root(self.effort)
        self.store = Store(self.effort, fault)
        self.template = template or Path(__file__).resolve().parents[2] / "references" / "goal-prompt-template.md"

    def _object(self, value: dict, objects: dict[str, bytes]) -> str:
        data = canonical(value)
        sha = digest(data)
        objects[sha] = data
        return sha

    def _snapshot(self, state: State, run, check_id: str, objects: dict[str, bytes]) -> str:
        value = snapshot(self.repo, self.effort, run.id, state.check(run, check_id).payload)
        return self._object(value, objects)

    def drift(self, state: State) -> list[str]:
        result = []
        current = state.contract
        paths = [{"path": (self.effort / "implementation-plan.md").relative_to(self.repo).as_posix(), "sha256": current["plan"]}, *current["sources"]]
        for item in paths:
            path = local_path(self.repo, item["path"])
            if not path.is_file() or digest(path.read_bytes()) != item["sha256"]:
                result.append(item["path"])
        return result

    def _fresh_contract(self, state: State):
        changed = self.drift(state)
        require(not changed, f"contract drift: {', '.join(changed)}; inspect or revise the contract")

    def _commit(self, state: State, expected: int, events: list[dict], objects=None, extra_refs=None) -> State:
        target = self.store.commit(state, expected, events, objects, extra_refs)
        # Plan installation is recoverable using the frozen bytes and expected previous digest.
        self._install_plan(target)
        self.store.fault("before-views")
        refresh(self.store, target)
        self.store.fault("after-views")
        return target

    def _install_plan(self, state: State) -> None:
        revision = state.contract
        path = self.effort / "implementation-plan.md"
        actual = digest(path.read_bytes()) if path.is_file() else None
        if actual == revision["plan"]:
            return
        # Only restore the exact working copy that the reviewed candidate replaced.
        if revision.get("replacement_base") is not None and actual == revision["replacement_base"]:
            atomic_write(path, self.store.get(revision["plan"]))

    def bootstrap(self) -> dict:
        with lock(self.store.lock_path):
            self.store.bootstrap_allowed()
            value, objects = capture_revision(self.repo, self.effort, self.effort / "implementation-plan.md", "initial contract")
            template = self.template.read_bytes()
            ctl = str(Path(__file__).resolve().parents[1] / "goal_loop_ctl.py")
            prompt = template.decode("utf-8").replace("{{EFFORT_PATH}}", str(self.effort)).replace("{{CONTROL_SCRIPT}}", ctl).replace("{{PYTHON}}", sys.executable).encode("utf-8")
            objects[digest(template)] = template
            objects[digest(prompt)] = prompt
            protocol = {"schema": "goal-loop/protocol", "format_version": 1, "template": digest(template), "prompt": digest(prompt)}
            event = {"type": "initialized", "contract": self._object(value, objects), "protocol": self._object(protocol, objects)}
            # Stage initialization outside goal: until the directory is published,
            # there is no control plane to recover or accidentally mistake for one.
            with tempfile.TemporaryDirectory(prefix=".goal-loop-bootstrap-", dir=self.effort) as temporary:
                stage = Store(Path(temporary))
                state = stage.commit(State(), -1, [event], objects)
                self.store.fault("objects-written")
                self.store.fault("before-publish")
                self.store.bootstrap_allowed()
                if self.store.root.exists():
                    self.store.root.rmdir()  # verified empty under the control lock
                os.replace(stage.root, self.store.root)
                self.store.fault("after-publish")
                self.store.fault("before-views")
                refresh(self.store, state)
                self.store.fault("after-views")
            return {"revision": state.revision, "contract": state.contract_id, "gate": state.active().gate_id}

    def status(self, *, context: bool = False) -> dict:
        state = self.store.load()
        run = state.active()
        pending = state.pending()
        executing = False
        if self.store.runner_lock.exists():
            try:
                with lock(self.store.runner_lock):
                    pass
            except Busy:
                executing = True
        result = {"revision": state.revision, "contract": state.contract_id, "gate": run.gate_id if run else None,
                  "run": run.id if run else None, "state": run.status if run else "complete", "contract_drift": self.drift(state),
                  "repository_running": executing,
                  "damaged_views": damaged_views(self.store, state), "pending": asdict(pending) if pending else None,
                  "checkpoint": run.checkpoint if run else {"next_action": "effort complete"}, "checks": {}, "satisfied_exits": []}
        if run:
            valid = set()
            for check in run.definition["checks"]:
                key = run.latest.get(check["id"])
                attempt = state.attempts.get(key)
                status = attempt.status if attempt else "missing"
                if attempt and attempt.revoked:
                    status = "revoked"
                elif attempt and status == "pass":
                    before = decode(self.store.get(attempt.snapshot))
                    after = snapshot(self.repo, self.effort, run.id, check)
                    if not matches(before, after) or result["contract_drift"]:
                        status = "stale"
                    else:
                        valid.add(check["id"])
                result["checks"][check["id"]] = {"attempt": key, "status": status, "freshness": "current GateRun only; environment state is not fingerprinted" if check["environment"] else "declared file inputs"}
            result["satisfied_exits"] = [rule["id"] for rule in run.definition["exits"] if set(rule["checks"]) <= valid]
        if context:
            contract = state.contract["contract"]
            result["global_contract"] = {key: contract[key] for key in ("outcome", "rules", "definition_of_done", "out_of_scope")}
            result["sources"] = contract["sources"]
            result["gate_contract"] = run.definition if run else None
        return result

    def validate(self) -> dict:
        result = self.status()
        return {"revision": result["revision"], "integrity": "valid", "contract_drift": result["contract_drift"],
                "damaged_views": result["damaged_views"], "valid": not result["contract_drift"] and not result["damaged_views"]}

    def start(self, expected: int, check_id: str, subject: str, *, owner: str | None = None) -> dict:
        lifecycle = lock(self.store.runner_lock) if owner is None else contextlib.nullcontext()
        with lifecycle, lock(self.store.lock_path):
            state = self.store.load()
            self.store.check_expected(state, expected)
            self._fresh_contract(state)
            run = require_active(state)
            check = state.check(run, check_id)
            require((owner is not None) == (check.kind == "repository"), "use check run for Repository checks, check start for Directed or Manual checks")
            objects: dict[str, bytes] = {}
            event = {"type": "check-started", "attempt_id": f"A{len(state.attempts) + 1:06d}", "run_id": run.id,
                     "check_id": check_id, "subject": subject, "owner": owner, "snapshot": self._snapshot(state, run, check_id, objects)}
            target = self._commit(state, expected, [event], objects)
            return {"revision": target.revision, "attempt": event["attempt_id"], "check": check_id, "subject": subject}

    def finish(self, expected: int, attempt_id: str, outcome: str, result: str) -> dict:
        with lock(self.store.lock_path):
            state = self.store.load()
            self.store.check_expected(state, expected)
            attempt = state.attempts.get(attempt_id)
            require(attempt is not None and attempt.owner is None, "check finish requires a Directed or Manual attempt")
            run = state.runs[attempt.run_id]
            objects: dict[str, bytes] = {}
            event = {"type": "check-finished", "attempt_id": attempt_id, "owner": None, "outcome": outcome,
                     "result": result, "snapshot": self._snapshot(state, run, attempt.check_id, objects), "contract_drift": bool(self.drift(state))}
            target = self._commit(state, expected, [event], objects)
            return {"revision": target.revision, "attempt": attempt_id, "status": target.attempts[attempt_id].status}

    def cancel(self, expected: int, attempt_id: str, reason: str) -> dict:
        return self.mutate(expected, {"type": "check-cancelled", "attempt_id": attempt_id, "reason": reason}, allow_drift=True)

    def mutate(self, expected: int, event: dict, *, allow_drift: bool = False) -> dict:
        with lock(self.store.lock_path):
            state = self.store.load()
            self.store.check_expected(state, expected)
            if not allow_drift:
                self._fresh_contract(state)
            if state.active():
                event.setdefault("run_id", state.active().id)
            target = self._commit(state, expected, [event])
            return {"revision": target.revision, "event": event["type"]}

    def pass_gate(self, expected: int) -> dict:
        with lock(self.store.lock_path):
            state = self.store.load()
            self.store.check_expected(state, expected)
            self._fresh_contract(state)
            run = require_active(state)
            objects: dict[str, bytes] = {}
            refs = {}
            for cid, key in run.latest.items():
                refs[key] = self._snapshot(state, run, cid, objects)
            event = {"type": "gate-passed", "run_id": run.id,
                     "evidence": {rule["id"]: [run.latest.get(cid) for cid in rule["checks"]] for rule in run.definition["exits"]}, "snapshots": refs}
            target = self._commit(state, expected, [event], objects)
            return {"revision": target.revision, "passed": run.gate_id, "next_gate": target.active().gate_id if target.active() else None}

    def revise(self, candidate: Path, mode: str, reason: str, *, expected: int | None = None,
               preview: str | None = None, from_gate: str | None = None) -> dict:
        # Preview performs no writes and acquires no filesystem lock.
        if preview is None:
            state = self.store.load()
            value, _ = capture_revision(self.repo, self.effort, candidate.resolve(), reason)
            detail = proposal(state.contract, value, mode, from_gate)
            content = {"revision": state.revision, "head": state.head, **detail}
            before_behavior, after_behavior = behavior(state.contract["contract"]), behavior(value["contract"])
            changed_fields = {key: {"before": before_behavior[key], "after": after_behavior[key]}
                              for key in before_behavior if key != "gates" and before_behavior[key] != after_behavior[key]}
            before_gates, after_gates = before_behavior["gates"], after_behavior["gates"]
            for index in range(max(len(before_gates), len(after_gates))):
                left = before_gates[index] if index < len(before_gates) else None
                right = after_gates[index] if index < len(after_gates) else None
                if left != right:
                    changed_fields[f"G{index}"] = {"before": left, "after": right}
            before_sources = {item["path"]: item["sha256"] for item in state.contract["sources"]}
            after_sources = {item["path"]: item["sha256"] for item in value["sources"]}
            return {"preview_digest": digest(canonical(content)), "revision": state.revision,
                    "mode": mode, "reopen_from": detail["reopen_from"], "reason": reason,
                    "candidate_digest": digest(canonical(value)), "behavior_unchanged": before_behavior == after_behavior,
                    "changes": changed_fields, "source_changes": {path: {"before": before_sources.get(path), "after": after_sources.get(path)}
                        for path in sorted(before_sources.keys() | after_sources.keys()) if before_sources.get(path) != after_sources.get(path)}}
        require(expected is not None, "revision commit requires --expected-revision")
        # Runner lock also excludes the period between cancellation and child shutdown.
        with lock(self.store.runner_lock), lock(self.store.lock_path):
            state = self.store.load()
            self.store.check_expected(state, expected)
            value, objects = capture_revision(self.repo, self.effort, candidate.resolve(), reason)
            detail = proposal(state.contract, value, mode, from_gate)
            content = {"revision": state.revision, "head": state.head, **detail}
            require(preview == digest(canonical(content)), "revision preview is stale; inspect the candidate again")
            event = {"type": "contract-revised", "contract": self._object(value, objects), "mode": mode, "reopen_from": detail["reopen_from"]}
            target = self._commit(state, expected, [event], objects)
            return {"revision": target.revision, "contract": target.contract_id, "reopen_from": detail["reopen_from"]}

    def run(self, expected: int, check_id: str) -> dict:
        with lock(self.store.runner_lock) as lifecycle:
            owner = uuid.uuid4().hex
            initial = self.start(expected, check_id, "Repository command from the frozen contract", owner=owner)
            aid = initial["attempt"]
            state = self.store.load()
            attempt = state.attempts[aid]
            check = state.check(state.runs[attempt.run_id], check_id).payload
            spool = self.store.root / "spool" / aid
            spool.mkdir(parents=True, exist_ok=True)
            stdout, stderr = spool / "stdout.log", spool / "stderr.log"
            observed_revision = state.revision
            def cancelled():
                nonlocal observed_revision
                if not (self.store.root / "commits" / f"{observed_revision + 1:08d}.json").exists():
                    return False
                observed = self.store.load()
                observed_revision = observed.revision
                return observed.attempts[aid].status != "running"
            code, termination = execute(check["argv"], self.repo, check["timeout_seconds"], stdout, stderr, cancelled, lifecycle)
            return self._finish_runner(aid, owner, stdout, stderr, code, termination)

    def _finish_runner(self, aid: str, owner: str, stdout: Path, stderr: Path, code: int | None, termination: str | None) -> dict:
        with lock(self.store.lock_path):
            state = self.store.load()
            attempt = state.attempts[aid]
            require(attempt.owner == owner, "Repository completion has a different owner")
            output = {"stdout": self.store.put_file(stdout), "stderr": self.store.put_file(stderr), "exit_code": code}
            refs = [output["stdout"], output["stderr"]]
            objects: dict[str, bytes] = {}
            if attempt.status == "cancelled":
                event = {"type": "check-output", "attempt_id": aid, "owner": owner, "output": output}
            else:
                require(attempt.status == "running", "Repository attempt has already ended")
                event = {"type": "check-finished", "attempt_id": aid, "owner": owner, "output": output,
                         "termination": termination, "outcome": None if termination else ("pass" if code == 0 else "fail"),
                         "result": f"Repository check exit_code={code}; termination={termination or 'none'}",
                         "snapshot": self._snapshot(state, state.runs[attempt.run_id], attempt.check_id, objects), "contract_drift": bool(self.drift(state))}
            target = self._commit(state, state.revision, [event], objects, refs)
            return {"revision": target.revision, "attempt": aid, "status": target.attempts[aid].status, "output": output}

    def recover(self, expected: int) -> dict:
        with lock(self.store.runner_lock):
            with lock(self.store.lock_path):
                state = self.store.load()
                self.store.check_expected(state, expected)
                pending = state.pending()
                orphan = next((attempt for attempt in state.attempts.values()
                               if attempt.owner and attempt.status == "cancelled" and not attempt.output), None)
                repository_attempt = pending if pending and pending.owner else orphan
                if repository_attempt is None:
                    self._install_plan(state)
                    refresh(self.store, state)
                    return {"revision": state.revision, "recovered_views": True, "pending": pending.id if pending else None}
            spool = self.store.root / "spool" / repository_attempt.id
            spool.mkdir(parents=True, exist_ok=True)
            stdout, stderr = spool / "stdout.log", spool / "stderr.log"
            for path in (stdout, stderr):
                if not path.exists():
                    path.write_bytes(b"")
            return self._finish_runner(repository_attempt.id, repository_attempt.owner, stdout, stderr, None, "interrupted")
