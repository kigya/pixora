# Verification matrix — historical 0.8.x and Pixora 0.9

The 0.8.x sections below retain results and scenarios for their recorded revisions. They do not establish acceptance for 0.9. The owner requested updating tests but not running them for 0.9; all new/changed 0.9 scenarios are **NOT RUN**. Xiaomi, emulators and simulators remain excluded by explicit instruction.

The matrix links PRD criteria to executable checks. Test presence is not PASS; final outcomes and revisions are recorded in private coverage/build/device evidence.

## TEST-801 — recommendation (FEAT-801)

Current revision, 2026-10-17 (ADR-819): all updated scenarios below are **NOT RUN** at owner request. No new build, coverage, device, accuracy, size or latency result exists.

- Shared core: Standard vs Natural vs Balanced, alpha/hidden RGB, drawing agreement, mixed photo/text patches, phase-shifted full-resolution grids, 8/16 px block-grid abstention, one-axis patterns, malformed bounds and all availability fallback paths.
- JNI/Kotlin: structured decision/`null`, stable availability bits, 1024 px decode bound, buffer release, exceptions, fallback explanation, Lite-only configuration and no suitable profile.
- iOS: real shared generic decision, availability fallback/no suitable profile and missing-source analysis fallback without inference.
- Components: all new explanation reasons, explicit Apply/manual scale preservation and late old-image answers after replacement.

The following Samsung results are historical and do not verify ADR-819:

- `__tests__/recommendations.test.tsx`: post-import suggestions, Apply, manual mode/scale preservation, availability refresh, unsupported modes, analysis failure and stale asynchronous responses after photo replacement/removal.
- `tests/native/recommendation_test.cpp`: texture/edges/pixel grid, ambiguous inputs, small dimensions, alpha and extreme sizes. These are controlled fixtures, not an assessment of market accuracy.
- `tests/native/recommendation_jni_test.cpp`: JNI bitmap lock/unlock, exceptions, resource lifetimes and opaque compositing.
- `android/.../Pixora08Test.kt`: real JNI with a private copy of a licensed photo, current-image identity checks, disabled profiles and RGB under zero alpha.
- Samsung debug evidence: `Pixora08Test` — 3/3 instrumentation tests PASS, including real JNI, hidden transparent RGB and original/selected-scale preservation. Maestro recommendation/preparation/upscale/save flow PASS; component tests check Apply only on press, manual mode/scale preservation and races. Detailed local logs are private. Classifier accuracy on a labeled sample has not been established.

## TEST-802 — working-copy preparation (FEAT-802)

- Component tests: actual original/working/output dimensions, 2x/4x, portrait/landscape, Fast cap 512, confirmation and cancellation.
- `ImageFilesTest`, `CodecFailureTest`, `OwnedBoundariesTest`: orientation-aware downsampling, original preservation, alpha, working files and decode/write failures.
- `Pixora08Test.preparationPreservesOriginalAndCpuPipelineWritesSelectedScale`: original SHA-256 before/after, 1024×768 working copy, Fast AI at 512×384 and real 2048×1536 output at selected 2x.
- Samsung debug evidence: `Pixora08Test.preparationPreservesOriginalAndCpuPipelineWritesSelectedScale` passed, as did the Maestro debug recommendation/preparation/upscale/save flow. Component tests check actual dimensions, Fast cap 512, confirmation and cancellation. This establishes only the executed debug scenario; release verification and full acceptance remain pending.

## TEST-001 / TEST-803 — offline processing and iOS (FEAT-001/803)

- `ProcessorTest`, `ServiceLifecycleTest`, `StoreAndLocalizationTest`, `ModuleUnitTest`: states, progress, cancellation, recovery, failure/timeout/out-of-memory, backend selection and save/export.
- `tests/native/{pixels,adapter}_test.cpp`: owned C++ engine, tile boundaries, alpha, cleanup, exceptions and cancellation; the unit harness's ncnn stub is separate from real inference.
- Android instrumentation `NativePipelineTest`, `QualityReviewTest`, `ModuleContractTest`, `Pixora08Test`: real bundled models and bridge. Do not enable actual feedback submission without separate authorization.
- iOS XCTest: target scenarios include all eight presets/five models, actual inference, tiled/whole delta, PNG/JPEG/WebP, preparation, cancellation/INTERRUPTED and retry. Local 0.8.3 simulator XCTest passed 52/52 with 607/607 owned lines and 794/794 branches, and its unsigned generic-device Release passed with explicit XcodeDefault selection. Actual 0.8.2 main CI iOS linking failed (ADR-817); the corrective version must pass its own separate main gate. Simulator XCTest does not establish physical iPhone behavior.
- Samsung debug: two Maestro flows and three `Pixora08Test` instrumentation tests passed for the recorded recommendation/preparation/upscale/save and settings/RTL/theme/feedback-privacy scenarios. The full scenario matrix, release installation and final artifact/hash remain pending; results are recorded locally.

## TEST-804 — consent, feedback and review (FEAT-804)

