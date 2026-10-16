# Verification matrix 0.8.0

Latest instruction on 2026-10-16: the owner reported successful manual review and paused further app tests. Latest UI/defaults/shared-engine changes are untested; earlier PASS results apply to earlier sources. Only a normal release build/installation proceeds for manual confirmation.

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
- iOS XCTest: target scenarios include all eight presets/five models, actual inference, tiled/whole delta, PNG/JPEG/WebP, preparation, cancellation/INTERRUPTED and retry. Final integrated iOS build/XCTest/coverage are pending; simulator XCTest does not establish physical iPhone behavior.
- Samsung debug: two Maestro flows and three `Pixora08Test` instrumentation tests passed for the recorded recommendation/preparation/upscale/save and settings/RTL/theme/feedback-privacy scenarios. The full scenario matrix, release installation and final artifact/hash remain pending; results are recorded locally.

## TEST-804 — consent, feedback and review (FEAT-804)

- `TelemetryTest`, `ApplicationStartupTest`, `FirebaseBoundaryTest`: default-off, legacy notice ≠ consent, independent flags, both Measurement overrides before eager Firebase init, storage failure, allowed fields and RC independence from opt-in.
- `ModuleUnitTest`: review only after result/saves and cooldown; a failed durable write prevents prompting; no rating gate before the store.
- `FeedbackClientTest`, `support/apps-script/feedback.test.cjs`: optional email, rating/message/UUID/size limits, platform enum with Android legacy default, configuration/network failures, redirects, server deduplication/quota and version/platform in email.
- Actual Analytics/Crashlytics/feedback delivery requires separate evidence; a unit mock, HTTP 200 or successful build does not prove receipt. A real feedback test requires explicit owner authorization.

## TEST-805 — languages and responsive layout (FEAT-805)

- `scripts/verify-locales.py`: 34 schemas/placeholders/flag hashes; `StoreAndLocalizationTest` and component tests: pt→pt-BR, first selection, persistence and native locale sync.
- `WindowLayoutTest`, `ActivityLifecycleTest`, layout/dialog tests: safe area, fold/resize, Activity restoration, light/dark/system, scrolling and large text.
- Samsung: language after restart, Russian/English, Hebrew RTL, large system font and restoration of the original font size. Translation schemas do not replace native-speaker review.

## TEST-806 — GitHub and release verification (FEAT-806)

Task PRs with independent review → release/0.8.0; one squash into main after local acceptance. CI runs only on main pushes. Check the same SHA, every job and CodeQL alerts, retaining links. Require measured 100% JS statements/functions/lines/branches and owned Kotlin/C++/ObjC++ lines/branches, plus presence of every owned source. Security covers secrets, workflows, dependency advisories, mobile static scans and independent review.

Secrets, private serials, raw logcat, user images and local signing material never enter public evidence. Final signing/store/GitHub Release publication uses a separate release workflow.
