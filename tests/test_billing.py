import json
import tempfile
import threading
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from gateway.billing import (
    MINOR_PER_RUBLE,
    AccountIsolationError,
    InsufficientBalance,
    Ledger,
    handle_completion,
)
from gateway.fx import FxRate, FxUnavailable, apply_spread, parse_cbr_xml, resolve_rate
from gateway.pricing import quote_minor
from tools.reconcile_ledger import main as reconcile_main
from tools.reconcile_ledger import problems_in_postings

ROOT = Path(__file__).resolve().parents[1]


class LedgerInvariantTest(unittest.TestCase):
    def test_deposit_capture_and_replay_stay_balanced(self) -> None:
        ledger = Ledger()
        ledger.stub_topup("acc", 10_000, environment="stage")
        calls = {"n": 0}

        def provider() -> None:
            calls["n"] += 1

        first = handle_completion(ledger, "acc", "gen", 200, 150, provider)
        second = handle_completion(ledger, "acc", "gen", 200, 150, provider)

        self.assertEqual(first["status"], 200)
        self.assertTrue(first["provider_called"])
        self.assertFalse(second["provider_called"])
        self.assertEqual(calls["n"], 1)
        self.assertEqual(ledger.available["acc"], 9_850)
        self.assertEqual(ledger.reconcile(), [])

    def test_empty_balance_does_not_change_state(self) -> None:
        ledger = Ledger()
        before = list(ledger.postings)
        result = handle_completion(ledger, "acc", "gen", 200, 200, lambda: None)
        self.assertEqual(result["status"], 402)
        self.assertEqual(ledger.postings, before)
        self.assertEqual(ledger.available, {})

    def test_provider_error_returns_hold(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 1_000)

        def provider() -> None:
            raise TimeoutError("нет ответа")

        result = handle_completion(ledger, "acc", "gen", 400, 400, provider)
        self.assertEqual(result["status"], 502)
        self.assertTrue(result["released"])
        self.assertEqual(ledger.holds, {})
        self.assertEqual(ledger.available["acc"], 1_000)
        self.assertEqual(ledger.reconcile(), [])

    def test_actual_above_hold_keeps_reserve(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 1_000)
        ledger.authorize("acc", "gen", 100)
        with self.assertRaises(ValueError):
            ledger.capture("acc", "gen", 150)
        self.assertEqual(ledger.holds["gen"], 100)
        self.assertEqual(ledger.available["acc"], 900)

    def test_bad_amount_does_not_move_balance(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 500)
        snapshot = list(ledger.postings)
        for value in (-1, True, 1.5):
            with self.assertRaises(ValueError):
                ledger.deposit("acc", value)  # type: ignore[arg-type]
        self.assertEqual(ledger.postings, snapshot)
        self.assertEqual(ledger.available["acc"], 500)

    def test_other_account_cannot_see_capture(self) -> None:
        ledger = Ledger()
        ledger.deposit("a", 1_000)
        handle_completion(ledger, "a", "gen", 100, 80, lambda: None)
        result = handle_completion(ledger, "b", "gen", 100, 80, lambda: None)
        self.assertEqual(result["status"], 403)
        self.assertNotIn("amount_minor", result)
        self.assertEqual(ledger.captures["gen"], 80)

    def test_repeat_while_held_does_not_call_provider(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 1_000)
        ledger.authorize("acc", "gen", 100, now=0)
        calls = {"n": 0}

        def provider() -> None:
            calls["n"] += 1

        result = handle_completion(ledger, "acc", "gen", 100, 100, provider)
        self.assertEqual(result["status"], 409)
        self.assertEqual(calls["n"], 0)
        self.assertEqual(ledger.holds["gen"], 100)

    def test_expired_hold_returns_to_balance(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 1_000)
        ledger.authorize("acc", "gen", 300, now=0)
        released = ledger.release_expired(60, 60)
        self.assertEqual(released, ["gen"])
        self.assertEqual(ledger.holds, {})
        self.assertEqual(ledger.available["acc"], 1_000)

    def test_parallel_spends_do_not_go_negative(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 100)
        errors: list[BaseException] = []

        def spend(index: int) -> None:
            try:
                handle_completion(ledger, "acc", f"g-{index}", 1, 1, lambda: None)
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=spend, args=(i,)) for i in range(1000)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(errors, [])
        self.assertEqual(ledger.available["acc"], 0)
        self.assertEqual(sum(ledger.captures.values()), 100)
        self.assertEqual(ledger.reconcile(), [])

    def test_overdraft_is_the_only_allowed_minus(self) -> None:
        ledger = Ledger()
        ledger.set_overdraft("acc", 30)
        ledger.authorize("acc", "gen", 30, now=0)
        self.assertEqual(ledger.available["acc"], -30)
        with self.assertRaises(InsufficientBalance):
            ledger.authorize("acc", "gen-2", 1, now=0)
        self.assertEqual(ledger.reconcile(), [])

    def test_stub_topup_is_closed_outside_stage(self) -> None:
        ledger = Ledger()
        with self.assertRaises(PermissionError):
            ledger.stub_topup("acc", 100, environment="prod")
        self.assertEqual(ledger.postings, [])

    def test_reconcile_reports_broken_transaction(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 10)
        ledger.postings.append({"txn_id": "broken", "account": "wallet:acc", "amount": 5})
        self.assertTrue(ledger.reconcile())

    def test_foreign_hold_is_rejected(self) -> None:
        ledger = Ledger()
        ledger.deposit("a", 100)
        ledger.authorize("a", "gen", 10, now=0)
        with self.assertRaises(AccountIsolationError):
            ledger.capture("b", "gen", 10)


