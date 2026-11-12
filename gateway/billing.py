"""Срез биллинга Release 0.5: двойная запись, hold и одно списание.

Суммы — целые minor (1 ₽ = 1_000_000). float и bool запрещены.
Каждая транзакция сбалансирована: сумма проводок равна нулю.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict

MINOR_PER_RUBLE = 1_000_000
STUB_ENVIRONMENTS = frozenset({"dev", "stage", "alpha"})


class InsufficientBalance(Exception):
    pass


class AccountIsolationError(Exception):
    pass


class ProviderOutcomeUnknown(Exception):
    """Провайдер мог выполнить запрос, но подтверждения нет (обрыв после отправки)."""


def require_minor(value: object, name: str, *, allow_zero: bool = False) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} должно быть целым")
    if value < 0 or (value == 0 and not allow_zero):
        raise ValueError(f"{name} должно быть больше нуля")
    return value


class Ledger:
    def __init__(self) -> None:
        self.available: dict[str, int] = {}
        self.holds: dict[str, int] = {}
        self.captures: dict[str, int] = {}
        self.hold_owner: dict[str, str] = {}
        self.capture_owner: dict[str, str] = {}
        self.hold_at: dict[str, float] = {}
        self.overdraft: dict[str, int] = {}
        self.to_reconcile: dict[str, str] = {}
        self.postings: list[dict] = []
        self._seq = 0
        self._lock = threading.RLock()

    def set_overdraft(self, account: str, limit_minor: int) -> None:
        limit = require_minor(limit_minor, "овердрафт", allow_zero=True)
        with self._lock:
            self.overdraft[account] = limit

    def stub_topup(self, account: str, amount_minor: int, *, environment: str) -> None:
        if environment not in STUB_ENVIRONMENTS:
            raise PermissionError("заглушка пополнения доступна только в dev, stage и alpha")
        self.deposit(account, amount_minor)

    def deposit(self, account: str, amount_minor: int) -> None:
        amount = require_minor(amount_minor, "сумма пополнения")
        with self._lock:
            self._post(
                self._txn("deposit"),
                [("funding", -amount), (f"wallet:{account}", amount)],
                kind="deposit",
            )
            self.available[account] = self.available.get(account, 0) + amount

    def authorize(
        self,
        account: str,
        generation_id: str,
        estimate_minor: int,
        now: float | None = None,
    ) -> bool:
        """Ставит hold. False — генерация уже известна, новый резерв не создан."""
        estimate = require_minor(estimate_minor, "оценка")
        with self._lock:
            self._reject_foreign(account, generation_id)
            if generation_id in self.captures or generation_id in self.holds:
                return False
            available = self.available.get(account, 0)
            if available + self.overdraft.get(account, 0) < estimate:
                raise InsufficientBalance(account)
            self._post(
                self._txn("hold"),
                [(f"wallet:{account}", -estimate), (f"hold:{account}", estimate)],
                kind="hold",
                generation_id=generation_id,
            )
            self.available[account] = available - estimate
            self.holds[generation_id] = estimate
            self.hold_owner[generation_id] = account
            self.hold_at[generation_id] = time.monotonic() if now is None else now
            return True

    def capture(
        self,
        account: str,
        generation_id: str,
        actual_minor: int,
        *,
        rate_minor: int | None = None,
        rate_alert: bool = False,
    ) -> None:
        actual = require_minor(actual_minor, "факт", allow_zero=True)
        if rate_minor is not None:
            require_minor(rate_minor, "курс", allow_zero=True)
        with self._lock:
            if generation_id in self.captures:
                self._reject_foreign(account, generation_id)
                return
            if generation_id not in self.holds:
                raise KeyError(generation_id)
            if self.hold_owner[generation_id] != account:
                raise AccountIsolationError(generation_id)
            hold = self.holds[generation_id]
            if actual > hold:
                raise ValueError("факт больше резерва")
            refund = hold - actual
            lines = [
                (f"hold:{account}", -hold),
                ("revenue", actual),
                (f"wallet:{account}", refund),
            ]
            meta: dict = {"kind": "capture", "generation_id": generation_id}
            if rate_minor is not None:
                meta["rate_minor"] = rate_minor
                meta["rate_alert"] = rate_alert
            self._post(self._txn("capture"), lines, **meta)
            if refund:
                self.available[account] = self.available.get(account, 0) + refund
            del self.holds[generation_id]
            del self.hold_owner[generation_id]
            del self.hold_at[generation_id]
            self.to_reconcile.pop(generation_id, None)
            self.captures[generation_id] = actual
            self.capture_owner[generation_id] = account

    def release(self, account: str, generation_id: str) -> None:
        with self._lock:
            if generation_id not in self.holds:
                return
            if self.hold_owner[generation_id] != account:
                raise AccountIsolationError(generation_id)
            hold = self.holds[generation_id]
            self._post(
                self._txn("release"),
                [(f"hold:{account}", -hold), (f"wallet:{account}", hold)],
                kind="release",
                generation_id=generation_id,
            )
            self.available[account] = self.available.get(account, 0) + hold
            del self.holds[generation_id]
            del self.hold_owner[generation_id]
            del self.hold_at[generation_id]
            self.to_reconcile.pop(generation_id, None)

    def mark_reconcile(self, account: str, generation_id: str, reason: str) -> None:
        """Оставляет hold до сверки: ни списания, ни возврата до ответа провайдера."""
        with self._lock:
            if generation_id not in self.holds:
                raise KeyError(generation_id)
            if self.hold_owner[generation_id] != account:
                raise AccountIsolationError(generation_id)
            self.to_reconcile[generation_id] = reason

    def settle(self, account: str, generation_id: str, actual_minor: int | None) -> None:
        """Итог сверки: None — провайдер не выполнил запрос, иначе фактическая сумма.

        Факт больше резерва списывается в пределах резерва, остаток уходит в
        отчёт сверки; резерв при этом не теряется.
        """
        with self._lock:
            if generation_id in self.captures:
                self._reject_foreign(account, generation_id)
                return
            if generation_id not in self.to_reconcile:
                raise KeyError(generation_id)
            if actual_minor is None:
                self.release(account, generation_id)
                return
            actual = require_minor(actual_minor, "факт", allow_zero=True)
            self.capture(account, generation_id, min(actual, self.holds[generation_id]))

    def release_expired(self, now: float, ttl_seconds: float) -> list[str]:
        if ttl_seconds < 0:
            raise ValueError("ttl должно быть неотрицательным")
        with self._lock:
            expired = [
                generation_id
                for generation_id, held_at in self.hold_at.items()
                if now - held_at >= ttl_seconds and generation_id not in self.to_reconcile
            ]
            owners = {generation_id: self.hold_owner[generation_id] for generation_id in expired}
        for generation_id, account in owners.items():
            self.release(account, generation_id)
        return expired

    def reconcile(self) -> list[str]:
        with self._lock:
            problems: list[str] = []
            by_txn: dict[str, int] = defaultdict(int)
            wallet: dict[str, int] = defaultdict(int)
            for posting in self.postings:
                by_txn[posting["txn_id"]] += posting["amount"]
                account = posting["account"]
                if account.startswith("wallet:"):
                    wallet[account.split(":", 1)[1]] += posting["amount"]
            for txn_id, total in by_txn.items():
                if total != 0:
                    problems.append(f"транзакция {txn_id} не сходится: {total}")
            seen = set(wallet) | set(self.available)
            for account in sorted(seen):
                expected = wallet.get(account, 0)
                actual = self.available.get(account, 0)
                if expected != actual:
                    problems.append(f"баланс {account}: проводки {expected}, кэш {actual}")
                floor = -self.overdraft.get(account, 0)
                if actual < floor:
                    problems.append(f"баланс {account} ниже овердрафта: {actual}")
            return problems

    def _reject_foreign(self, account: str, generation_id: str) -> None:
        owner = self.capture_owner.get(generation_id) or self.hold_owner.get(generation_id)
        if owner is not None and owner != account:
            raise AccountIsolationError(generation_id)

    def _txn(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}-{self._seq}"

    def _post(self, txn_id: str, lines: list[tuple[str, int]], **meta: object) -> None:
        if sum(amount for _, amount in lines) != 0:
            raise RuntimeError(f"проводка {txn_id} не сбалансирована")
        for account, amount in lines:
            if isinstance(amount, bool) or not isinstance(amount, int):
                raise ValueError("сумма проводки должна быть целой")
            row = {"txn_id": txn_id, "account": account, "amount": amount}
            row.update(meta)
            self.postings.append(row)


def handle_completion(
    ledger: Ledger,
    account: str,
    generation_id: str,
    estimate_minor: int,
    actual_minor: int,
    provider,
    *,
    rate_minor: int | None = None,
    rate_alert: bool = False,
    now: float | None = None,
) -> dict:
    """US-04 и US-05. provider вызывается только после успешного hold.

    Исход вызова провайдера:
    - успех — capture факта; факт больше резерва уходит на сверку, hold остаётся;
    - подтверждённый отказ (любое исключение) — release, баланс как до запроса;
    - ProviderOutcomeUnknown — hold остаётся до сверки, повтор провайдера не вызывает.
    """
    try:
        require_minor(estimate_minor, "оценка")
        require_minor(actual_minor, "факт", allow_zero=True)
        if rate_minor is not None:
            require_minor(rate_minor, "курс", allow_zero=True)
    except ValueError:
        return {"status": 400, "provider_called": False, "generation_id": generation_id}
    try:
        created = ledger.authorize(account, generation_id, estimate_minor, now=now)
    except InsufficientBalance:
        return {"status": 402, "provider_called": False, "generation_id": generation_id}
    except AccountIsolationError:
        return {"status": 403, "provider_called": False, "generation_id": generation_id}
    if not created:
        return _replay(ledger, account, generation_id)
    try:
        provider()
    except ProviderOutcomeUnknown:
        ledger.mark_reconcile(account, generation_id, "исход вызова провайдера неизвестен")
        return {
            "status": 504,
            "provider_called": True,
            "generation_id": generation_id,
            "reconcile": True,
        }
    except Exception:
        ledger.release(account, generation_id)
        return {
            "status": 502,
            "provider_called": True,
            "generation_id": generation_id,
            "released": True,
        }
    try:
        ledger.capture(
            account,
            generation_id,
            actual_minor,
            rate_minor=rate_minor,
            rate_alert=rate_alert,
        )
    except ValueError:
        ledger.mark_reconcile(account, generation_id, f"факт {actual_minor} больше резерва")
        return {
            "status": 200,
            "provider_called": True,
            "generation_id": generation_id,
            "reconcile": True,
        }
    return {
        "status": 200,
        "provider_called": True,
        "generation_id": generation_id,
        "amount_minor": actual_minor,
    }


def _replay(ledger: Ledger, account: str, generation_id: str) -> dict:
    with ledger._lock:
        if generation_id in ledger.captures:
            return {
                "status": 200,
                "provider_called": False,
                "generation_id": generation_id,
                "amount_minor": ledger.captures[generation_id],
            }
        return {"status": 409, "provider_called": False, "generation_id": generation_id}
