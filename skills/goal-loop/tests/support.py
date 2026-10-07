from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from engine.service import Service

CTL = SKILL / "scripts" / "goal_loop_ctl.py"


def contract(gates=1, kinds="DM"):
    definitions = []
    for i in range(gates):
        checks = []
        for kind in kinds:
            check = {"id": f"{kind}1", "description": f"observe {kind} behavior", "evidence_inputs": ["src/app.txt"]}
            if kind == "R":
                check.update(argv=[sys.executable, "verify.py"], timeout_seconds=10)
            checks.append(check)
        definitions.append({"id": f"G{i}", "name": f"Gate {i}", "objective": "observable behavior", "inputs": ["src/app.txt"],
                            "scope": "application marker", "constraints": ["preserve behavior"], "slice_policy": "one behavior per slice",
                            "checks": checks, "exits": [{"id": "E1", "description": "observable accepted behavior", "checks": [c["id"] for c in checks]}],
                            "stop_conditions": [{"id": "SC1", "description": "dependency unavailable"}], "rollback": "restore the affected slice"})
    exits = [f"G{i}:E1" for i in range(gates)]
    return {"schema": "goal-loop/contract", "format_version": 1, "sources": [{"path": "docs/decision.md", "role": "defines behavior"}],
            "outcome": "accepted behavior", "rules": ["preserve API"], "definition_of_done": [{"description": "all behavior accepted", "exits": exits}],
            "out_of_scope": ["unrelated changes"], "coverage": [{"source": "docs/decision.md", "decision": "accepted decision", "exits": exits}], "gates": definitions}


def plan(value):
    return "# Example Implementation Plan\n\n```goal-loop-contract\n" + json.dumps(value, ensure_ascii=False, indent=2) + "\n```\n"


class Fixture(unittest.TestCase):
    def make(self, value=None, runner="from pathlib import Path\nassert Path('src/app.txt').read_text() == 'ok'\nprint('passed')\n"):
        temp = tempfile.TemporaryDirectory(prefix="goal-loop-test-")
        self.addCleanup(temp.cleanup)
        repo = Path(temp.name).resolve()
        (repo / ".git").mkdir()
        (repo / "docs").mkdir()
        (repo / "docs/decision.md").write_text("accepted", encoding="utf-8")
        (repo / "src").mkdir()
        (repo / "src/app.txt").write_text("ok", encoding="utf-8")
        (repo / "verify.py").write_text(runner, encoding="utf-8")
        effort = repo / "effort 空间"
        effort.mkdir()
        (effort / "implementation-plan.md").write_text(plan(value or contract()), encoding="utf-8")
        service = Service(effort)
        service.bootstrap()
        return repo, effort, service

    def cli(self, effort, *args, expected_code=0):
        command = [sys.executable, "-B", str(CTL), args[0]]
        rest = list(args[1:])
        if args[0] == "check":
            command.append(rest.pop(0))
        command += [str(effort), *map(str, rest)]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", env={**os.environ, "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(completed.returncode, expected_code, completed.stdout + completed.stderr)
        return json.loads(completed.stdout) if completed.stdout else completed.stderr

    def passed(self, service, cid):
        started = service.start(service.status()["revision"], cid, "observed source")
        return service.finish(started["revision"], started["attempt"], "pass", "observed accepted marker")

    def complete(self, service):
        for check in service.store.load().active().definition["checks"]:
            if check["id"].startswith("R"):
                self.assertEqual(service.run(service.status()["revision"], check["id"])["status"], "pass")
            else:
                self.passed(service, check["id"])
        return service.pass_gate(service.status()["revision"])

    def candidate(self, effort, value):
        path = effort / "candidate.md"
        path.write_text(plan(value), encoding="utf-8")
        return path

    def revise(self, service, path, mode="revalidate", from_gate=None):
        preview = service.revise(path, mode, "reviewed requirements", from_gate=from_gate)
        return service.revise(path, mode, "reviewed requirements", expected=preview["revision"], preview=preview["preview_digest"], from_gate=from_gate)
