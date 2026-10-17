# Verification matrix 0.8.x

Current 2026-10-16 instruction (ADR-814): automatic checks/fixes are authorized; Samsung UI and update installation are deferred. Fresh automatic results remain separate from historical physical checks.

The matrix links PRD criteria to executable checks. Test presence is not PASS; final outcomes and revisions are recorded in private coverage/build/device evidence.

## TEST-801 — recommendation (FEAT-801)

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
