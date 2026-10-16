#!/usr/bin/env python3
"""Require all four Jest metrics; report uncovered executable code honestly."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'coverage/coverage-summary.json').read_text())
failed = []
for metric in ('statements', 'branches', 'functions', 'lines'):
    result = report['total'][metric]
    print(f"{metric}: {result['covered']}/{result['total']} ({result['pct']}%)")
    if result['pct'] != 100 or result['total'] <= 0:
        failed.append(metric)
if failed:
    raise SystemExit('Incomplete owned JS/TS coverage: ' + ', '.join(failed))
