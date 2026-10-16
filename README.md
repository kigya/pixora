# Pixora

Pixora enlarges small photos and illustrations on the device. The existing Android application uses bundled ncnn/Real-ESRGAN models, supports 2×/4×, comparison, PNG/JPEG/WebP export, cancellation and background processing. No account, ads, subscriptions or paid AI API.

## Development status

This repository imports the existing **0.7.2 Android baseline**. Version **0.8.0 is in progress**: content-based recommendations applied by a button, clearer preparation sizes, an iOS implementation, consent-first telemetry, neutral review requests and localization/workflow updates. Planned behavior is not yet verified or released.

[Current requirements](docs/PRD.md) · [0.8.0 requirements](docs/product/prd.md) · Project status (private local evidence) · [Feature registry](docs/product/features.md)

## Privacy

Photo processing stays on the device. Firebase Analytics/Crashlytics, Remote Config and explicitly submitted feedback use the network; photos, file names and URIs are excluded from telemetry. Baseline 0.7.2 collection defaults are documented in the PRD; consent changes are planned for 0.8.0, not claimed complete here.

## Build and checks

Bare React Native **0.87.1**, React19, TypeScript, Node22 and JDK21. Use the lockfile (`npm ci`). `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `python3 scripts/verify-assets.py`. Android dependencies and model provenance/hashes are in `docs/dependencies.json`, model manifests and `docs/THIRD_PARTY_NOTICES.txt`. Native SDK downloads are checksum-verified. Local Android build tooling requires locally held signing/feedback configuration; no production signing material is distributed.

iOS build instructions will be added with the implementation. Final acceptance uses the owner's Samsung device; old device reports do not establish 0.8.0 acceptance. Raw logs, device identifiers, local research, signing keys and signed APK/AAB files are excluded from this public repository.

## Languages and assets

The baseline contains30 language dictionaries; 0.8.0 retains them and adds required workflow locales. Translations have not been professionally reviewed. Preset illustration pairs are supplied examples, not verified outputs of the bundled models. Their redistribution was explicitly authorized by the owner. Third-party models/assets retain their original notices and licenses.

## Contribution flow

Task branches → PRs into `release/0.8.0` → independent review/local checks → one squash merge to `main`. CI runs only on main push. Release publication and final signing are a separate workflow.
