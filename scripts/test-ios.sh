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
export FORCE_BUNDLING=1
mkdir -p coverage/ios artifacts/ios
python3 -c 'from pathlib import Path; Path("coverage/ios/coverage.json").unlink(missing_ok=True)'
if [[ "${IOS_SKIP_DEPENDENCY_SETUP:-0}" != 1 ]]; then
python3 scripts/setup-ios.py
"${IOS_BUNDLE_COMMAND[@]}" check || "${IOS_BUNDLE_COMMAND[@]}" install
"${IOS_BUNDLE_COMMAND[@]}" exec pod install --project-directory=ios
xcrun swift run --package-path scripts/ios-project xcode_spm_setup "$PWD/ios/Pixora.xcodeproj"
fi
simulator_id="${IOS_TEST_SIMULATOR_ID:-}"
created_simulator=false
if [[ -z "$simulator_id" ]]; then
 runtime_id="$(xcrun simctl list runtimes --json | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["runtimes"] if x.get("isAvailable") and "iOS" in x["name"]]; print(sorted(r,key=lambda x:tuple(map(int,x["version"].split("."))))[-1]["identifier"])')"
 simulator_id="$(xcrun simctl create "Pixora Native Tests" com.apple.CoreSimulator.SimDeviceType.iPhone-17 "$runtime_id")"
 created_simulator=true
fi
cleanup() {
 if [[ "$created_simulator" == true ]]; then
  xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
  xcrun simctl delete "$simulator_id" >/dev/null 2>&1 || true
 fi
}
trap cleanup EXIT
xcrun simctl boot "$simulator_id" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$simulator_id" -b
if [[ -n "${PIXORA_METRO_CONFIG:-}" ]]; then export BUNDLE_CONFIG="$PIXORA_METRO_CONFIG"; fi
xcodebuild -toolchain "$TOOLCHAINS" -workspace ios/Pixora.xcworkspace -scheme Pixora -configuration Debug \
 -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator_id" \
 -derivedDataPath artifacts/ios/DerivedData -enableCodeCoverage YES \
 CODE_SIGNING_ALLOWED=NO ENABLE_DEBUG_DYLIB=NO test "${ci_args[@]}" "$@"
python3 - <<'PY'
from pathlib import Path
import json, subprocess
root=Path.cwd()
profiles=list((root/'artifacts/ios/DerivedData/Build/ProfileData').rglob('Coverage.profdata'))
if not profiles:raise SystemExit('Missing real XCTest LLVM coverage profile')
profile=max(profiles,key=lambda p:p.stat().st_mtime)
binary=root/'artifacts/ios/DerivedData/Build/Products/Debug-iphonesimulator/Pixora.app/Pixora'
sources=sorted((root/'ios/Native').glob('*.mm'))+[root/'ios/Pixora/AppDelegate.swift']
with (root/'coverage/ios/coverage.json').open('w') as output:
 subprocess.run(['xcrun','llvm-cov','export',str(binary),'-instr-profile='+str(profile),*[str(p) for p in sources]],stdout=output,check=True)
subprocess.run(['xcrun','llvm-cov','report',str(binary),'-instr-profile='+str(profile),*[str(p) for p in sources]],check=True)
report=json.loads((root/'coverage/ios/coverage.json').read_text())
covered={Path(f['filename']).resolve() for f in report['data'][0]['files']}
missing=set(sources)-covered
if missing:raise SystemExit('Owned iOS sources missing from coverage: '+','.join(map(str,missing)))
PY
