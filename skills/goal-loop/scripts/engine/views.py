"""Derived views contain no authoritative decisions or state."""

from __future__ import annotations

import json

from .common import canonical
from .model import State, satisfied
from .storage import Store, atomic_write


def render(store: Store, state: State) -> dict:
    active = state.active()
    pending = state.pending()
    data = state.payload()
    runbook = ["# Goal Runbook", "", f"Revision: {state.revision}", f"Contract: {state.contract_id}",
               "", "Generated from immutable commit records. Use the control script to change execution state.", "", "## Gates", "",
               "| Gate | Run | Status | Contract |", "| --- | --- | --- | --- |"]
    for key in state.current:
        run = state.runs[key]
        runbook.append(f"| {run.gate_id} | {run.id} | {run.status} | {run.contract_id} |")
    runbook += ["", "## Checkpoint", "", "```json", json.dumps(active.checkpoint if active else {"next_action": "effort complete"}, ensure_ascii=False, indent=2, sort_keys=True), "```"]
    if active:
        runbook += ["", f"Recorded passing exits (freshness is checked by status): {', '.join(satisfied(state, active)) or 'none'}"]
    if pending:
        runbook += ["", f"Pending attempt: {pending.id}", f"Check: {pending.check_id}", f"Subject: {pending.subject}"]
    files = {store.root / "state.json": canonical(data), store.root / "runbook.md": ("\n".join(runbook) + "\n").encode("utf-8"),
             store.root / "prompt.md": store.get(state.protocol["prompt"]),
             store.root / "contract-baseline.json": canonical({"contract_id": state.contract_id, "plan": state.contract["plan"], "sources": state.contract["sources"]})}
    effort_history = {"contracts": {key: {"object": value.object, "reason": value.payload["reason"]} for key, value in state.contracts.items()},
                      "events": [note for note in state.notes if note["type"] in {"contract-revised", "corrected"}]}
    files[store.root / "history" / "effort.md"] = ("# Effort History\n\n```json\n" + json.dumps(effort_history, ensure_ascii=False, indent=2, sort_keys=True) + "\n```\n").encode("utf-8")
    gates = sorted({run.gate_id for run in state.runs.values()}, key=lambda gate: int(gate[1:]))
    for gate_id in gates:
        rows = [f"# {gate_id} History", "", "Generated from immutable commit records."]
        for run in state.runs.values():
            if run.gate_id != gate_id:
                continue
            rows += ["", f"## {run.id}", "", f"Contract: {run.contract_id}; status: {run.status}; superseded: {str(run.superseded).lower()}", "", "```json",
                     json.dumps({"gate": run.definition, "checkpoint": run.checkpoint, "exit_evidence": run.evidence,
                                 "attempts": [a.__dict__ for a in state.attempts.values() if a.run_id == run.id],
                                 "notes": [n for n in state.notes if n.get("run_id") == run.id]}, ensure_ascii=False, indent=2, sort_keys=True), "```"]
        files[store.root / "history" / f"{gate_id}.md"] = ("\n".join(rows) + "\n").encode("utf-8")
    return files


def refresh(store: Store, state: State) -> None:
    for path, content in render(store, state).items():
        if not path.exists() or path.read_bytes() != content:
            atomic_write(path, content)


def damaged_views(store: Store, state: State) -> list[str]:
    # The prompt is a copy convenience; users can keep using its saved text.
    return [path.relative_to(store.effort).as_posix() for path, content in render(store, state).items()
            if path != store.root / "prompt.md" and (not path.is_file() or path.read_bytes() != content)]
