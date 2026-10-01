import json
import unittest
from pathlib import Path

from gateway.billing import Ledger, handle_completion
from gateway.usage import validate_usage

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "data" / "fixtures"
SQL = (ROOT / "schema" / "001_init.sql").read_text(encoding="utf-8")


class UsageSchemaTest(unittest.TestCase):
    def test_ok_fixture_matches_schema(self) -> None:
        event = json.loads((FIXTURES / "usage-ok.json").read_text(encoding="utf-8"))
        self.assertEqual(validate_usage(event), [])

    def test_prompt_text_is_rejected(self) -> None:
        event = json.loads((FIXTURES / "usage-with-prompt.json").read_text(encoding="utf-8"))
        errors = validate_usage(event)
        self.assertTrue(any("prompt" in item for item in errors))
        self.assertTrue(any("completion" in item for item in errors))

    def test_sql_has_no_prompt_column(self) -> None:
        usage_block = SQL.split("CREATE TABLE usage_events", 1)[1].split(");", 1)[0]
        self.assertNotIn("prompt ", usage_block)
        self.assertNotIn("completion ", usage_block)
        self.assertIn("UNIQUE (generation_id, kind)", SQL)


class AcceptanceTest(unittest.TestCase):
    def test_us05_empty_balance_does_not_call_provider(self) -> None:
        ledger = Ledger()
        calls = {"n": 0}

        def provider() -> None:
            calls["n"] += 1

        result = handle_completion(ledger, "acc", "gen-us05", 200, 200, provider)
        self.assertEqual(result["status"], 402)
        self.assertFalse(result["provider_called"])
        self.assertEqual(calls["n"], 0)
        self.assertEqual(ledger.captures, {})
        self.assertEqual(ledger.holds, {})

    def test_us04_one_capture_and_replay_is_idempotent(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 10_000)
        calls = {"n": 0}

        def provider() -> None:
            calls["n"] += 1

        first = handle_completion(ledger, "acc", "gen-us04", 200, 200, provider)
        second = handle_completion(ledger, "acc", "gen-us04", 200, 200, provider)

        self.assertEqual(first["status"], 200)
        self.assertTrue(first["provider_called"])
        self.assertEqual(second["status"], 200)
        self.assertFalse(second["provider_called"])
        self.assertEqual(calls["n"], 1)
        self.assertEqual(ledger.captures, {"gen-us04": 200})
        self.assertEqual(ledger.available["acc"], 9_800)


if __name__ == "__main__":
    unittest.main()
