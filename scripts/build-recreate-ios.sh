#!/bin/bash
# CocoaPods build phase only; does not launch a simulator or run inference/tests.
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
sdk_path="$(xcrun --sdk "${SDK_NAME:-iphoneos}" --show-sdk-path)"
output_dir="${PODS_CONFIGURATION_BUILD_DIR:?}/PixoraDiffusion"
mkdir -p "$output_dir"
thin_libraries=()
for architecture in ${ARCHS:-arm64}; do
  build_dir="${DERIVED_FILE_DIR:?}/pixora-diffusion-${PLATFORM_NAME:-iphoneos}-$architecture"
  cmake -S "$project_root/native/recreate" -B "$build_dir" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_SYSROOT="$sdk_path" -DCMAKE_OSX_ARCHITECTURES="$architecture" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-15.1}" \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON -DSD_BUILD_EXAMPLES=OFF -DSD_BUILD_TESTS=OFF \
    -DSD_METAL=OFF -DSD_VULKAN=OFF -DSD_OPENCL=OFF -DSD_CUDA=OFF \
    -DGGML_OPENMP=OFF -DGGML_NATIVE=OFF -DGGML_ACCELERATE=OFF \
    -DGGML_BLAS=OFF -DPIXORA_RECREATE_BUILD_CLI=OFF -DPIXORA_RECREATE_BUILD_TESTS=OFF
  cmake --build "$build_dir" --config Release --target stable-diffusion --parallel 2
  libraries=()
  while IFS= read -r -d '' library; do libraries+=("$library"); done < <(find "$build_dir" -name '*.a' -print0)
  thin="$output_dir/libPixoraDiffusion-$architecture.a"
  xcrun libtool -static -o "$thin" "${libraries[@]}"
  thin_libraries+=("$thin")
done
xcrun lipo -create "${thin_libraries[@]}" -output "$output_dir/libPixoraDiffusion.a"