- `TelemetryTest`, `ApplicationStartupTest`, `FirebaseBoundaryTest`: default-ON informational notice, preservation of explicit independent opt-outs, both Measurement overrides before eager Firebase init, storage failure, allowed fields and RC independence from opt-in.
- `ModuleUnitTest`: review only after result/saves and cooldown; a failed durable write prevents prompting; no rating gate before the store.
- `FeedbackClientTest`, `support/apps-script/feedback.test.cjs`: optional email, rating/message/UUID/size limits, platform enum with Android legacy default, configuration/network failures, redirects, server deduplication/quota and version/platform in email.
- Actual Analytics/Crashlytics/feedback delivery requires separate evidence; a unit mock, HTTP 200 or successful build does not prove receipt. A real feedback test requires explicit owner authorization.

## TEST-805 — languages and responsive layout (FEAT-805)

- `scripts/verify-locales.py`: 34 schemas/placeholders/flag hashes; `StoreAndLocalizationTest` and component tests: pt→pt-BR, system default, Settings override, persistence and native locale sync. The navigation test covers fresh-install Home with `languageChosen=false` and a system locale; this 0.8.4 change has not been run at the owner's request.
- `WindowLayoutTest`, `ActivityLifecycleTest`, layout/dialog tests: safe area, fold/resize, Activity restoration, light/dark/system, scrolling and large text.
- Samsung: language after restart, Russian/English, Hebrew RTL, large system font and restoration of the original font size. Translation schemas do not replace native-speaker review.

## TEST-806 — GitHub and release verification (FEAT-806)

Task PRs with independent review target `release/<version>`; one squash into main after local acceptance. A failed main run requires a new corrective version under ADR-815–817. CI runs only on main pushes. Check the same SHA, every job and CodeQL alerts, retaining links. Require measured 100% JS statements/functions/lines/branches and owned Kotlin/C++/ObjC++ lines/branches, plus presence of every owned source. Security covers secrets, workflows, dependency advisories, mobile static scans and independent review.

Secrets, private serials, raw logcat, user images and local signing material never enter public evidence. Final signing/store/GitHub Release publication uses a separate release workflow.

## TEST-807 — manual-review fixes and startup

- `recommendations.test.tsx`: Apply hides the current photo's card; replacing the photo permits a new suggestion.
- `pixora07.test.tsx`: informational notice, immediate switch position, serialized native writes, stale failure and rollback of the latest error.
- `navigation.test.tsx`: finishStartup after navigation readiness, including an initial loading error.
- `ActivityLifecycleTest`: both readiness/deadline orders, 1499/1500 ms boundary, destroy/recreate. `ModuleUnitTest`: main-looper callback and null/unrelated/MainActivity cases.
- `ios/Tests/PixoraStartupTests.mm`: readiness/deadline, Reduce Motion and startup telemetry. Simulator XCTest does not establish physical-device behavior.

## TEST-808 — corrective CI organization (ADR-816)

The 0.8.2 workflow separately runs first-party C++ extraction/strict coverage, unsigned iOS generic-device Release, and simulator XCTest/strict coverage. Every owned implementation source must appear in its report, with nonzero 100% line and branch totals. Compile-only commands include the remaining Android/JNI C++ translation units for CodeQL; they do not count as additional runtime coverage. Objective-C++ remains covered by the iOS mobile source scan, not CodeQL. Main CI must pass on the final squash SHA; local PASS does not predict that result. Samsung installation and UI remain deferred.

TEST-808 also verifies ADR-817: both iOS scripts explicitly select the Xcode default toolchain, including when the parent environment lists Metal first. Device/simulator build settings must resolve existing Swift compatibility libraries; a successful settings query is not a build or test PASS.

## TEST-808 — full privacy policy access (0.8.6)

Requirement FEAT-807, explicit owner instruction on2026-10-17. Scenarios: Settings→Privacy preserves the local summary; explicit press opens the fixed HTTPS URL once without user-data parameters; browser rejection shows the localized failure message; offline keeps the summary available; navigation, all34 locales/legacy pt, RTL and long labels remain usable. Status: NOT RUN by explicit owner build-only decision; no device or automated runtime evidence is claimed.

## TEST-901 — Kinetik product introduction (FEAT-901)

Required component/native scenarios: three horizontal slides only; no vertical paging; before/after previews do not capture input; fresh install, upgrade bypass, skip, completion persistence, Settings replay, completion write failure, rotation/navigation, Reduce Motion, app background/foreground, large font, RTL and all 35 locale dictionaries. The first slide uses the bridge pair, the second the generated cat pair and the third a device/privacy illustration. **0.9 scenario sources updated; NOT RUN.** This does not establish actual phone layout, VoiceOver/TalkBack, motion smoothness or native-speaker quality.

## TEST-902 — presentation comparisons (FEAT-902)

Required: verify all eight Before transforms and provenance while confirming After hashes, dimensions, alignment and transparency remain exact. Presentation pairs are not quality-ground-truth data. Source/manifest scenarios for the current revision are **NOT RUN**; physical visual acceptance is **NOT RUN**.

