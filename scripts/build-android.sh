#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/verify-assets.py
python3 scripts/setup-ncnn.py
if [[ ! -f android/signing.properties ]]; then
  printf '%s\n' 'Create a local signing key first: python3 scripts/create-signing-key.py' >&2
  exit 1
fi
./android/gradlew -p android assembleRelease bundleRelease --console=plain
mkdir -p artifacts
version=$(node -p 'require("./package.json").version')
apk="artifacts/Pixora-${version}-arm64.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$apk"
shasum -a 256 "$apk" > "${apk}.sha256"
aab="artifacts/Pixora-${version}-arm64.aab"
cp android/app/build/outputs/bundle/release/app-release.aab "$aab"
shasum -a 256 "$aab" > "${aab}.sha256"
