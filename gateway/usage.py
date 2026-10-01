"""Проверка записи usage по schema/usage-event.schema.json без лишних полей."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schema" / "usage-event.schema.json"

REQUIRED = (
    "generation_id",
    "api_key_id",
    "model",
    "provider",
    "prompt_tokens",
    "completion_tokens",
    "latency_ms",
    "amount_minor",
)
NON_NEGATIVE = ("prompt_tokens", "completion_tokens", "latency_ms")
OPTIONAL = {"finish_reason"}


def load_schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_usage(event: dict) -> list[str]:
    schema = load_schema()
    allowed = set(schema["properties"])
    errors: list[str] = []
    for name in schema["required"]:
        if name not in event:
            errors.append(f"нет поля {name}")
    for name in event:
        if name not in allowed:
            errors.append(f"лишнее поле {name}")
    for name in NON_NEGATIVE:
        value = event.get(name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            if name in event:
                errors.append(f"{name} должно быть целым >= 0")
    for name in ("generation_id", "api_key_id", "model", "provider"):
        value = event.get(name)
        if name in event and (not isinstance(value, str) or not value):
            errors.append(f"{name} должно быть непустой строкой")
    if "amount_minor" in event and (
        isinstance(event["amount_minor"], bool) or not isinstance(event["amount_minor"], int)
    ):
        errors.append("amount_minor должно быть целым")
    if "finish_reason" in event and event["finish_reason"] is not None:
        if not isinstance(event["finish_reason"], str):
            errors.append("finish_reason должен быть строкой или null")
    unknown_optional = set(event) - set(REQUIRED) - OPTIONAL
    if unknown_optional:
        errors.extend(f"лишнее поле {name}" for name in sorted(unknown_optional))
    return errors
