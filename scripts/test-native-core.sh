#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p coverage/native-core
rm -f coverage/native-core/coverage.json coverage/native-core/combined.profdata \
  coverage/native-core/core.profraw coverage/native-core/adapter.profraw
SHARED_ENGINE_DIR="$(cd "${SHARED_ENGINE_DIR:-native/engine}" && pwd)"
ANDROID_ENGINE_DIR="$(cd "${ANDROID_ENGINE_DIR:-android/app/src/main/cpp/engine}" && pwd)"
SHARED_SOURCES=("$SHARED_ENGINE_DIR/engine.cpp" "$SHARED_ENGINE_DIR/pixels.cpp")
RASTER_SOURCE="$SHARED_ENGINE_DIR/raster.cpp"
RASTER_SHIM="$ANDROID_ENGINE_DIR/raster_jni.cpp"
SHARED_HEADERS=("$SHARED_ENGINE_DIR/engine.h" "$SHARED_ENGINE_DIR/pixels.h")
ANDROID_SHIM="$ANDROID_ENGINE_DIR/upscale.cpp"
SHIM_DEFINE=(-DUPSCALE_ANDROID_SHIM=\"$ANDROID_SHIM\")
xcrun clang++ -std=c++17 -O0 -g -DNCNN_VULKAN=1 -fprofile-instr-generate -fcoverage-mapping \
  -Itests/native/fakes -I"$SHARED_ENGINE_DIR" tests/native/pixels_test.cpp \
  "$SHARED_ENGINE_DIR/pixels.cpp" -o coverage/native-core/tests
LLVM_PROFILE_FILE=coverage/native-core/core.profraw coverage/native-core/tests
xcrun clang++ -std=c++17 -O0 -g -DNCNN_VULKAN=1 -fprofile-instr-generate -fcoverage-mapping \
  -Itests/native/fakes -I"$SHARED_ENGINE_DIR" -I"$ANDROID_ENGINE_DIR" "${SHIM_DEFINE[@]}" \
  tests/native/adapter_test.cpp "${SHARED_SOURCES[@]}" -o coverage/native-core/adapter-tests
LLVM_PROFILE_FILE=coverage/native-core/adapter.profraw coverage/native-core/adapter-tests
xcrun clang++ -std=c++17 -O0 -g -fprofile-instr-generate -fcoverage-mapping -I"$SHARED_ENGINE_DIR" tests/native/raster_test.cpp -lz -o coverage/native-core/raster-tests
LLVM_PROFILE_FILE=coverage/native-core/raster.profraw coverage/native-core/raster-tests
xcrun clang++ -std=c++17 -O0 -g -fprofile-instr-generate -fcoverage-mapping -Itests/native/fakes -I"$SHARED_ENGINE_DIR" tests/native/raster_jni_test.cpp "$RASTER_SOURCE" -lz -o coverage/native-core/raster-jni-tests
LLVM_PROFILE_FILE=coverage/native-core/raster-jni.profraw coverage/native-core/raster-jni-tests
xcrun llvm-profdata merge -sparse coverage/native-core/core.profraw coverage/native-core/adapter.profraw coverage/native-core/raster.profraw coverage/native-core/raster-jni.profraw -o coverage/native-core/combined.profdata
xcrun llvm-cov export coverage/native-core/adapter-tests -instr-profile=coverage/native-core/combined.profdata \
  "${SHARED_SOURCES[@]}" "${SHARED_HEADERS[@]}" "$ANDROID_SHIM" "$RASTER_SOURCE" "$RASTER_SHIM" -object coverage/native-core/raster-tests -object coverage/native-core/raster-jni-tests > coverage/native-core/coverage.json
xcrun llvm-cov report coverage/native-core/adapter-tests -instr-profile=coverage/native-core/combined.profdata \
  "${SHARED_SOURCES[@]}" "${SHARED_HEADERS[@]}" "$ANDROID_SHIM" "$RASTER_SOURCE" "$RASTER_SHIM" -object coverage/native-core/raster-tests -object coverage/native-core/raster-jni-tests
