from __future__ import annotations

from support import Fixture, contract
from engine.common import GoalError
from engine.service import Service


class FixedPromptTests(Fixture):
    def test_same_prompt_across_slices_handoff_gates_and_contract_revisions(self):
        value = contract(gates=2, kinds="DRM")
        value["gates"][1]["checks"] = value["gates"][1]["checks"][:2]
        value["gates"][1]["exits"][0]["checks"] = ["D1", "R1"]
        runner = "from pathlib import Path\nassert Path('src/app.txt').read_text() in {'slice 1', 'slice 2', 'ok'}\n"
        repo, effort, _ = self.make(value, runner)
        prompt = effort / "goal/prompt.md"
        saved = prompt.read_bytes()

        def current():
            self.assertEqual(prompt.read_bytes(), saved)
            return self.cli(effort, "status")

        def mutate(*args):
            revision = current()["revision"]
            result = self.cli(effort, *args, "--expected-revision", revision)
            current()
            return result

        def verify_slice(label):
            started = mutate("check", "start", "--check", "D1", "--subject", label)
            mutate("check", "finish", "--attempt", started["attempt"], "--outcome", "pass", "--result", label + " inspected")
            mutate("check", "run", "--check", "R1")
            mutate("record", "--kind", "slice", "--result", label + ": src/app.txt verified by D1/R1",
                   "--last-completed-slice", label, "--next-action", "review remaining work")

        # First Goal completes multiple slices before a stable checkpoint within G0.
        (repo / "src/app.txt").write_text("slice 1", encoding="utf-8")
        verify_slice("S1")
        (repo / "src/app.txt").write_text("slice 2", encoding="utf-8")
        verify_slice("S2")
        mutate("record", "--kind", "checkpoint", "--result", "S2 verified; next slice needs a fresh Goal",
               "--current-slice", "S3", "--next-action", "implement S3")
        resumed = Service(effort).status(context=True)
        self.assertEqual(resumed["gate"], "G0")
        self.assertEqual(resumed["checkpoint"]["last_completed_slice"], "S2")
        self.assertEqual(resumed["checkpoint"]["current_slice"], "S3")

        # A later Goal uses the same saved prompt and finishes G0's implementation.
        (repo / "src/app.txt").write_text("ok", encoding="utf-8")
        self.assertEqual(current()["checks"]["R1"]["status"], "stale")
        verify_slice("S3")
        mutate("record", "--kind", "slice", "--result", "D1/R1 passed; inspect src/app.txt for the accepted marker",
               "--last-completed-slice", "S3", "--next-action", "request manual acceptance")
        handoff = mutate("check", "start", "--check", "M1", "--subject", "src/app.txt after S3")
        waiting_revision = current()["revision"]
        for command in ("status", "context"):
            waiting = self.cli(effort, command)
            self.assertEqual(waiting["pending"]["id"], handoff["attempt"])
            self.assertEqual(waiting["revision"], waiting_revision)
            self.assertEqual(waiting["state"], "active")

        # Explicit acceptance arrives on the next Goal; only the successor activates.
        mutate("check", "finish", "--attempt", handoff["attempt"], "--outcome", "pass", "--result", "user accepted S3 marker")
        passed = mutate("pass-gate")
        self.assertEqual(passed["next_gate"], "G1")
        self.assertEqual({check["status"] for check in current()["checks"].values()}, {"missing"})

        # Neither equivalent revisions nor reopening a Gate replace the fixed text.
        (repo / "docs/decision.md").write_text("accepted with clarification", encoding="utf-8")
        revision_args = ("revise-contract", "--plan", effort / "implementation-plan.md", "--mode", "equivalent", "--reason", "clarified wording")
        preview = self.cli(effort, *revision_args)
        mutate(*revision_args, "--preview-digest", preview["preview_digest"])
        old_run = current()["run"]
        value["gates"][1]["scope"] = "application marker and final integration"
        candidate = self.candidate(effort, value)
        revision_args = ("revise-contract", "--plan", candidate, "--mode", "revalidate", "--reason", "reviewed integration scope")
        preview = self.cli(effort, *revision_args)
        mutate(*revision_args, "--preview-digest", preview["preview_digest"])
        self.assertNotEqual(current()["run"], old_run)
        self.assertEqual(current()["gate"], "G1")

        verify_slice("S4")
        self.assertIsNone(mutate("pass-gate")["next_gate"])
        complete = current()
        self.assertEqual(complete["state"], "complete")
        self.assertIsNone(complete["gate"])
        self.assertIsNone(self.cli(effort, "context")["gate_contract"])
        self.assertTrue(self.cli(effort, "validate")["valid"])
        self.assertEqual(current()["revision"], complete["revision"])

    def test_copy_file_is_optional_but_recover_restores_the_frozen_text(self):
        _, effort, service = self.make(contract(kinds="M"))
        prompt = effort / "goal/prompt.md"
        saved = prompt.read_bytes()
        for phase in ("active", "pending", "complete"):
            if phase == "pending":
                started = service.start(service.status()["revision"], "M1", "accepted build")
            elif phase == "complete":
                service.finish(service.status()["revision"], started["attempt"], "pass", "accepted")
                service.pass_gate(service.status()["revision"])
            for content in (None, b"edited copy"):
                with self.subTest(phase=phase, content=content):
                    before = service.status(context=True)
                    if content is None:
                        prompt.unlink()
                    else:
                        prompt.write_bytes(content)
                    self.assertEqual(service.status(), self.cli(effort, "status"))
                    self.assertEqual(self.cli(effort, "context"), before)
                    valid = self.cli(effort, "validate")
                    self.assertTrue(valid["valid"])
                    self.assertEqual(valid["damaged_views"], [])
                    if content is None:
                        self.assertFalse(prompt.exists())
                    else:
                        self.assertEqual(prompt.read_bytes(), content)
                    recovered = self.cli(effort, "recover", "--expected-revision", before["revision"])
                    self.assertEqual(recovered["revision"], before["revision"])
                    self.assertEqual(prompt.read_bytes(), saved)
                    self.assertEqual(service.status(context=True), before)

    def test_state_refresh_restores_copy_without_an_extra_revision(self):
        _, effort, service = self.make(contract(kinds="D"))
        prompt = effort / "goal/prompt.md"
        saved = prompt.read_bytes()
        for content in (None, b"edited copy"):
            with self.subTest(content=content):
                if content is None:
                    prompt.unlink()
                else:
                    prompt.write_bytes(content)
                before = service.status()["revision"]
                service.mutate(before, {"type": "recorded", "kind": "checkpoint", "result": "stable slice", "next_action": "verify"})
                self.assertEqual(service.status()["revision"], before + 1)
                self.assertEqual(prompt.read_bytes(), saved)

    def test_frozen_protocol_objects_still_require_integrity(self):
        for field in ("template", "prompt"):
            for damage in ("missing", "changed"):
                with self.subTest(field=field, damage=damage):
                    _, effort, service = self.make()
                    path = service.store.object_path(service.store.load().protocol[field])
                    if damage == "missing":
                        path.unlink()
                    else:
                        path.write_bytes(b"corrupted frozen object")
                    for command in ("status", "context", "validate"):
                        self.assertIn("immutable object", self.cli(effort, command, expected_code=1))
                    with self.assertRaises(GoalError):
                        service.recover(0)
