from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = SKILL_ROOT / "scripts" / "validate_goal_loop.py"
spec = importlib.util.spec_from_file_location("goal_loop_validator_unit", VALIDATOR_PATH)
v = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = v
spec.loader.exec_module(v)


class ValidatorUnitTests(unittest.TestCase):
    def test_event_hash_is_field_order_independent(self):
        a = {"Result": "ok", "Prev event hash": "none", "Type": "verification"}
        b = {"Type": "verification", "Prev event hash": "none", "Result": "ok"}
        self.assertEqual(v.compute_event_hash("G0-E0001", "verification", a), v.compute_event_hash("G0-E0001", "verification", b))

    def test_schema_constants_use_single_current_identifiers(self):
        self.assertEqual(v.RUNBOOK_SCHEMA, "goal-loop/runbook")
        self.assertEqual(v.HISTORY_SCHEMA, "goal-loop/history")
        self.assertEqual(v.BASELINE_SCHEMA, "goal-loop/contract-baseline")
        self.assertEqual(v.PROMPT_SCHEMA, "goal-loop/prompt")
        self.assertEqual(v.TRANSACTION_SCHEMA, "goal-loop/transaction")


if __name__ == "__main__":
    unittest.main()
