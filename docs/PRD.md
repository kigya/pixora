# Pixora — product specification and knowledge base

Document version: 2.7 · Date: 2026-10-10 · Historical built version: 0.7.2 / versionCode 9, package dev.kigya.pixora; installed on API 36 while Xiaomi retains the previous package. Package-change checks, implemented 0.7.1 behavior and outstanding 0.7 verification remain in private historical validation records.

## Product purpose

Pixora enlarges a small Android photo or illustration, compares it with the original and saves or shares a new copy. AI runs on the phone. The model is bundled in the APK, so even first use needs no network. No accounts, ads, payments, credits, API keys or mandatory subscriptions. Inference uses no server. By explicit owner request, a separate feedback feature sends text through free Google Apps Script to the developer's email. Support requires developer time but no paid service.

Users choose one image and 2×/4×, process, compare and receive a file. Exact recovery of lost details is not promised: AI may alter fine elements. The app is neither a face restorer nor a general editor.

## Approved 0.7 changes — implementation in progress

The owner explicitly approved Firebase Analytics, Crashlytics and Remote Config on Spark, superseding the previous ban on remote analytics/configuration. Inference and weights remain fully local. Release collects usage/errors by default with independent switches. Photos, URIs, filenames, email and feedback text never enter telemetry. Advertising identifiers/personalization are disabled. Users receive one nonblocking explanation. See the [event matrix](observability/events.md).

Eight BOOLEAN availability flags have local/server defaults=true. The last complete successful snapshot is saved atomically; cold startup applies cache/defaults immediately, followed by asynchronous fetch/activate with a 10-second timeout. Unavailable modes are hidden; native code checks flags before new work. Current jobs/results are not interrupted. All false blocks only new processing.

The 0.7.1 processing card shows a real percentage ring, elapsed time and three vertical stages. Backend badge/ETA are removed from UI; native ETA fields remain for compatibility. Its timer is isolated and progress separated from shared context. Lists are virtualized. The picker uses supplied pairs labeled Processing example with a separate selection button; they are not represented as bundled-model output. The storage slider follows the finger on the UI thread and saves on completion.

Twenty more languages were approved: bn, ur, id, tr, ko, it, vi, th, fa, pl, uk, nl, ro, el, cs, sv, hu, ta, te, mr. All 30 dictionaries were written manually with 209 matching keys/placeholders each. Emulator picker/Home/help checks covered every language in both themes; no native-speaker review. Registry-driven RTL covers ar/fa/ur; localized Intl.Collator sorts names. No external translation service/generator is used.

Target 0.7.0/code 7: release with existing package/key and R8/resource shrinking; debug .debug with a separate Firebase app and telemetry default OFF; separate unobfuscated coverage variant with telemetry OFF. Feedback endpoint moves from BuildConfig to encoded C++ data, making extraction harder without making a client URL secret. Release archives mapping, native symbols/build ID and Hermes source map.

Source presence does not establish requirements completion; actual status is recorded in private historical validation. Before 0.7, the last fully verified build remains 0.6.

All 30 full dictionaries are connected: the original ten plus twenty approved additions. ar/fa/ur support RTL. Schemas, placeholders and flags were checked; no native-speaker review. Remote Config with eight true flags was published; GA has 16 registered dimensions and five metrics. Intermediate debug/release APKs build. TS: 131 tests, 100% lines/branches; C++: 181/181 lines and 208/208 branches. 74 Robolectric tests pass; Kotlin: 922/922 lines and 982/982 branches. These measurements do not replace remaining Firebase/device checks.

This document is the primary requirements/current-behavior authority. Market research adds no features. Historical MVP and 0.2/0.3 changes are archived privately. Owner instructions take precedence; requirement updates are reflected here and in private local product context.

## Current behavior

### Main flow

Home shows the title, settings, a brief invitation to select an image for enlargement/detail improvement, an image card, one benefits block and help. The purple AI upscaling label is removed. No mandatory onboarding. Choose image opens the system Photo Picker/document picker for one file. Canceling is not an error; failed import preserves the previous session. Replacing an unsaved result requires confirmation.

Preparation shows a centered aspect-preserving preview without square black bars, eight presets with supplied Before/After pairs, original/expected dimensions, 2×/4× (default 2×), replacement and start actions. Examples are labeled and not represented as bundled-model output. Selecting scale does not start work. A large original is reduced only after a relevant confirmation with exact dimensions. Scale applies to the prepared image; the original file is unchanged.

