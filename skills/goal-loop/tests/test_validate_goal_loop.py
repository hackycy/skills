from __future__ import annotations

import re
import unittest

from support import SKILL, contract, plan
from engine.common import GoalError
from engine.contract import compile_plan


class ContractTests(unittest.TestCase):
    def test_documented_contract_example_compiles(self):
        content = (SKILL / "references/implementation-plan-schema.md").read_bytes()
        self.assertEqual(compile_plan(content)["gates"][0]["id"], "G0")

    def test_missing_or_uncovered_requirements_are_rejected(self):
        for change in (lambda c: c["coverage"].clear(), lambda c: c["gates"][0]["exits"][0].update(checks=["R9"]),
                       lambda c: c["definition_of_done"][0].update(exits=["G7:E1"]),
                       lambda c: c["gates"][0]["checks"][0].update(evidence_inputs=[]),
                       lambda c: c.update(format_version=42)):
            value = contract()
            change(value)
            with self.assertRaises(GoalError):
                compile_plan(plan(value).encode("utf-8"))

    def test_commands_are_argv_and_default_timeout_is_bounded(self):
        value = contract(kinds="R")
        value["gates"][0]["checks"][0].pop("timeout_seconds")
        compiled = compile_plan(plan(value).encode("utf-8"))
        self.assertEqual(compiled["gates"][0]["checks"][0]["timeout_seconds"], 900)
        value["gates"][0]["checks"][0]["argv"] = "python verify.py"
        with self.assertRaises(GoalError):
            compile_plan(plan(value).encode("utf-8"))

    def test_one_explicit_contract_block_and_paths_are_required(self):
        raw = plan(contract())
        with self.assertRaises(GoalError):
            compile_plan((raw + raw).encode("utf-8"))
        value = contract()
        value["sources"][0]["path"] = "../outside.md"
        with self.assertRaises(GoalError):
            compile_plan(plan(value).encode("utf-8"))

    def test_skill_markdown_links_exist(self):
        for path in [SKILL / "SKILL.md", *(SKILL / "references").glob("*.md")]:
            for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
                if "://" in target or target.startswith("#"):
                    continue
                self.assertTrue((path.parent / target.split("#", 1)[0]).exists(), f"{path}: {target}")
