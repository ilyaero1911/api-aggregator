"""Срез биллинга Release 0.5: hold до вызова и одно списание."""

from __future__ import annotations


class InsufficientBalance(Exception):
    pass


class Ledger:
    def __init__(self) -> None:
        self.available: dict[str, int] = {}
        self.holds: dict[str, int] = {}
        self.captures: dict[str, int] = {}

    def deposit(self, account: str, amount_minor: int) -> None:
        if amount_minor <= 0:
            raise ValueError("сумма пополнения должна быть больше нуля")
        self.available[account] = self.available.get(account, 0) + amount_minor

    def authorize(self, account: str, generation_id: str, estimate_minor: int) -> None:
        if generation_id in self.captures or generation_id in self.holds:
            return
        available = self.available.get(account, 0)
        if available < estimate_minor:
            raise InsufficientBalance(account)
        self.available[account] = available - estimate_minor
        self.holds[generation_id] = estimate_minor

    def capture(self, account: str, generation_id: str, actual_minor: int) -> None:
        if generation_id in self.captures:
            return
        hold = self.holds.pop(generation_id)
        if actual_minor > hold:
            raise ValueError("факт больше резерва")
        refund = hold - actual_minor
        if refund:
            self.available[account] = self.available.get(account, 0) + refund
        self.captures[generation_id] = actual_minor


def handle_completion(
    ledger: Ledger,
    account: str,
    generation_id: str,
    estimate_minor: int,
    actual_minor: int,
    provider,
) -> dict:
    """US-04 и US-05. provider вызывается только после успешного hold."""
    if generation_id in ledger.captures:
        return {
            "status": 200,
            "provider_called": False,
            "generation_id": generation_id,
            "amount_minor": ledger.captures[generation_id],
        }
    try:
        ledger.authorize(account, generation_id, estimate_minor)
    except InsufficientBalance:
        return {
            "status": 402,
            "provider_called": False,
            "generation_id": generation_id,
        }
    provider()
    ledger.capture(account, generation_id, actual_minor)
    return {
        "status": 200,
        "provider_called": True,
        "generation_id": generation_id,
        "amount_minor": actual_minor,
    }