Processing displays real stages, elapsed time, progress and cancellation. In 0.7.1 it omits backend badges and remaining-time estimates; native ETA fields remain for compatibility. Percentage reflects completed tiles. Import/model loading/finalization may be indeterminate. No stuck 99%. UI updates at most 4 times/second, notifications once/second. 100% follows successful file write/validation. Calm text explains long CPU work without falsely diagnosing a hang.

Result shows a comparison divider, accessible Before/After/Compare buttons, dimensions/time, PNG/JPEG/WebP explanations, save/share and new-image actions. Both sides share a viewport without rerunning inference. Full zoom/pan and 1:1 viewing are excluded. Saved output can be opened; repeating a format does not duplicate it. If users delete the saved file, export can run again.

### Help and settings

Shared help explains three ideas: learning from examples, making a larger copy and possible detail changes. One Got it button, Back and outside-tap dismissal. Available on Home, preparation and Settings. It does not repeat button instructions/privacy or define AI as a program. Keep text brief/plain; no formal ASD-STE100 certification is claimed.

Settings include language, theme, export format, system notification settings, working-file storage, session deletion, temporary-file cleanup, version, help, privacy and original license texts. JPEG quality is fixed at 95, but UI explains the format rather than the technical number. Settings show actual notification status, working-file help, a discrete retained-data limit and developer contact.

Themes: system, light and dark. Purple interactive accent, restrained cyan and neutral surfaces. Dark background #09090B, surface #18181B, text #FAFAFA, accent #7C3AED. System font, minimum 48 dp targets and 20 dp screen margins. Simple transform/opacity animations and 180–240 ms transitions respect reduced motion. No heavy shaders/particles/video/WebView.

Phones use one column; windows ≥720 dp with fontScale <1.5 use two. Large text remains scrollable. Safe areas/separating hinges are respected. RTL mirrors component order/Back while comparison, numeric dimensions, scale and time remain LTR. Never limit font scaling. All actions have accessible names; comparison does not require dragging.

### Languages

Languages: English (en), Russian (ru), Simplified Chinese (zh-Hans), Spanish (es), Hindi (hi), Arabic (ar), Portuguese (pt, Brazil), French (fr), German (de) and Japanese (ja), plus system language. Regional tags map by language, all zh to zh-Hans, unknown languages to en. Changes apply immediately without restarting a job.

Picker: a settings row with native language name, local flag and arrow; bottom sheet on phones, centered panel up to 480 dp on wide windows. The list scrolls and marks selection with a check. Flags are decorative, Twemoji CC BY 4.0 with attribution. src/locales JSON is shared by React Native and native notifications; Gradle validates keys/parameters and copies assets. Numbers use locale formatting; filenames remain ASCII. Licenses are not translated.

### Notifications and lifecycle

Notification permission is optional. Denial does not block Android foreground service/background processing. With permission the card says users can do something else and shows notification progress. Without it, the card explains the result stays here and users can leave/return, with optional Enable notifications / Not now actions. Dismissal lasts for the session; permission suggestions appear at most three times. Returning from system settings rechecks permission/channel status. Android requires a service notification, but POST_NOTIFICATIONS controls shade visibility, not inference authorization. Text is neutral; only the icon is purple.

A native foreground service owns work independently of JS. Android 15+ uses mediaProcessing; Android 10–14 uses dataSync. Only an explicit action in a foreground Activity starts work; no boot receiver or periodic background start. Processing normally continues after minimize/lock. Force-stop, reboot and process termination interrupt without automatic resumption. The next launch offers retry from the beginning. Manufacturer restrictions may apply.

Cancellation exists in the app and notification. CANCELLING does not mean the active native call has returned: flags are checked between tiles. New work waits for resource release. Accepted cancellation forbids success/export and removes partial files. Jobs are capped at 30 minutes; system timeout releases service, notification and wake lock.

## Files, limits and privacy

| Limit | Value |
|---|---:|
| Platform | Android 10+, ARM64, 4 GB RAM class (3.5 GiB check) |
| Input | JPEG, PNG, static WebP |
| File / source | 50 MiB / 50 million pixels / side 20,000 px |
| Working image | Side ≤1024 px, ≤1,048,576 pixels |
| Output | 2×/4×; side ≤4096 px, ≤16,777,216 pixels |
| Preview | Long edge ≤1536 px |
| Active jobs | One |
| Free space | max(256 MiB, output pixels ×16 bytes) |

