# Pixora 0.9 architecture

**Status snapshot: 2026-10-22.** This document describes the 0.9 source configuration, not runtime or release evidence. The 0.9 test sources were updated but tests have not been run for this change. The normal Android release build is pending in the root integration run. No device, Xiaomi, emulator, or simulator result is claimed here.

## JavaScript and navigation

Pixora 0.9 is an existing Android/iOS application using Expo SDK 58.0.17, React Native 0.88.0, React 19.3.0, TypeScript, Hermes, the New Architecture, and Expo Router 58.0.25. Versions are pinned in `package.json` and `package-lock.json`; Node 22 and JDK 21 are the project toolchain. This is a native development-client application, not Expo Go or a hosted EAS build.

`main` enters through `expo-router/entry`. Files in `app/` define Expo Router routes and `_layout.tsx` mounts `src/navigation/ExpoRoot.tsx`. `ExpoRoot` owns the `GestureHandlerRootView`, safe-area provider, app state provider, theme provider, startup surface, and Router stack. `src/navigation/RouteScreen.tsx` adapts the existing screen props to Router navigation, so Home, Settings, Onboarding, Feedback, and Language retain native stack Back behavior. `app/index.tsx` routes first installs to Onboarding and completed installs to Home.

`AppProvider` subscribes to the native job journal before refreshing settings, capabilities, model availability, and session state. `src/specs/NativeUpscale.ts` remains the typed native boundary. JavaScript exchanges small metadata snapshots, status, and preview/export URIs; image pixels and neural weights stay in native code. The splash combines the readiness gate with a 1500 ms minimum, and optional reconstruction-model downloading does not gate startup.

The native Android and iOS projects are retained and adapted manually. Do not regenerate them with Expo prebuild: the projects contain application-specific ncnn, service, model-store, permission, signing, and platform lifecycle code. Package/bundle identifiers remain `dev.kigya.pixora`.

## Native ownership and job lifecycle

Android keeps the Kotlin `NativeUpscale` TurboModule, persistent `SessionStore`, foreground `ProcessingService`, `ImageProcessor`, bitmap ownership, and JNI entry points. iOS keeps its Objective-C++ `PixoraUpscale` module, persistent session/settings state, worker queue, background-task expiration/cancellation, ImageIO/Core Graphics processing, and C++ entry points. Both call the shared native engine; neither routes pixels through JavaScript.

Only one processing job is active at a time. The native journal stores the job ID, processing kind, model revision, seed, prompt/parameters, progress stage, source/result metadata, and terminal state. Cancellation is forwarded to native workers and partial results are removed. A job reaches `SUCCEEDED` and publishes 100% only after the result file has been written and validated and its preview has been produced. A process interruption is recovered from the last saved journal; active work is not silently marked complete.

The existing enhancement path uses the bundled ncnn models and preserves their IDs, provenance, and hashes. Inference remains on-device. Android retains the foreground service and its bounded worker lifecycle; iOS uses the available background execution window and stops on expiration. GPU/CPU behavior for enhancement remains owned by the existing native engine.

## Explicit optional reconstruction

“Recreate” is a distinct user-selected operation. The normal enhancement path remains available and is the default. Reconstruction uses stable-diffusion.cpp at commit `39bc9d0b4bad86750fcb1fd2d711bc57a4c6018f`, SD 1.5 Q4_0 plus LCM-LoRA, and CPU inference. It is not an automatic fallback for low-quality images and is not a cloud service.

The two pinned files are fetched only after the user requests the download. Their combined declared size is 1,881,812,340 bytes (about 1.88 GB). Each file is written to a resumable temporary file, checked against its declared size and SHA-256, then promoted to the installed model path. The user can cancel, resume/retry, inspect storage use, and explicitly delete the downloaded model. Cache cleanup does not target the model directory. A readiness check includes the actual installed file verification before a reconstruction job may run.

| Asset | Pinned repository revision/file | Size | SHA-256 |
|---|---|---:|---|
| SD 1.5 Q4_0 | `gpustack/stable-diffusion-v1-5-GGUF@dcac270609fffc0ce7c7d41a3c0e752721859f7c/stable-diffusion-v1-5-Q4_0.gguf` | 1,747,190,784 bytes | `c2f6e92f9d08d69cc673a1003528ac8199274b3c0eaec88d5fbefe5af67bd42b` |
| LCM-LoRA | `latent-consistency/lcm-lora-sdv1-5@cf2fced511dbe7e26c8d1d397e728fbab875db4b/pytorch_lora_weights.safetensors` | 134,621,556 bytes | `8f90d840e075ff588a58e22c6586e2ae9a6f7922996ee6649a7f01072333afe4` |

The session stores the selected model revision, a generated seed, the optional prompt, step count, and the requested 2×/4× scale. The UI offers 4 or 8 LCM steps; native parameters use CFG 1 and strength 0.6. The source is proportionally reduced to a maximum 512 px long side for generation. Alpha is held separately and restored after RGB generation. The generated image then passes through the existing local upscaler to create the requested output dimensions. This path is experimental; quality, runtime, memory pressure, and device suitability have not been established by this source description.

## Result presentation and compatibility

While a job is active, the processing surface uses Aurora Veil, Scan Progress, Ring Spinner, and Progress Bar with native-reported stage/progress; unknown progress stays indeterminate. The result surface is reached only after native `SUCCEEDED`. After the user successfully saves an export, Home is wired to present the result through Aperture Card and request a one-time Confetti Burst for that job. These UI effects have not been device-verified in 0.9.

New jobs use a prepared working copy. The 0.9 interface does not offer an Original resolution choice. Legacy saved results remain viewable/exportable under their recorded metadata; retained compatibility handling is not a user-facing option for new jobs.

The first-install product introduction has three horizontally paged, passive product demonstrations. Completion is stored by the native onboarding-version preference on Start or Skip; Settings can replay it without changing first-run state. Existing installs are initialized as already introduced when native upgrade evidence exists. The system language remains the initial choice and language selection stays in Settings.

## Project layout

- `app/`, `src/navigation/`: Expo Router entry, route declarations, and retained screen adapters.
- `src/application/`, `src/domain/`, `src/specs/`: startup/session ownership, data rules, and native contract.
- `src/screens/`, `src/ui/`, `src/components/kinetik/`, `src/lib/kinetik/`: product screens, shared UI, Kinetik components and tokens.
- `src/locales/`: localized UI dictionaries and existing locale registry.
- `android/`, `ios/`: preserved native application shells, platform job owners, downloaders, and JNI/Objective-C++ bridges.
- `native/engine/`, `native/recommendation/`, `native/recreate/`: shared native processing/recommendation code and the optional reconstruction wrapper.
- `assets/recreate/`: demonstration pair; its manifest records source and generation provenance.
- `scripts/`: verification helpers, local dependency setup, and release build tooling.

## Historical architecture (not the 0.9 stack)

Through 0.8.x Pixora was Bare React Native 0.87.1 with React 19 and a React Navigation container. Original-resolution tiled processing and its explicit UI belonged to the approved 0.8 quality revision. The 0.9 owner-approved plan replaces the stack with Expo SDK 58 / React Native 0.88 and removes Original resolution from new-job UI. Previous build, device, and coverage receipts refer only to their recorded source revisions and must not be reused as 0.9 evidence.
