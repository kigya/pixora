#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/ios-env.sh
python3 scripts/verify-assets.py
python3 scripts/setup-ios.py
"${IOS_BUNDLE_COMMAND[@]}" check || "${IOS_BUNDLE_COMMAND[@]}" install
"${IOS_BUNDLE_COMMAND[@]}" exec pod install --project-directory=ios
xcrun swift run --package-path scripts/ios-project xcode_spm_setup "$PWD/ios/Pixora.xcodeproj"
config="${CONFIGURATION:-Release}"
platform="${IOS_PLATFORM:-iphoneos}"
mkdir -p artifacts/ios
if [[ -n "${PIXORA_METRO_CONFIG:-}" ]]; then export BUNDLE_CONFIG="$PIXORA_METRO_CONFIG"; fi
xcodebuild -workspace ios/Pixora.xcworkspace -scheme Pixora -configuration "$config" \
 -sdk "$platform" -destination "generic/platform=$([[ "$platform" == iphonesimulator ]] && echo 'iOS Simulator' || echo iOS)" \
 -derivedDataPath "${IOS_DERIVED_DATA_PATH:-artifacts/ios/DerivedData}" CODE_SIGNING_ALLOWED=NO build "$@"