Validate format by content/decoding, not extension. Reject GIF, animated WebP, HEIC/HEIF, AVIF, RAW, SVG, PDF and video. Preparation preserves aspect ratio, floors integer dimensions with minimum 1 px and never enlarges small inputs. Large images use bounded decoding. Apply EXIF rotation/mirroring; use sRGB SDR. Do not carry GPS/EXIF or promise HDR.

AI enlarges RGB; alpha is resampled separately and hidden colors are recovered to prevent dark halos. PNG and lossless WebP preserve alpha. WebP uses the lossless API on Android 30+; Android 10 uses WEBP quality 100, which is lossless from API 29. PNG preserves colors losslessly; JPEG suits photos but may alter fine detail; WebP is compact but unsupported by some older apps. JPEG 95 replaces transparency with white after explanation/confirmation. No watermark.

MediaStore saves a new file in Pictures/Pixora. New filenames follow Pixora_YYYYMMDD_HHMMSS_2x.png, with matching scale/extension and collision suffixes; existing saved files are not renamed. Sharesheet needs no prior gallery export; cancellation preserves the result. Export failure does not invalidate successful processing.

App-private storage holds one session, working source, preview, result, journal, settings and temporary share files. Successful replacement removes the previous session. Temporary share files expire after 24 hours and are removed at the next startup or cleanup. Cleanup never deletes gallery files and protects active tasks. Retention choices: none / 10 / 50 / 200 MiB / unlimited. This limits retained data between process starts, not memory or disk during current processing. At startup, expired share files are removed first, followed by an over-limit last session. No retention disables restoration after a new process start. The current result remains available until then; saved images and bundled models are unaffected.

Release uses INTERNET for explicitly submitted feedback, Firebase Analytics, Crashlytics and Remote Config. AI and weights remain fully offline. No ads, remote fonts, model downloads or image cloud backup. Release telemetry defaults to enabled with two independent switches; photos and feedback content are excluded. Processing uses a foreground service, notification and bounded wake lock. No broad gallery/files access, camera, microphone, contacts, GPS, overlays or battery-exemption request. Debug may use Metro. A cloud URI selected in the system picker is not necessarily available offline. Sharesheet transfers a file only to the user-selected app.

## Developer contact and personal rating

Having issues in Settings opens a form with required reply email and a 5–4000-character message; optional personal 1–5 stars can be deselected by tapping again. It sends only entered fields, version and a random request ID to the developer. No photo, journal, URI, filename or device identifier is sent; this is explained before submission. Submission requires an explicit button and internet; duplicate taps during a request are blocked. A separate native executor handles network waiting without delaying AI cancellation/state reads. Errors preserve text and ID for safe retry; success requires handler confirmation. Local endpoint setup is described in [FEEDBACK](FEEDBACK.md).

After at least three distinct saved results, a personal-rating dialog may appear at most twice and no more than once per 30 days. Continue requires 1–5 stars; Not now dismisses. Ratings 1–4 open feedback with the rating and required email/message; submission requires an explicit button. Five stars opens Google Play. Before publication a separate confirmation identifies a Google Photos test link: it verifies navigation, not a request to review another app. Direct support retains optional rating. Rating-based routing was an explicit product-owner decision.

Google Apps Script runs under the owner's account with a fixed recipient and user Reply-To. No billing: local cap of 50 emails/day, 10-minute per-address limit and free-quota checks. Request IDs are cached for up to six hours; Google Cache may evict earlier. SMTP/account secrets are absent from the APK. Unavailable service or exhausted quota produces an error, never fake success. Product inference remains free and independent of this service.

## Image proportions

Preview/comparison display the whole image within its own bounds, centered and fitted to available width/height. The divider SVG is geometrically centered in its circle. Aspect ratios ≥12:1 show a continue/cancel warning before processing. No hard ban: panoramas, strips and scans remain available. This is a product warning threshold, not measured coverage of 99% of users.

## Architecture and state

React Native 0.87.1 / React 19 / strict TypeScript / Hermes / New Architecture, Community CLI. Kotlin TurboModule + processing service + C++17/JNI/ncnn. No Expo. Android/Gradle/Kotlin/NDK versions form a pinned compatible toolchain; builds are local. JS receives small snapshots and preview URIs, never full-resolution pixels/base64/weights.

