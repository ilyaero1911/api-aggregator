"""Курс валюты в minor за 1 единицу и запасной курс, если источник старше суток."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta

from gateway.billing import MINOR_PER_RUBLE, require_minor

MAX_RATE_AGE = timedelta(hours=24)


class FxUnavailable(Exception):
    pass


@dataclass(frozen=True)
class FxRate:
    currency: str
    rub_minor_per_unit: int
    as_of: datetime
    source: str


def apply_spread(rub_minor_per_unit: int, spread_bps: int) -> int:
    base = require_minor(rub_minor_per_unit, "курс")
    points = require_minor(spread_bps, "спред", allow_zero=True)
    return base + base * points // 10_000


def parse_cbr_xml(payload: str, *, as_of: datetime | None = None) -> list[FxRate]:
    root = ET.fromstring(payload)
    if as_of is None:
        raw_date = root.attrib.get("Date", "")
        as_of = datetime.strptime(raw_date, "%d.%m.%Y")
    rates: list[FxRate] = []
    for node in root.findall("Valute"):
        code = (node.findtext("CharCode") or "").strip()
        nominal = int((node.findtext("Nominal") or "1").strip())
        raw_value = (node.findtext("Value") or "").strip().replace(",", ".")
        if not code or nominal <= 0 or not raw_value:
            continue
        rubles = float(raw_value) / nominal
        minor = int(round(rubles * MINOR_PER_RUBLE))
        rates.append(FxRate(code, minor, as_of, "cbr"))
    return rates


def resolve_rate(
    rates: list[FxRate],
    currency: str,
    now: datetime,
    *,
    max_age: timedelta = MAX_RATE_AGE,
) -> tuple[FxRate, bool]:
    matched = [rate for rate in rates if rate.currency == currency]
    if not matched:
        raise FxUnavailable(currency)
    fresh = [rate for rate in matched if now - rate.as_of <= max_age]
    if fresh:
        return max(fresh, key=lambda rate: rate.as_of), False
    return max(matched, key=lambda rate: rate.as_of), True
