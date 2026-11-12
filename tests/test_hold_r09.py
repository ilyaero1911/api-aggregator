"""ID24_API-204, риск R09: баланс сохраняется, hold освобождается или уходит на сверку."""

import threading
import unittest

from gateway.billing import Ledger, ProviderOutcomeUnknown, handle_completion


def funded(amount: int = 1_000) -> Ledger:
    ledger = Ledger()
    ledger.deposit("acc", amount)
    return ledger


class ProviderFailureTest(unittest.TestCase):
    def test_confirmed_failure_releases_hold(self) -> None:
        ledger = funded()

        def provider() -> None:
            raise ConnectionRefusedError("провайдер недоступен")

        result = handle_completion(ledger, "acc", "gen", 400, 400, provider)
        self.assertEqual(result["status"], 502)
        self.assertTrue(result["released"])
        self.assertEqual(ledger.available["acc"], 1_000)
        self.assertEqual(ledger.holds, {})
        self.assertEqual(ledger.captures, {})
        self.assertEqual([p["kind"] for p in ledger.postings], ["deposit", "deposit", "hold", "hold", "release", "release"])
        self.assertEqual(ledger.reconcile(), [])

    def test_unknown_outcome_keeps_hold_for_reconcile(self) -> None:
        ledger = funded()
        calls = {"n": 0}

        def provider() -> None:
            calls["n"] += 1
            raise ProviderOutcomeUnknown("обрыв после отправки")

        result = handle_completion(ledger, "acc", "gen", 400, 300, provider)
        self.assertEqual(result["status"], 504)
        self.assertTrue(result["reconcile"])
        self.assertEqual(ledger.holds, {"gen": 400})
        self.assertIn("gen", ledger.to_reconcile)
        self.assertEqual(ledger.available["acc"], 600)

        repeat = handle_completion(ledger, "acc", "gen", 400, 300, provider)
        self.assertEqual(repeat["status"], 409)
        self.assertEqual(calls["n"], 1)
        self.assertEqual(ledger.release_expired(10**9, 60), [])
        self.assertEqual(ledger.holds, {"gen": 400})

    def test_reconcile_settles_once(self) -> None:
        ledger = funded()
        handle_completion(ledger, "acc", "gen", 400, 300, _unknown)
        ledger.settle("acc", "gen", 300)
        ledger.settle("acc", "gen", 300)
        self.assertEqual(ledger.captures, {"gen": 300})
        self.assertEqual(ledger.available["acc"], 700)
        self.assertEqual(ledger.to_reconcile, {})
        self.assertEqual(sum(1 for p in ledger.postings if p["kind"] == "capture"), 3)
        self.assertEqual(ledger.reconcile(), [])

    def test_reconcile_without_execution_returns_hold(self) -> None:
        ledger = funded()
        handle_completion(ledger, "acc", "gen", 400, 300, _unknown)
        ledger.settle("acc", "gen", None)
        self.assertEqual(ledger.available["acc"], 1_000)
        self.assertEqual(ledger.holds, {})
        self.assertEqual(ledger.captures, {})
        self.assertEqual(ledger.reconcile(), [])


class CaptureRejectTest(unittest.TestCase):
    def test_actual_above_hold_keeps_reserve(self) -> None:
        ledger = funded()
        result = handle_completion(ledger, "acc", "gen", 100, 150, lambda: None)
        self.assertEqual(result["status"], 200)
        self.assertTrue(result["reconcile"])
        self.assertEqual(ledger.holds, {"gen": 100})
        self.assertEqual(ledger.available["acc"], 900)
        self.assertEqual(ledger.captures, {})

        ledger.settle("acc", "gen", 150)
        self.assertEqual(ledger.captures, {"gen": 100})
        self.assertEqual(ledger.available["acc"], 900)
        self.assertEqual(ledger.reconcile(), [])


class BadAmountTest(unittest.TestCase):
    def test_bad_amounts_do_not_change_state(self) -> None:
        for estimate, actual in ((-1, 10), (10, -1), (True, 10), (10, False), (1.5, 1), (10, "5")):
            with self.subTest(estimate=estimate, actual=actual):
                ledger = funded()
                before = list(ledger.postings)
                calls = {"n": 0}

                def provider() -> None:
                    calls["n"] += 1

                result = handle_completion(ledger, "acc", "gen", estimate, actual, provider)  # type: ignore[arg-type]
                self.assertEqual(result["status"], 400)
                self.assertEqual(calls["n"], 0)
                self.assertEqual(ledger.postings, before)
                self.assertEqual(ledger.holds, {})
                self.assertEqual(ledger.available["acc"], 1_000)


class ConcurrentRepeatTest(unittest.TestCase):
    def test_parallel_repeats_call_provider_once(self) -> None:
        ledger = funded()
        calls = {"n": 0}
        gate = threading.Event()
        lock = threading.Lock()

        def provider() -> None:
            with lock:
                calls["n"] += 1
            gate.wait(1)

        results: list[dict] = []

        def run() -> None:
            results.append(handle_completion(ledger, "acc", "gen", 100, 80, provider))

        threads = [threading.Thread(target=run) for _ in range(20)]
        for thread in threads:
            thread.start()
        gate.set()
        for thread in threads:
            thread.join()

        self.assertEqual(calls["n"], 1)
        self.assertEqual(ledger.captures, {"gen": 80})
        self.assertEqual(sum(1 for r in results if r["provider_called"]), 1)
        self.assertEqual(ledger.available["acc"], 920)
        self.assertEqual(ledger.reconcile(), [])


def _unknown() -> None:
    raise ProviderOutcomeUnknown("нет подтверждения")


if __name__ == "__main__":
    unittest.main()