Four primary AI networks provide seven original presets; a fifth legacy network preserves old-session compatibility. Actual inference is 4×, downsampled for 2×. Vulkan requires a real self-test, otherwise CPU uses at most 2 threads. GPU failure permits one CPU retry; LOW_MEMORY permits one tile-32 retry. Initial tiles: GPU 128 / CPU 64, padding 32, no TTA. FP16 storage/packed only on compatible GPUs; arithmetic disabled. Check return codes and release models/buffers. Preserve OpenMP affinity/topology and early omp_get_num_places initialization.

The native atomic journal is authoritative; JS subscribes before reading a snapshot and drops stale sequences. Job options are fixed at start. States: EMPTY → IMPORTING/READY → PREPARING → RUNNING → FINALIZING → SUCCEEDED; CANCELLING/CANCELLED/FAILED/INTERRUPTED. Export has a separate state. SUCCEEDED requires file validation. Old events cannot replace a new session. The journal is not written on every progress tick.

Core capabilities: pick/inspect/prepare, startJob, snapshots/events, cancel, export/share/open, discard/cleanup, settings, notifications and window layout. Errors use clear text without JNI/stacks/paths. Codes: UNSUPPORTED_FORMAT, ANIMATED_IMAGE, FILE_TOO_LARGE, DIMENSIONS_TOO_LARGE, SOURCE_UNAVAILABLE, DECODE_FAILED, DEVICE_UNSUPPORTED, MODEL_INVALID, LOW_STORAGE, LOW_MEMORY, GPU_FAILED, INFERENCE_FAILED, SERVICE_START_FAILED, TIME_LIMIT, INTERRUPTED, EXPORT_FAILED, SHARE_FAILED, BUSY. No endless retries. Canceling a system window is not an error.

## Performance and processing presets

| Preset | Model | Final processing |
|---|---|---|
| Standard | RealESRGAN_x4plus | No additional sharpening |
| Lite | realesr-general-x4v3 | No additional sharpening |
| Natural | RealESRNet_x4plus | Soft textures without additional sharpening |
| Detail | RealESRGAN_x4plus | Luminance unsharp mask: Gaussian σ=1 px, amount=0.15, threshold=3/255 |
| Balanced | RealESRGAN_x4plus | 80% AI + 20% high-quality upscaled working source |
| Sharp | RealESRGAN_x4plus | Same mask, amount=0.35 |
| Illustration | RealESRGAN_x4plus_anime_6B | No additional sharpening |
| Pixel Art | Without AI | Nearest-neighbor with exact pixel boundaries |

These are original functional alternatives to Upscayl presets, not copies of its models. Each supports 2×/4×. AI presets offer Fast/Quality; Pixel Art has no speed option. Quality processes the entire confirmed working input up to 1024 px. Fast uses the same model capped at 512 px without reducing small images. Target dimensions are identical: working size × scale. Fast output is resampled if needed and may simplify fine detail. UI shows AI input/output dimensions and identical computation for small inputs. Final processing runs at target size, preserves alpha and clamps RGB.

RealESRNet comes from the official release and is converted with pnnx to FP32 ncnn. Source, SHA-256 and PyTorch/ncnn comparison are in [natural-model.json](natural-model.json). [PRESETS](PRESETS.md) links suitable reference images, not app outputs. The current picker uses owner-supplied Before/After pairs; originals and transformed copies are listed in the [manifest](../assets/presets/manifest.json).

### Time estimates and animation

The native pipeline computes ETA independently of JS using padded tile areas and EMA 0.25 speed smoothing. It publishes an 80–150% range of estimated remaining time at most once/second and retains up to ten successful measurements per model-version/backend/tile/preset/speed/scale combination. Canceled/failed attempts do not train estimates. CPU fallback restarts accumulation. Finalization is separate without a fake zero remainder. Time is approximate; the 30-minute job limit remains.

The overlay stays within actual photo bounds: a soft purple/cyan strip, 3-second loop, Reanimated transform and opacity. It ignores touches and never simulates finished detail. Motion stops on backgrounding, cancellation and completion; Reduce Motion, power saving or thermal status ≥ MODERATE uses a static border. No blur, particles, shaders or layout changes.

Typed profileId/speed are fixed at startJobWithProfile; legacy startJob/startJobWithMode remain. Snapshot includes AI input, total/remaining-time ranges and animation restrictions. Unknown estimates are absent. Journal schema 1 migrates to 2 while preserving old mode/model/behavior. Branding does not change package ID, signing key, old URIs or exported files.

