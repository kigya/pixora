#!/usr/bin/env python3
"""Fail if any production layer lacks complete line/branch coverage or a report."""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parents[1]
failed = False

def check(label, covered, total):
    global failed
    print(f'{label}: {covered}/{total} ({100 * covered / total if total else 100:.2f}%)')
    if total == 0 or covered != total:
        failed = True

try:
    ts = json.loads((root / 'coverage/coverage-summary.json').read_text())['total']
    for metric in ['lines', 'branches']:
        check(f'TypeScript {metric}', ts[metric]['covered'], ts[metric]['total'])
    cpp = json.loads((root / 'coverage/native-core/coverage.json').read_text())['data'][0]['totals']
    for metric in ['lines', 'branches']:
        check(f'C++ {metric}', cpp[metric]['covered'], cpp[metric]['count'])
    kotlin = ET.parse(root / 'android/app/build/reports/jacoco/nativeJvmCoverage/nativeJvmCoverage.xml').getroot()
    for metric in ['LINE', 'BRANCH']:
        counter = kotlin.find(f"counter[@type='{metric}']")
        check(f'Kotlin {metric.lower()}', int(counter.get('covered')), int(counter.get('covered')) + int(counter.get('missed')))
    for source in kotlin.findall('.//sourcefile'):
        gaps = [f"{item.get('nr')}(lines={int(item.get('ci')) == 0}, branches={item.get('mb')})" for item in source.findall('line') if (int(item.get('ci')) == 0 and int(item.get('mi')) > 0) or int(item.get('mb'))]
        if gaps:
            print(source.get('name') + ': ' + ', '.join(gaps))
except (OSError, ValueError, AttributeError) as error:
    print(f'Missing or invalid report: {error}', file=sys.stderr)
    failed = True
sys.exit(1 if failed else 0)
