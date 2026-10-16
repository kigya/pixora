#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p coverage/recommendation-jni
xcrun clang++ -std=c++17 -O0 -g -fprofile-instr-generate -fcoverage-mapping \
  -Itests/native/fakes -Inative/recommendation/include \
  tests/native/recommendation_jni_test.cpp \
  android/app/src/main/cpp/engine/recommendation_jni.cpp \
  native/recommendation/recommendation.cpp \
  -o coverage/recommendation-jni/tests
LLVM_PROFILE_FILE=coverage/recommendation-jni/tests.profraw \
  coverage/recommendation-jni/tests
xcrun llvm-profdata merge -sparse coverage/recommendation-jni/tests.profraw \
  -o coverage/recommendation-jni/tests.profdata
xcrun llvm-cov export coverage/recommendation-jni/tests \
  -instr-profile=coverage/recommendation-jni/tests.profdata \
  android/app/src/main/cpp/engine/recommendation_jni.cpp \
  > coverage/recommendation-jni/coverage.json
python3 - coverage/recommendation-jni/coverage.json <<'PYTHON'
import json
import sys
from pathlib import Path

report = json.loads(Path(sys.argv[1]).read_text())['data'][0]['totals']
for metric in ('lines', 'branches'):
    total = report[metric]['count']
    covered = report[metric]['covered']
    print(f"recommendation JNI {metric}: {covered}/{total}")
    if total <= 0 or covered != total:
        raise SystemExit(1)
PYTHON
xcrun llvm-cov report coverage/recommendation-jni/tests \
  -instr-profile=coverage/recommendation-jni/tests.profdata \
  android/app/src/main/cpp/engine/recommendation_jni.cpp