## Boundaries and acceptance

No batch/queue, separate face restoration, video, background removal, prompts, camera, incoming external Share Intent, multi-job history, custom models, accounts/sync, arbitrary scales, paid features, Play publication or iOS/web. Only free design references; never transplant web DOM. Sources/attribution: [DESIGN](DESIGN.md).

Acceptance: fresh release APK without Metro → airplane mode → local file → real AI 2×/4× → comparison → PNG/JPEG save and open in another app. Also verify large-source confirmation, original preservation, background/cancellation, notification denial, force-stop/recovery, low storage, GPU fallback, memory retries, RTL/locales/themes, accessible actions, 200% fonts, licenses/signature and offline inference.

Historical 0.3 and current 0.6 validation are held privately. Full TalkBack, native-speaker review, Adreno, real foldables/tablets and Android 10/12 are unverified. Android 11 was checked on an emulator and Android 15 on Xiaomi. Individual temperatures were recorded, but sustained thermal throttling was not evaluated. Do not promise universal performance/compatibility.

Maintain reproducible local builds, model/APK hashes, licenses, safe signing without source credentials and private performance/coverage/validation evidence. Before release, compare actual tests with feature status and Definition of Done.

Archived 0.4 device/coverage results do not verify changed 0.6 code. Historical 0.5 results are also retained privately; changed 0.6 code was verified separately.

The APK uses the existing signing key and package ID dev.upscaleimage.app, minSdk 29/target 36 and arm64-v8a. Release bundles four primary AI models, one legacy model and the Hermes bundle. INTERNET is needed only for feedback; LLVM profiling hooks are excluded from the final APK.

## Actual 0.6 verification

117 Jest/RNTL and 55 Robolectric tests, real native integrations and host C++ checks passed. Measured line/branch coverage: TypeScript 532/532 and 462/462; Kotlin 788/788 and 867/867; C++ 175/175 and 206/206. Android 11 ARM64 emulator checks covered all eight presets, both scales, both AI speeds, Natural parity, export and responsive screens. Xiaomi Android 15 measurements included 42 runs across seven AI presets, four maximum inputs and overlay on/off. Notifications are optional: actual background processing was verified after permission revocation. Short time estimates use seconds; equal rounded bounds display as one value. Detailed evidence and unverified conditions remain in private historical validation records.

### 0.7 verification update — 2026-10-10

Firebase received native-boundary test events and controlled JVM/NDK/JS failures from a separate diagnostics variant. Owned JVM/C++ frames are readable; the Hermes frame was resolved locally with its matching source map to index.diagnostics.js:10. The complete 26-event real-UI and Remote Config matrix is unfinished. All 30 languages were checked on Home/in the picker/help in both themes. Xiaomi: three CPU/GPU scrolling series were repeated; median GPU deadline jank fell from 68.84% to 55.81%, but GPU scrolling remains slow. The benchmark is unobfuscated and preserves inference configuration. Instrumentation viewport runs hit startup ANRs and runner-classpath failures. A separate API 36 emulator accessibility run checks the ordinary R8 release; detailed results, source files and limits remain in private historical validation evidence.

Release and debug 0.7 were built with ordinary Gradle tasks, without coverage/diagnostics. Release uses the existing key, R8/resource shrinking, 30 dictionaries and bundled weights; its update was installed on Xiaomi and starts without Metro. Mapping/native symbols were uploaded; the exact APK and decoding materials were archived locally. Acceptance remains incomplete: full viewport/Remote Config/real-analytics scenarios are open. Local artifacts: artifacts/Pixora-0.7.0-arm64.apk and Pixora-0.7.0-debug-arm64.apk.

### Release fix and Remote Config verification

Window resizing exposed react-native-screens restoration crashes: R8 renamed Fragment classes identified by a factory prefix. A narrow keepnames rule for those third-party Fragments fixes restoration while preserving owned-code obfuscation. The corrected release was installed as an update on Xiaomi/API 36. APK SHA-256: `908ecaa06845a02f23b2cdc3f8f94f1b5f141000782b2120aad3a845ef6de47d`. Matching mapping/native symbols were uploaded and archived. This identifies a verifiable historical build, not completed acceptance.