class PricingAndFxTest(unittest.TestCase):
    def test_reference_quote(self) -> None:
        total = quote_minor(
            prompt_tokens=1000,
            completion_tokens=500,
            cached_tokens=100,
            reasoning_tokens=20,
            prompt_price=3,
            completion_price=6,
            cached_price=1,
            reasoning_price=10,
        )
        self.assertEqual(total, 6_300)

    def test_cbr_import_spread_and_stale_fallback(self) -> None:
        payload = (ROOT / "data" / "fixtures" / "cbr-daily.xml").read_text(encoding="utf-8")
        rates = parse_cbr_xml(payload)
        by_code = {rate.currency: rate for rate in rates}
        self.assertEqual(by_code["USD"].rub_minor_per_unit, int(92.5 * MINOR_PER_RUBLE))
        self.assertEqual(by_code["CNY"].rub_minor_per_unit, int(12.84 * MINOR_PER_RUBLE))
        with_spread = apply_spread(by_code["USD"].rub_minor_per_unit, 100)
        self.assertEqual(with_spread, int(92.5 * MINOR_PER_RUBLE * 1.01))

        fresh, alert = resolve_rate(rates, "USD", datetime(2026, 10, 16, 12, 0))
        self.assertFalse(alert)
        self.assertEqual(fresh.currency, "USD")

        stale, alert = resolve_rate(rates, "EUR", datetime(2026, 10, 18, 0, 0))
        self.assertTrue(alert)
        self.assertEqual(stale.currency, "EUR")
        with self.assertRaises(FxUnavailable):
            resolve_rate(rates, "GBP", datetime(2026, 10, 16))

    def test_capture_keeps_rate(self) -> None:
        ledger = Ledger()
        ledger.deposit("acc", 1_000)
        posted = datetime(2026, 10, 15)
        rate = FxRate("USD", 90 * MINOR_PER_RUBLE, posted, "cbr")
        _, alert = resolve_rate([rate], "USD", posted + timedelta(days=2))
        handle_completion(
            ledger,
            "acc",
            "gen",
            100,
            40,
            lambda: None,
            rate_minor=rate.rub_minor_per_unit,
            rate_alert=alert,
        )
        capture_rows = [row for row in ledger.postings if row.get("kind") == "capture"]
        self.assertTrue(capture_rows)
        self.assertTrue(all(row["rate_alert"] for row in capture_rows))
        self.assertEqual(ledger.reconcile(), [])


class ReconcileToolTest(unittest.TestCase):
    def test_tool_accepts_balanced_file_and_rejects_gap(self) -> None:
        balanced = [{"txn_id": "t", "account": "wallet:a", "amount": 1}, {"txn_id": "t", "account": "funding", "amount": -1}]
        self.assertEqual(problems_in_postings(balanced), [])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "postings.json"
            path.write_text(json.dumps(balanced), encoding="utf-8")
            self.assertEqual(reconcile_main([str(path)]), 0)
            path.write_text(json.dumps([{"txn_id": "t", "account": "wallet:a", "amount": 4}]), encoding="utf-8")
            self.assertEqual(reconcile_main([str(path)]), 1)
        self.assertEqual(reconcile_main([]), 2)

    def test_random_flow_stays_consistent(self) -> None:
        import random

        rng = random.Random(16)
        ledger = Ledger()
        ledger.deposit("acc", 50_000)
        open_ids: list[str] = []
        for index in range(30):
            generation_id = f"r-{index}-{uuid.uuid4().hex[:6]}"
            estimate = rng.randint(1, 100)
            try:
                ledger.authorize("acc", generation_id, estimate, now=index)
            except InsufficientBalance:
                continue
            open_ids.append(generation_id)
            if rng.random() < 0.5:
                ledger.capture("acc", generation_id, rng.randint(0, estimate))
                open_ids.remove(generation_id)
        for generation_id in open_ids:
            ledger.release("acc", generation_id)
        self.assertEqual(ledger.reconcile(), [])


if __name__ == "__main__":
    unittest.main()
