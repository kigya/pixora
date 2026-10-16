# Pixora

Pixora enlarges small photos and illustrations on the device. The existing Android application uses bundled ncnn/Real-ESRGAN models, supports 2×/4×, comparison, PNG/JPEG/WebP export, cancellation and background processing. No account, ads, subscriptions or paid AI API.

## Development status

This repository imports the existing **0.7.2 Android baseline**. Version **0.8.0 is in progress**: content-based recommendations applied by a button, clearer preparation sizes, an offline iOS CPU port, independent telemetry settings, neutral review requests and 34 active languages. The owner reviewed the Android build and requested final UI changes; the requested changes are implemented. Local automatic coverage/security checks and Android/iOS release builds passed; the updated splash build is available locally, with Samsung installation and further device UI checks deferred by the owner. Full release acceptance is still open.

[Current requirements](docs/PRD.md) · [0.8.0 requirements](docs/product/prd.md) · Project status (private local evidence) · [Feature registry](docs/product/features.md)

## Privacy

Photo processing stays on the device. Firebase Analytics/Crashlytics, Remote Config and explicitly submitted feedback use the network; photos, file names and URIs are excluded from telemetry. Usage analytics and error reports default to enabled with an informational notice; each can be disabled in Settings. Previously saved choices are preserved. Remote Config is independent of those switches.

## Build and checks

Bare React Native **0.87.1**, React19, TypeScript, Node22 and JDK21. Use the lockfile (`npm ci`). `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `python3 scripts/verify-assets.py`. Android dependencies and model provenance/hashes are in `docs/dependencies.json`, model manifests and `docs/THIRD_PARTY_NOTICES.txt`. Native SDK downloads are checksum-verified. Local Android build tooling requires locally held signing/feedback configuration; no production signing material is distributed.

iOS15.1+ uses Xcode26.6: `bash scripts/build-ios.sh` prepares pinned native dependencies and builds the Release application with signing disabled. `bash scripts/test-ios.sh` is the simulator test entry point. These commands do not sign or publish an App Store build. Final acceptance uses the owner's Samsung device; old device reports do not establish 0.8.0 acceptance. Raw logs, device identifiers, local research, signing keys and signed APK/AAB files are excluded from this public repository.

## Languages and assets

Version0.8.0 has34 active language dictionaries, including Hebrew, Gujarati, Punjabi and Javanese, plus a Portuguese compatibility dictionary; Portuguese resolves to pt-BR. Translations have not been professionally reviewed. Preset illustration pairs are supplied examples, not verified outputs of the bundled models. Their redistribution was explicitly authorized by the owner. Third-party models/assets retain their original notices and licenses.

## Contribution flow

Task branches → PRs into `release/0.8.0` → independent review/owner acceptance → one squash merge to `main`. CI runs only on main push. Release publication and final signing are a separate workflow.