## TEST-903 — prepared inputs and no Original resolution choice (FEAT-903)

Required: new-job UI never offers Original resolution; newly started jobs use the prepared copy; previous results remain viewable/exportable. Verify enhancement input policy and Recreate's 512 px long-edge generation cap, aspect padding/cropping, expected 2×/4× output dimensions, cancellation and invalid bounds. Updated UI/native test scenarios are **NOT RUN**. Old Original-resolution checks belong to their historical version only and must not be presented as 0.9 behavior.

## TEST-904 — model candidates and context (FEAT-904)

The host research harness compares current bundled ncnn inference, tile/context behavior and candidates under a licensed calibration/holdout manifest. This is separate from the product Recreate mode. Representative quality evaluation and phone speed/memory comparisons are **NOT RUN** for 0.9. Existing weights/IDs/finishers remain intact unless separately approved by quality evidence.

## TEST-801 host classifier coverage repair — 2026-10-22 (historical)

`test-recommendation-core.sh` recorded the preserved public image cases, private feature/vote/grid boundary cases and frozen pre-refactor regression fixtures against the earlier production classifier. That exact historical revision reported 227/227 lines and266/266 branches,100%; no exclusions or threshold changes. Golden results matched the independently compiled pre-refactor classifier for60 inputs and3840 profile-availability combinations, including padded RGBA strides and alpha. Allocation-failure fallback and unavailable-profile behavior were covered; the same recorded suites passed ASan/UBSan. Recommendation JNI was57/57 lines and34/34 branches. This historical report does not establish 0.9 coverage or any changed-source PASS. Xiaomi, emulators and simulators are NOT RUN by explicit owner constraint.

## TEST-905 — explicit Recreate model download and settings (FEAT-905)

Required: no automatic model download; license terms are shown before first download; explicit acceptance starts a resumable/cancellable download; transient files never appear as installed; size, revision and both SHA-256 checks gate readiness; retry recovers safely; delete removes only the generation model; cache clear preserves it, gallery, settings and active-job files. Verify storage/network/hash errors and download progress through Android/iOS bridge and Settings. Test sources updated; **NOT RUN**. No claim is made that a 1.88 GB model has been downloaded or validated on-device.

## TEST-906 — Recreate job lifecycle, privacy and output (FEAT-906)

Required: only explicit Recreate selection invokes native generation; one-line prompt remains local and absent from telemetry; seed and pinned revision persist across interrupted-session recovery; 4/8 controls map to native `fast`/`quality`; generation canvas caps at 512 px long edge, pads/crops aspect ratio, then uses existing AI upscaler for 2×/4×. Cover low-memory/low-storage before launch, allocation/model/integrity failures, cancel/timeout/retry, partial-file cleanup, alpha separation, metadata removal and preservation of the original. Progress uses native stages and remains indeterminate when unknown. Test sources updated; **NOT RUN**. CPU feasibility/latency and actual inference quality are unverified.

## TEST-907 — Kinetik UI, Expo integration and event-driven effects (FEAT-907/908)

Required UI scenarios: closed model selection independent of expansion, at most one expanded card, Compare Slider drag does not collapse it, recommendation only shows the model/action, no Original resolution choice, 2×/4× and format controls, theme/system and locale search/flags, actual storage usage/cache deletion, one-time notice, progress and background/Reduce Motion behavior. Verify native `SUCCEEDED` opens Aperture and triggers Confetti once, while restored results and exports do not replay effects. Verify Expo SDK58/RN0.88 routing and native compatibility, package ID/signature/version 0.9.0/code18, model hashes, session/settings migration, splash readiness and Node22/JDK21 build environment. Updated/added tests are **NOT RUN**. An APK build/signature inspection, if completed, is tracked separately and does not replace runtime acceptance.

## 0.9 overall status

All newly added or changed 0.9 test scenarios are **NOT RUN**, including JS/TS, Kotlin, C++, Objective-C++ and component tests. No current 0.9 coverage percentage is claimed. The previous 100% C++ classifier report and all earlier Android/iOS/device results are historical for their recorded revisions. Xiaomi, emulators and simulators were not run. A successful build, if later recorded, proves only the build checks that actually ran; it does not prove visual behavior, model quality, runtime, memory, speed or physical-device acceptance.

## Startup correction follow-up — NOT RUN

FEAT-907/TEST-907 follow-up: the owner observed two splash compositions and a crash. Existing Xiaomi crash logs identify the navigation-context mismatch; source correction switches route hooks/types to Expo Router. Android's first branded splash is removed; Aurora displays only the logo for at least1500ms from first layout and until initialization is ready, fading in from the theme-matched system background.

Future scenarios: cold launch in light/dark/system themes, saved appearance override, slow initialization, retry, Reduce Motion, rotation, foreground restoration, fresh onboarding and Settings/Back/replay navigation. All scenarios, test suites, lint, coverage and app verification launches are NOT RUN under the current owner instruction. Only release compilation, artifact inspection and requested package installation are performed separately. Installation is not startup acceptance.
