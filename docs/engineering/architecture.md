# Architecture

Existing baseline: Bare RN 0.87.1 / React 19 / TypeScript / Hermes; Android Kotlin TurboModule + foreground service + JNI/C++/ncnn. Full-resolution images never enter JS. Weights are bundled; sources and SHA-256 values are preserved.

0.8.0: shared C++ primitives and recommendation policy; Objective-C++ iOS TurboModule, ncnn CPU and limited background execution. JS receives small typed snapshots/URIs and a suggestion. Independent Analytics/Crashlytics settings apply at native startup, separately from Remote Config. The latest owner decision enables fresh/unresolved legacy defaults with a notice; explicit saved values are preserved. Shared native/engine serves Android JNI and iOS CPU; processing stays local.

Sources: the primary PRD and approved owner plan; interface details are recorded with implementation.

Startup: AppProvider completes initial refresh before building NavigationContainer; onReady calls typed native finishStartup. Android OnPreDrawListener permits the first app frame only after readiness and the monotonic 1500 ms deadline, and is removed on destroy. The iOS branded overlay measures at least 1500 ms from attachment and dismisses after main-queue readiness; Reduce Motion cancels transform animation. No thread-blocking sleep.


## Shared recommendation policy — 2026-10-17

`native/recommendation` owns content decisions and availability resolution for both platforms. Android decodes the import's working-size before.png up to 1024 px; iOS repeats prepareSelection's bounded 1024 px source decode in memory (the display preview may be 1536 px). Both provide straight RGBA; iOS unpremultiplies its CoreGraphics input. Analysis runs on existing native background I/O executors and never launches an upscale or sends pixels over the JS bridge.

The core measures visible color/luminance histogram occupancy, flat/edge/texture fractions, axis-aligned edges and local high-frequency residuals away from strong edges. It compares an alpha-aware area-averaged overview (long edge ≤256) with up to five distinct corner/center patches (each dimension ≤128) at working resolution. Full-resolution two-axis grid analysis searches periods 2–16 and every phase, requires near-flat interiors and widely occupied strong boundary lines, and rejects 8/16 px compression-like grids into the ambiguous branch. A cropped or noisy grid may abstain. Single-pixel art or genuine 8/16 px art may remain ambiguous by design.

Decision order: uninformative→generic Balanced; compression-like blocks→mixed Balanced; strong pixel grid→Pixel; interface evidence or photo/drawing disagreement→mixed Balanced; consistent flat illustrated content→Art; photograph-like overview and patch majority→Standard, or Natural when a strict majority is smooth with low noise and few strong edges; otherwise→mixed Balanced. Thresholds are hand-authored hypotheses, not calibrated probabilities. No Detail/Sharp recommendations, face recognition, OCR, model inference or dependency additions.

The internal stable availability bit order is standard/balanced/natural/lite/art/pixel. Shared `available()` retains the selected profile when enabled; otherwise tries standard, balanced, natural, lite and sets reason `unavailable`. It returns a null profile when none is suitable. Android JNI returns a small JSON decision or `null`; iOS builds the same decision object directly. The external `getImageRecommendation(imageId)` signature is unchanged; reason IDs add `smooth`, `mixed`, `unavailable`. Image identity and current availability are still guarded before display. No analysis values or recommendation events enter telemetry.

Tests/builds, binary size, runtime cost and corpus quality are unverified for this change by owner instruction. No prior strict-coverage receipt is carried forward.
