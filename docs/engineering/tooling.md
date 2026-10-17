# Build and verification

Use Node 22, JDK 21 and the pinned lockfiles. This is a Bare React Native project; no Expo setup or private agent library is required.

```sh
npm ci
python3 scripts/setup-security-tools.py
python3 scripts/check-publication.py --install-hooks
npm run typecheck
npm run lint
npm test -- --runInBand --coverage
python3 -m unittest discover -s tests/publication -v
python3 scripts/verify-assets.py
python3 scripts/verify-locales.py
```

The publication hooks preserve existing hooks and inspect staged content, commit messages and the complete histories of outgoing tips. They reject private/generated paths, credential material and Cyrillic maintenance text. Product locale JSON and escaped localized test strings remain supported. CI repeats the checks; `.gitignore` alone cannot protect already tracked or force-added files.

## Android

Install the SDK/NDK versions pinned in the Gradle files and set your local SDK path. Run `python3 scripts/setup-ncnn.py` to download the checksum-verified native SDK.

Download your own Firebase Android client configuration to the ignored paths `android/app/google-services.json`, `android/app/src/debug/google-services.json` and `android/app/src/release/google-services.json`. Register `dev.kigya.pixora` and the separate `dev.kigya.pixora.debug` client. Never commit the real configurations, signing files or credentials. Store a feedback URL only in ignored `android/feedback.properties` when testing the explicitly submitted feedback feature.

For a disposable CI build without production configuration:

```sh
cd android
./gradlew :app:assembleRelease :app:bundleRelease -Pci --console=plain
```

`-Pci` selects generated placeholder Firebase configuration even when real local files exist, disables symbol uploads and removes internet permission from CI APKs. These artifacts validate compilation and are not production releases. Ordinary release builds require real local Firebase configuration; signing is a separate local configuration. Debug signing material is also local and ignored.

## iOS

Use the pinned Xcode 26.6 default toolchain. The iOS scripts select `com.apple.dt.toolchain.XcodeDefault` process-locally and pass it explicitly to `xcodebuild`, so an installed Metal toolchain cannot redirect Swift compatibility library search paths. `bash scripts/build-ios.sh` prepares native dependencies and produces an unsigned Release build. `bash scripts/test-ios.sh` runs simulator XCTest. Neither command publishes an App Store build.

Ordinary builds require your own ignored `ios/Config/Debug/GoogleService-Info.plist` and `ios/Config/Release/GoogleService-Info.plist`. To compile and test with an unregistered placeholder project, run `PIXORA_CI=1 bash scripts/build-ios.sh` or `PIXORA_CI=1 bash scripts/test-ios.sh` in a clean checkout. Placeholder generation refuses to replace real configurations. It uses no production Firebase identity; analytics is deactivated for these verification builds.

The notification-availability fault fixture uses pinned, unmodified [fishhook test sources](../../ios/Tests/Support/fishhook/PROVENANCE.md). Their BSD-3-Clause license and SHA-256 hashes are included. The files belong only to the test target and are not linked into the production application.

iOS CI also encodes an explicitly fictitious feedback endpoint so validation tests exercise the configured path without private settings. These tests reject invalid input before HTTP execution; transport tests use their own mock protocol. Ordinary builds retain local feedback configuration and the unavailable-service fallback.

## Continuous integration

Main pushes run JavaScript/security, Android, C++ CodeQL, unsigned iOS device Release, and iOS simulator XCTest as separate jobs. The C++ job traces the first-party native harness builds and compiles the remaining Android/JNI translation units. Its strict coverage gate requires every owned C++ source. The simulator job separately requires every owned iOS implementation source and 100% line and branch coverage. Neither gate permits empty reports.

CodeQL does not support Objective-C or Objective-C++; the iOS implementation receives the existing mobile source scan. The iOS Release and simulator builds run outside C++ tracing so third-party Pods do not consume the native analysis budget. The C++ job is bounded at 45 minutes, with 90 minutes each for the independent iOS builds. A failed or timed-out main run blocks handoff and requires a corrective version through the same PR flow.

## Contribution and publication

Write documentation, comments, test names, commit messages and PR descriptions in English. Preserve the supported app translations. Task PRs target `release/<version>`; each version has one final squash into `main`. CI runs only on main pushes.

Keep agent instructions, skills, private reports, local configuration, raw logs and generated binaries outside Git. Before pushing, run `python3 scripts/check-publication.py --history HEAD` and the redacted secret scanner installed by `setup-security-tools.py`. Never suppress a real key as a scanner exception. License notices and model provenance must remain intact.

The repository's published branch history was sanitized. Old GitHub PR diffs, external clones and caches may retain earlier material; their contents are not evidence that current branch history is clean or unclean. Do not merge old history back into a sanitized branch.
