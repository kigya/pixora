# Pixora 0.9 architecture

**Source snapshot: 2026-10-24, code19.** The follow-up uses a compact Recreate profile and a foreground model downloader. Current test/build/device evidence is recorded separately; source configuration alone is not runtime or release acceptance.

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


## Code19 resource and UX follow-up

The Models route owns selectable Enhance cards and the single Recreate package. Home keeps a compact selection row and optional prompt. Finishing onboarding uses Router replace/back; replay accepts serialized route parameters. The launch minimum counts only visible foreground time after first layout. Native release waits for initial settings hydration; the first resolved palette applies synchronously, and later theme changes retain their tween. Aurora fades from the shared native surface. Processing uses the actual source image plus Scan Progress, elapsed time and cancellation, with no Aurora or Aperture.

Recreate retains an output cap of 256 px (floor-preserved aspect) before enhancement. The selected experimental profile resamples the source into a 512×512 internal diffusion canvas with reflected padding, disables VAE tiling, crops the generated content and resamples it to the public output dimensions. A single-image host A/B rejected the 256 diffusion canvas and 128/256 VAE tiles because of visible color/banding artifacts. Disk-backed CPU parameters, mmap and disabled prefetch/conditioning cache remain. Managed SDK budgets are 512/768/1024 MiB for calibration, separate from OS memory/PSS. In the pinned SDK, CPU capacity checks return success and CPU graph segmentation is disabled (`src/model_manager.cpp`, `src/core/ggml_runner.cpp`); `max_vram` therefore does not enforce a CPU RAM cap or guarantee different streaming behavior for these values. Dynamic available-memory and disk checks remain. Input colors are composited over white for diffusion conditioning, while the original alpha is restored before enhancement. SD resources are released before ncnn starts. The retained model blobs and hashes are unchanged.

Android explicit model transfer uses a dedicated dataSync foreground service. Reserve-before-dispatch prevents double requests; cancellation retains partial files, and installation requires pinned SHA-256 verification. Notification permission is explained at point of use and is optional. Download bytes and installed bytes have different UI meanings. Storage classifies regular private files into disjoint categories using canonical paths; decimal presentation does not migrate binary cache-limit settings.

Star selection has a visual change callback and a separate successful-gesture commit callback. Commits navigate once, with a persisted five-minute/per-job gate. Screen analytics carries a compact navigation context; result/processing schemas stay privacy-allowlisted and below the 25-parameter limit. Model-transfer events report bounded statuses, and raw platform errors are normalized before storage or telemetry.

The corrected reconstruction profile checks for 2 GiB of OS-available memory before launch, separately from the SDK managed-memory budget. This guard follows the measured approximately 2.5 GiB process PSS of the first corrected Xiaomi run; it does not cap total process memory.

Android service timing is mode-specific: Recreate 45 minutes, Enhance 30 minutes; the wake-lock lease is the selected deadline plus 30 seconds. This follows a real eight-step TIME_LIMIT failure at 1,816,925 ms. Recreate reports `RECREATE_TIME_LIMIT` so the shared localized error formatter shows 45; ordinary `TIME_LIMIT` continues to show 30, including the unchanged iOS lifecycle. The instrumentation wait follows the production Recreate deadline plus bounded cleanup grace.
