#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p coverage/recommendation
# All suites execute the same production implementation in one binary. Keeping
# private functions in one translation unit also avoids duplicate coverage names.
xcrun clang++ -std=c++17 -O0 -g -fprofile-instr-generate -fcoverage-mapping \
  -Inative/recommendation/include tests/native/recommendation_test.cpp \
  tests/native/recommendation_boundaries_test.cpp \
  tests/native/recommendation_regression_test.cpp -o coverage/recommendation/tests
LLVM_PROFILE_FILE=coverage/recommendation/tests.profraw coverage/recommendation/tests
xcrun llvm-profdata merge -sparse coverage/recommendation/tests.profraw \
  -o coverage/recommendation/tests.profdata
xcrun llvm-cov export coverage/recommendation/tests \
  -instr-profile=coverage/recommendation/tests.profdata \
  native/recommendation/recommendation.cpp native/recommendation/include/recommendation.h \
  > coverage/recommendation/coverage.json
python3 - coverage/recommendation/coverage.json <<'PYTHON'
import json
import sys
from pathlib import Path

report = json.loads(Path(sys.argv[1]).read_text())['data'][0]['totals']
for metric in ('lines', 'branches'):
    total = report[metric]['count']
    covered = report[metric]['covered']
    print(f"recommendation C++ {metric}: {covered}/{total}")
    if total <= 0 or covered != total:
        raise SystemExit(1)
PYTHON
xcrun llvm-cov report coverage/recommendation/tests -instr-profile=coverage/recommendation/tests.profdata \
  native/recommendation/recommendation.cpp native/recommendation/include/recommendation.h