Xiaomi verified eight server flags set to false: a cold launch showed the unavailable-modes warning. The original eight true values were restored server-side; restarting removed the warning. Offline behavior, selected-mode changes and updates during active jobs require separate checks. Debug .debug was installed separately and started with project Metro on port 8082; Home showed Pixora and image selection.

Current R8 viewport matrix: 14/14 PASS — 320/360/412/840 dp, landscape and 200% fonts (Urdu/German), both themes. Home, Settings, picker and help were checked, not every product screen. Direct Xiaomi support opens email/message/optional rating. Actual evidence and outstanding checks remain private.

An API 36 cold start of the current release without active networking, after online use, was verified: saved language applies and image selection is available. First-ever offline startup and restoration of disabled flags require separate checks.

## 0.7.1 clarifications — approved, implementation and verification

Aim for an uncluttered interface without dense text blocks. Remove remaining-time estimates from UI completely while retaining compatible native ETA fields. The card shows actual percentage/elapsed time, three vertical stages and one current-action label, without GPU/CPU badge. Overlay/inference remain unchanged.

The storage slider keeps five limits. Labels/dots share coordinates and mirror for RTL. The thumb follows the gesture; the nearest value previews with animated digits while MiB stays fixed. Save occurs once on completion. Reduce Motion disables movement. Got it persists acknowledgment before a 180 ms fade/translate and 160 ms space collapse; failure keeps the card visible. Settings uses a gear icon.

Eight-mode examples were updated from owner-supplied Before/After images. Bundled copies have long edges up to 1280 px, JPEG quality 92 and preserved PNG/alpha. The latest clarification makes comparison height follow image proportions at available width, without cropping or added empty bands. Comparison buttons, separate mode selection and example labels remain. The manifest records dimensions/SHA-256. Examples are not represented as Pixora model outputs.

Before the first actual run, after preparation confirmation, disabled notifications trigger an optional offer. Enable and continue requests permission; Continue without notifications proceeds without it. Declining does not block background work. Back/backdrop cancels launch without saving a choice. Choosing stores notificationIntroSeen, default false for old installs. Granted permission skips the dialog; Android Settings never opens automatically. The post-start prompt no longer repeats; the existing background card remains. New strings were written manually in 30 languages without a translation API/generator.

Build 0.7.1/code 8 retains package/key and R8; debug builds separately. TypeScript: 151 tests/12 suites, 780/780 lines and 597/597 branches; Kotlin: 74 unit tests, 926/926 lines and 984/984 branches; C++: 181/181 lines and 208/208 branches. API 36 passed 14/14 size/theme/RTL/large-font scenarios. Detailed evidence/limits remain private. Outstanding 0.7 checks are not automatically closed.

## Package ID change — 2026-10-11

Explicit owner instruction changes package ID/namespace to `dev.kigya.pixora`, debug to `dev.kigya.pixora.debug`, superseding the old `dev.upscaleimage.app` requirement. Version 0.7.2/code 9 uses the existing key. The new ID creates a separate installation without automatic migration of private settings, permissions or work. The old app/data are retained. Two Android apps were registered in the existing Firebase project; previous apps, Remote Config and GA custom dimensions/metrics remain. Fresh validation is recorded privately; older reports are preserved.


## Approved 0.8.0 plan — 2026-10-16

Requirement changes: [workflow PRD](product/prd.md) and [decisions](engineering/decisions.md). Explicitly approved: iOS, pre-collection consent, neutral reviews, R8 off, more locales and GitHub. These supersede conflicting historical statements above only for 0.8.0. Verification uses Samsung SM-S916B instead of Xiaomi. A plan alone does not establish implementation.

### Manual-review clarification — 2026-10-16

The owner confirmed manual review and requested hiding suggestions after Apply, consistent centered Feedback/Privacy/Licenses headers, removal of the duplicate Having Issues button, animated startup branding and stable switches. Analytics/Crashlytics now default ON with a notice, preserving independent saved opt-outs; this supersedes the conflicting 0.8 default-OFF rule. Further app tests were paused by owner instruction; a release-mode Samsung build/install and manual confirmation are required. Historical results do not verify these latest changes.

Manual-review clarification on 2026-10-16: splash stays until initial data/navigation is ready and for at least 1500 ms, using max(loading, 1.5 s) without adding the two times. Brand animation also lasts 1500 ms. This is an explicit owner requirement and shared private lesson. The owner accepted other installed-release changes and requested continuation of the GitHub workflow. A repeated runtime app check was not requested.
