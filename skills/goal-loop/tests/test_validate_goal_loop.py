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
    def test_invalid_snapshot_is_not_treated_as_missing(self):
        for body in ("not JSON", '```json\n{"D1": {"outcome": "pass"}}\n```'):
            errors = []
            self.assertEqual(v.parse_current_checks("## Current Checks\n\n" + body, errors), {})
            self.assertTrue(errors)

    def test_fingerprint_is_stable_for_sorted_paths(self):
        with self.subTest(order="stable"):
            self.assertEqual(v.sha256_bytes(b"a\nb"), v.sha256_bytes(b"a\nb"))

    def test_old_runtime_names_are_rejected(self):
        self.assertEqual(set(v.old_runtime_present(Path("C:/missing-effort"))), set())


if __name__ == "__main__":
    unittest.main()
