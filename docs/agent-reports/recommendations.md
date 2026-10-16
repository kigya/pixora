# FEAT-801 / FEAT-802 implementation report

Implemented offline image recommendations and large-image preparation guidance in the recommendations worktree. The C++ classifier analyzes a bounded decoded private preview and defaults ambiguous, malformed, mixed, screenshot-like, and noisy inputs to a Lite suggestion. It composites RGB over neutral gray using alpha before measuring palette, edges, or grid evidence, so hidden RGB beneath transparent pixels cannot create a false Pixel grid. Strong visible pixel-grid evidence maps to Pixel; drawing-like palette/edge evidence maps to Art; varied photo-like content maps to Lite. Recommendations carry a reason and quality speed, and are only applied after an explicit button press. The heuristic is a product hypothesis, not a measured user benefit.

Android exposes `getImageRecommendation(imageId)` through `NativeUpscale`; decoding and analysis run on the existing IO executor, use only the private preview file, and do not send image data or identifiers to telemetry/network. Unavailable profiles return null. The UI ignores stale/mismatched results and never changes scale; failed/missing native results hide the card. Preparation copy explains memory/compute benefits, possible detail loss, unchanged original, and original/working/output dimensions. Confirmation retains Cancel and distinguishes Fast's 512 px AI input cap.

The shared C++ API is `native/recommendation/include/recommendation.h` with `pixora::recommendation::analyze(rgba, width, height, row_stride_bytes)`. Android CMake integration for the root agent:

```cmake
# In add_library(upscale SHARED ...)
engine/recommendation_jni.cpp
../../../../../native/recommendation/recommendation.cpp

# In target_include_directories(upscale PRIVATE ...)
../../../../../native/recommendation/include
```

The JNI bridge file is `android/app/src/main/cpp/engine/recommendation_jni.cpp`. iOS integration can compile the same shared core/header.

Localization keys were hand-authored in all 30 existing locale JSON files; locale schemas remain aligned. No CMake, existing upscale C++, consent/review, or language-selection files were changed.

Validation: TypeScript typecheck passed; focused recommendation Jest passed 12/12; full Jest passed 163/163 with 100% statements, branches, functions, and lines; native recommendation harness passed with 100% C++ line and branch coverage (110/110 lines, 64/64 branches), exported to `coverage/recommendation/coverage.json` with a positive-denominator machine gate. ESLint on changed TS files reported no errors (existing inline-style warnings remain); `git diff --check` passed. The supplied quality-review samples were also decoded locally and classified: licensed photograph `landscape-256.jpg` → lite/generic; test-labeled illustration `scene-65x49.png` → art/art; alpha sample `alpha.png` → art/art. None returned Pixel. This three-image smoke check is too small to validate false-Pixel risk; the classifier hypothesis remains unvalidated pending a larger labeled approved corpus. The docs search found only the existing baseline `docs/quality/review.md`, not a separate final audit-review artifact. Android Gradle/codegen and device validation remain for root integration.
