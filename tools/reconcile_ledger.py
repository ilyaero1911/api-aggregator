"""Сверка инварианта ledger. Печатает расхождения и возвращает ненулевой код."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path


def problems_in_postings(postings: list[dict]) -> list[str]:
    by_txn: dict[str, int] = defaultdict(int)
    for posting in postings:
        by_txn[str(posting["txn_id"])] += int(posting["amount"])
    return [
        f"транзакция {txn_id} не сходится: {total}"
        for txn_id, total in sorted(by_txn.items())
        if total != 0
    ]


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("usage: python3 tools/reconcile_ledger.py postings.json", file=sys.stderr)
        return 2
    postings = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    found = problems_in_postings(postings)
    if not found:
        print("сверка сошлась")
        return 0
    for item in found:
        print(item)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
