#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p coverage/native-core
xcrun clang++ -std=c++17 -O0 -g -fprofile-instr-generate -fcoverage-mapping \
  -Iandroid/app/src/main/cpp/engine tests/native/pixels_test.cpp \
  android/app/src/main/cpp/engine/pixels.cpp -o coverage/native-core/tests
LLVM_PROFILE_FILE=coverage/native-core/core.profraw coverage/native-core/tests
xcrun llvm-profdata merge -sparse coverage/native-core/core.profraw -o coverage/native-core/core.profdata
xcrun llvm-cov export coverage/native-core/tests -instr-profile=coverage/native-core/core.profdata \
  android/app/src/main/cpp/engine/pixels.cpp android/app/src/main/cpp/engine/pixels.h > coverage/native-core/coverage.json
xcrun llvm-cov report coverage/native-core/tests -instr-profile=coverage/native-core/core.profdata \
  android/app/src/main/cpp/engine/pixels.cpp android/app/src/main/cpp/engine/pixels.h

xcrun clang++ -std=c++17 -O0 -g -fprofile-instr-generate -fcoverage-mapping \
  -Itests/native/fakes -Iandroid/app/src/main/cpp/engine tests/native/adapter_test.cpp \
  android/app/src/main/cpp/engine/pixels.cpp -o coverage/native-core/adapter-tests
LLVM_PROFILE_FILE=coverage/native-core/adapter.profraw coverage/native-core/adapter-tests
xcrun llvm-profdata merge -sparse coverage/native-core/core.profraw coverage/native-core/adapter.profraw -o coverage/native-core/combined.profdata
xcrun llvm-cov export coverage/native-core/tests -object=coverage/native-core/adapter-tests -instr-profile=coverage/native-core/combined.profdata \
  android/app/src/main/cpp/engine/pixels.cpp android/app/src/main/cpp/engine/pixels.h android/app/src/main/cpp/engine/upscale.cpp > coverage/native-core/coverage.json
xcrun llvm-cov report coverage/native-core/tests -object=coverage/native-core/adapter-tests -instr-profile=coverage/native-core/combined.profdata \
  android/app/src/main/cpp/engine/pixels.cpp android/app/src/main/cpp/engine/pixels.h android/app/src/main/cpp/engine/upscale.cpp
