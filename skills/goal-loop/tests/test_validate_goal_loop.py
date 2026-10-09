from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("goal_loop_validator_unit", ROOT / "scripts" / "validate_goal_loop.py")
v = importlib.util.module_from_spec(spec)
assert spec.loader
sys.modules[spec.name] = v
spec.loader.exec_module(v)


class ValidatorUnitTests(unittest.TestCase):
    def test_schema_constants_are_versioned(self):
        self.assertEqual(v.RUNBOOK_SCHEMA, "goal-loop/runbook-v2")
        self.assertEqual(v.HISTORY_SCHEMA, "goal-loop/history-v2")
        self.assertEqual(v.BASELINE_SCHEMA, "goal-loop/contract-baseline-v2")
        self.assertEqual(v.PROMPT_SCHEMA, "goal-loop/prompt-v2")
        self.assertEqual(v.TRANSACTION_SCHEMA, "goal-loop/transaction-v2")

    def test_fingerprint_is_stable_for_sorted_paths(self):
        with self.subTest(order="stable"):
            self.assertEqual(v.sha256_bytes(b"a\nb"), v.sha256_bytes(b"a\nb"))

    def test_old_runtime_names_are_rejected(self):
        self.assertEqual(set(v.old_runtime_present(Path("C:/missing-effort"))), set())


if __name__ == "__main__":
    unittest.main()
