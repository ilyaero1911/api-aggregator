"""Scenario planning only, not a vendor quote or spending authorization."""
import csv
from pathlib import Path
for row in csv.DictReader(Path('docs/architecture/cloud-budget.csv').open()):
    base = sum(int(v) for k, v in row.items() if k != 'phase')
    print(f"{row['phase']}: base={base:,} RUB, reserve25%={base//4:,}, total={base*5//4:,} RUB/month (assumptions)")
