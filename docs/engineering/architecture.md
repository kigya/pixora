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

## Explicit original-resolution processing — 2026-10-22

The default Prepared copy path retains its 1024 px working input and Fast 512 option. Home exposes Original resolution separately, forces Quality and shows the output cap and PNG-only export restriction before launch. JS and both native launchers enforce scale 2/4, output<=64000000 pixels and each side<=16384. Oversize input does not silently fall back. Existing bridge methods and saved jobs default to Prepared copy; legacy model IDs keep their previous mappings.

Android OriginalProcessor owns a BitmapRegionDecoder and processes 256 px source cores with per-network context. EXIF transforms map oriented regions back to raw source rectangles; application-owned bitmap references are released once even when identity operations alias. GPU failure restarts on CPU, allocation failure retries a smaller inner tile, and cancellation/deadline propagate through decoding boundaries, inference, finishing and PNG assembly. OriginalRaster is the controlled disk/JNI boundary; production LocalOriginalRaster always calls the native raster implementation.

iOS PixoraOriginal uses an oriented lazy CIImage, a CPU Core Image context with intermediate caching disabled and corresponding source regions. Existing CPU ncnn inference and finishers remain. Native/engine/raster writes premultiplied RGBA cores with bounded pwrite/pread buffers, then streams unpremultiplied sRGB PNG rows through zlib. No image-wide mmap or application-owned output bitmap is used. A source decoder may allocate internally; peak device memory remains unmeasured. There is no persistent inference-model cache.

Each platform publishes success only after finishing, validating output dimensions, atomically moving the PNG and writing a small preview. Job failures/cancellation remove partial output; startup removes orphaned partial raster/PNG files from the retained session. Original PNG export/share copies bytes; it never decodes the large result for transcoding. Prepared PNG/JPEG/WebP behavior is retained. No photo, filename, URI or feedback body is added to telemetry.

Shared paddingFor chooses 64 px for the RRDB Standard/Art/Natural networks and 32 px for Lite/legacy animevideov3, backed by bounded host untiled comparisons. Android outer regions use the same policy; Pixel has zero model context and integer nearest-neighbor scaling. Timing cache keys include the changed context. No model file/hash, OpenMP initialization, arithmetic or finisher parameter changed. Host verification and remaining mobile/iOS runtime limits are in the quality implementation report.
