# Development and verification tooling

## 0.9 toolchain

Pixora 0.9 uses Expo SDK 58.0.17, React Native 0.88.0, React 19.3.0, Expo Router 58.0.25, and TypeScript. Use Node 22 (the package engine requires at least 22.11.0; CI pins 22.23.2) and JDK 21 (CI pins 21.0.12.1+1). The npm dependency tree is pinned by `package-lock.json`.

This project has custom native Android and iOS code. Use the retained projects and Expo CLI against them; do not run `expo prebuild` to replace native files. There is no EAS or Expo Go requirement. `npm run start` launches Metro with the development client; `npm run android` and `npm run ios` are interactive native development runners, not release verification.

## Local commands

| Command | Purpose | 0.9 status in this task |
|---|---|---|
| `npm ci` | Install exactly the npm lockfile tree | Not run |
| `npm run typecheck` | TypeScript check | Not run |
| `npm run lint` | ESLint | Not run |
| `npm test -- --runInBand --coverage` | Jest/React Native tests with coverage | Not run; test sources were updated only |
| `python3 scripts/verify-assets.py` | Verify asset/model provenance and hashes | Not run |
| `python3 scripts/verify-locales.py` | Verify locale keys/shapes/placeholders | Not run |
| `npm run coverage:check` | Enforce the configured JS coverage threshold | Not run |
| `npm run test:native-core` | Host native-core checks | Not run |
| `npm run build:android` | Normal local signed Android APK/AAB build via `scripts/build-android.sh` | Pending in the root integration run |
| `bash scripts/build-ios.sh` | iOS Release build using retained native project | Not run |
| `bash scripts/test-ios.sh` | iOS simulator XCTest | Not run; simulator execution excluded |

The Android release helper verifies assets, prepares the pinned ncnn dependency, requires local `android/signing.properties`, invokes Gradle Release APK/AAB tasks, and copies versioned artifacts plus SHA-256 files to `artifacts/`. Signing credentials and configuration remain local; do not commit them. The local signed0.9 release build completed; artifact evidence is in [the handoff](pixora-0.9-handoff.md). Compilation does not prove device runtime, performance, image quality, or store readiness.

The shared reconstruction library is a git submodule at `native/recreate/vendor/stable-diffusion.cpp`, pinned to `39bc9d0b4bad86750fcb1fd2d711bc57a4c6018f`. Release and host builds require this source at the recorded commit. ncnn setup and native build tooling are separate from the optional reconstruction model download: the model weights are not bundled in the APK and are downloaded only after the user chooses that action.

## Current verification record

The owner requested that tests be updated but not run, and excluded Xiaomi, devices, emulators, and simulators. The test suite for the 0.9 source state is therefore **not run**. Prior 0.8.x passes, coverage percentages, signed APK checks, and device observations remain revision-bound historical evidence; they do not establish 0.9 status. Android release and TypeScript compilation completed; see the versioned handoff for artifact inspection evidence. No iOS build/runtime, physical device, emulator, or simulator result is asserted by this document.

Strict coverage thresholds and source denominators must remain unchanged. Missing reports are not passes. Do not convert an unexecuted check into a green status or inherit prior 100% coverage for edited source.

## Open npm toolchain advisory issue

The local `npm audit --omit=dev` snapshot for this lockfile reports **21 high-severity affected package entries**, propagated from two advisories: `braces` stack exhaustion on deeply nested patterns (GHSA-vfj7-8cjw-p6xm) and `node-forge` PKCS#1 v1.5 signature verification (GHSA-86w9-cpqp-85rv). Several Expo, Metro and React Native entries are transitive vulnerability classifications rather than independent advisories. The registry versions checked during integration did not supply compatible fixes. Applying the suggested forced downgrade would replace the approved SDK/toolchain, so no such downgrade was made.

These are open toolchain/dependency findings. This source review does not establish runtime exploitability or a security pass. Exact local JSON stays in ignored `.p-build-app/local/expo09-advisories.json`. Revisit the findings before production acceptance; no audit or coverage gate was disabled.

## CI and release boundaries

The tracked GitHub workflow runs only on pushes to `main`; task branches/PRs do not imply CI evidence. The workflow's test, coverage, dependency-audit, Android, iOS Release, and simulator jobs are separate checks. A PR/build artifact without a matching successful run is not a CI pass. Git changes, pushes, pull requests, signing, GitHub Releases, and stores are owned by the primary integrator and require their own explicit task authorization.

The existing public workflow expects task PRs against `release/<version>` and one final version squash into `main`. This document does not claim a PR, push, final signature verification, GitHub Release, or store publication for 0.9.

## Reviewed native dependency publication

The only permitted Git submodule is `native/recreate/vendor/stable-diffusion.cpp` at `39bc9d0b4bad86750fcb1fd2d711bc57a4c6018f`, from the public leejet repository. Its MIT license is retained; its source is built with CPU-only backends and no examples/tests in app builds. The application wrapper accepts only the pinned local model paths and suppresses SDK diagnostics to keep prompts/paths out of logs. The submodule's own pinned dependency links are resolved recursively. Vendor code is a third-party dependency, not owned coverage; `native/recreate/recreate.cpp` and JNI remain owned and required by the unchanged100% gate.

The publication guard validates that exact path, commit and HTTPS repository metadata and rejects other submodules or extra Git configuration keys. Source-only regressions cover approved and rejected cases; they are `not_run` for0.9. Changes to the vendor pin require another explicit source/license review. No credentials, binaries, weights or local demo build outputs are published.
