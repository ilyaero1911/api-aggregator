"""Цена запроса в minor. Отдельная цена на prompt, completion, cached и reasoning."""

from __future__ import annotations

from gateway.billing import require_minor


def quote_minor(
    *,
    prompt_tokens: int,
    completion_tokens: int,
    prompt_price: int,
    completion_price: int,
    cached_tokens: int = 0,
    reasoning_tokens: int = 0,
    cached_price: int = 0,
    reasoning_price: int = 0,
) -> int:
    parts = (
        ("prompt_tokens", prompt_tokens, "prompt_price", prompt_price),
        ("completion_tokens", completion_tokens, "completion_price", completion_price),
        ("cached_tokens", cached_tokens, "cached_price", cached_price),
        ("reasoning_tokens", reasoning_tokens, "reasoning_price", reasoning_price),
    )
    total = 0
    for token_name, tokens, price_name, price in parts:
        count = require_minor(tokens, token_name, allow_zero=True)
        unit = require_minor(price, price_name, allow_zero=True)
        total += count * unit
    return total
