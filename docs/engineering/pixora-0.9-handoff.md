# Pixora 0.9.0 implementation handoff

Version0.9.0/code18 retains package `dev.kigya.pixora`. The source branch includes the preceding0.8.7 quality/onboarding/classifier changes and the approved Expo/Kinetik/Recreate revision. It targets `release/0.9.0`; main integration and public releases/stores are excluded.

## Build and artifact evidence

- Local signed ARM64 Android release APK: `Pixora-0.9.0-arm64.apk`, delivered to the owner's Downloads directory.
- Size: 246680294 bytes; SHA-256: `b27eb6a51c2bbbcd23d58da4c0ebf29a177653310b9f081dab97ff60660d6c88`.
- Certificate SHA-256: `1a9c186e2f95fce0c8ab3e5804e3d9e0fffc3ddf59a5286c4fd29ee4e3d4953d`; matches the preceding release certificate.
- APK metadata: package/version/code as above, non-debuggable, minSdk29, targetSdk36, compileSdk37. ZIP integrity,16KB ZIP alignment and all packaged ELF LOAD segment alignments verified.
- All10 bundled model-file hashes match their preserved manifest. Both authentic img2img demo assets match their manifest. Optional1.88GB weights and signing material are absent from the APK.
- Android release compilation completed for the startup correction. Separate TypeScript, test, lint and coverage checks were not run for this correction. Previous TypeScript compilation is historical. Artifact inspection does not establish startup, inference, UI, performance or image-quality acceptance.

## Unverified and open

All new JS/Kotlin/C++/iOS test suites, coverage measurement, device scenarios, Xiaomi, emulators and simulators are `not_run` by explicit owner instruction. Test sources were updated and strict100% thresholds/source-presence checks retained; historical100% receipts do not cover changed code. iOS dependency installation completed, but app compilation/runtime is not_run. Expo58 raises the iOS minimum to16.4.

Recreate is experimental. CPU memory guards, cancellation, download recovery and all screen behavior still need owner runtime review. Model downloads remain explicit and separate from cache cleanup; optional prompts stay local. The cat demo is genuine host inference, not a phone result or a quality benchmark.

Two open npm advisories propagate to21 high-severity package entries; see the tooling document. Security acceptance is not complete. The updated privacy-policy source is included, but this delivery does not publish gh-pages, main, a GitHub Release or stores. The older hosted policy remains until authorized publication.

## Startup correction

The owner-reported startup crash was traced in the existing Xiaomi crash log to external React Navigation hooks under Expo Router58. Hooks and screen types now use the Expo entry points. Splash shows the animated logo only; Android uses a theme-matched plain system background and transparent system icon with immediate handoff, while Aurora/logo fade in. The1500ms minimum begins at first layout and waits for readiness. Test suites, lint, coverage and a verification launch remain not_run; the owner will assess startup and visual continuity after the requested installation.
