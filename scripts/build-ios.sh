#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/ios-env.sh

ci_args=()
if [[ "${PIXORA_CI:-0}" == 1 ]]; then
 python3 scripts/prepare-ci-firebase.py --ios-root ios/Config \
  --ios-info-plist ios/Pixora/Info.plist --ios-ci-info .p-build-app/local/ci/Info.plist \
  --feedback-properties-output .p-build-app/local/ci/feedback.properties
 export PIXORA_FEEDBACK_PROPERTIES="$PWD/.p-build-app/local/ci/feedback.properties"
 python3 scripts/encode-feedback-endpoint.py "$PIXORA_FEEDBACK_PROPERTIES" ios/Native/feedback_endpoint.h
 ci_args+=("PIXORA_APP_INFO_PLIST=$PWD/.p-build-app/local/ci/Info.plist")
fi
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
 -derivedDataPath "${IOS_DERIVED_DATA_PATH:-artifacts/ios/DerivedData}" CODE_SIGNING_ALLOWED=NO build "${ci_args[@]}" "$@"
