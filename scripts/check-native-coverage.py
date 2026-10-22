#!/usr/bin/env python3
"""Enforce native line/branch coverage in each CI job with nonempty denominators."""
import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--kotlin', type=Path)
parser.add_argument('--llvm', type=Path, action='append', default=[])
parser.add_argument('--require-source', type=Path, action='append', default=[])
parser.add_argument('--source-dir', type=Path, action='append', default=[])
parser.add_argument('--kotlin-source-dir', type=Path)
args = parser.parse_args()
if not args.kotlin and not args.llvm:
    parser.error('at least one real native coverage report is required')
gaps = []


def check(label, covered, total):
    print(f'{label}: {covered}/{total}')
    if total <= 0 or covered != total:
        gaps.append(label)


if args.kotlin:
    kotlin = ET.parse(args.kotlin).getroot()
    if args.kotlin_source_dir:
        represented = {
            (args.kotlin_source_dir / package.get('name') / source.get('name')).resolve()
            for package in kotlin.findall('package') for source in package.findall('sourcefile')
        }
        absent = {path.resolve() for path in args.kotlin_source_dir.rglob('*.kt')} - represented
        if absent:
            raise SystemExit('Owned Kotlin files missing from denominator: ' + ', '.join(map(str, sorted(absent))))
    for metric in ('LINE', 'BRANCH'):
        counter = kotlin.find(f"counter[@type='{metric}']")
        if counter is None:
            raise SystemExit('Missing JaCoCo counter: ' + metric)
        covered, missed = int(counter.get('covered')), int(counter.get('missed'))
        check('Kotlin ' + metric.lower(), covered, covered + missed)
    for source in kotlin.findall('.//sourcefile'):
        missing = [line.get('nr') for line in source.findall('line')
                   if int(line.get('mi')) > 0 and int(line.get('ci')) == 0
                   or int(line.get('mb')) > 0]
        if missing:
            print(source.get('name') + ' uncovered lines/branches: ' + ', '.join(missing))
represented_llvm = set()
for path in args.llvm:
    report = json.loads(path.read_text())
    if len(report['data']) != 1:
        raise SystemExit('Expected one LLVM coverage data section: ' + str(path))
    totals = report['data'][0]['totals']
    represented_llvm.update(Path(item['filename']).resolve() for item in report['data'][0]['files'])
    for metric in ('lines', 'branches'):
        check(str(path) + ' ' + metric, totals[metric]['covered'], totals[metric]['count'])
required = {path.resolve() for path in args.require_source}
for directory in args.source_dir:
    if not directory.is_dir():
        raise SystemExit('Missing owned native source directory: ' + str(directory))
    required.update(path.resolve() for path in directory.rglob('*')
                    if path.suffix in {'.c', '.cpp', '.m', '.mm', '.swift'})
absent = required - represented_llvm
if absent:
    raise SystemExit('Owned native files missing from denominator: ' + ', '.join(map(str, sorted(absent))))
if gaps:
    raise SystemExit('Incomplete native coverage: ' + ', '.join(gaps))
