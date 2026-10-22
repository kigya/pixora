# Pixora 0.8.7 quality and introduction changes

This source candidate implements FEAT-901–904 and the owner-requested classifier coverage repair. It does not establish device acceptance or release readiness.

## Product behavior

- New installations open three skippable introduction scenes: assembled photo/detail reveal, photo/Art/Pixel examples and an offline-processing phone composition. Settings can replay them. Page changes are manual; local comparison animation runs once and remains draggable with Before/Compare/After buttons. Scene motion respects Reduce Motion, focus and background state. Completion is independent of language selection. Existing installation evidence bypasses the introduction; an unused historical iOS installation with no saved app state remains indistinguishable from a fresh installation.
- The existing eight Before assets have deterministic presentation-only degradation. After bytes and pair geometry are preserved. `assets/presets/manifest.json` records source revisions, SHA-256 and transformation parameters. These examples are excluded from model evaluation.
- Prepared copy remains the default, including its documented 1024px working limit and separate Fast 512 input. Original resolution is an explicit Quality-only option, with at most 64000000 output pixels and 16384 px per side. An oversize request cannot silently reduce resolution. The first original-resolution path saves/shares PNG only; the restriction is visible before processing. Prepared results retain their existing formats.
- Android reads oriented source regions; iOS renders oriented Core Image regions. The selected existing model and finisher process padded regions. A disk-backed premultiplied RGBA raster assembles cropped cores, then streams sRGB PNG rows. Original export/share copies bytes. The application does not create an output-sized Bitmap or image-wide mmap. Decoder internal allocation, peak mobile memory and latency are unmeasured. Cancellation, deadline, CPU fallback, ownership and temporary-file cleanup remain required.
- All34 active locales plus compatibility Portuguese have introduction/resolution strings. No cloud restoration mode, runtime model download, monetization or new telemetry payload was added.

## Model decisions

Bundled model files, hashes, model IDs, arithmetic, finisher parameters and Pixel Art scaling remain unchanged. Standard/Details/Balanced/Sharp share the x4plus network. Lite, Natural, Art and legacy animevideov3 retain their respective models.

Real host ncnn inference compared whole images with 32 px inner tiles and clipped context on a 160×112 licensed landscape crop and 160×120 original line/text geometry. Mean absolute error below is in 8-bit units, relative to the same model's untiled output.

| Network | Landscape context 32 / 64 | Lines context 32 / 64 |
|---|---:|---:|
| Standard | 0.625359 /0.043709 | 0.894574 /0.028446 |
| Natural | 0.254040 /0.019757 | 0.772073 /0.033182 |
| Art | 0.137726 /0.000090 | 0.055547 /0.000114 |
| Lite | 0.000086 /0.000067 | 0.000251 /0.000170 |
| Legacy animevideov3 | 0.000045 /0.000032 | 0.000177 /0.000101 |

The RRDB families use 64 px context based on this bounded parity comparison; compact Lite and legacy animevideov3 retain 32 px. Timing-cache keys include padding. More context costs work/memory and is not a universal perceptual improvement claim.

Official 2x, general/WDN interpolation, Natural/GAN interpolation, SwinIR, TTA and local sharpening/blending alternatives were evaluated on a bounded host corpus. Metrics did not establish a sufficiently general advantage to replace production weights or finishers. Representative faces/fur/severe-damage holdout and independent blind quality review remain unavailable. Existing behavior is retained where evidence is insufficient.

TinySR's pinned reference source combines a pruned SD3 transformer, a separate VAE, LoRA and cached tensors. Its complete checkpoint redistribution terms and a complete Android/ncnn export were not established; export/inference and mobile measurements were not performed. No Recreate control or cloud fallback is included.

Primary references: [Real-ESRGAN models](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/model_zoo.md), [official tiling](https://github.com/xinntao/Real-ESRGAN/blob/master/realesrgan/utils.py), [denoising interpolation](https://github.com/xinntao/Real-ESRGAN/blob/master/inference_realesrgan.py), [SwinIR](https://github.com/JingyunLiang/SwinIR), [TinySR pinned source](https://github.com/Microtreei/TinySR/tree/880144a7614ffae4c10a5db96af6abfd4cd60a08). The landscape fixture attribution is retained in [PHOTO-LICENSE](../../tests/fixtures/PHOTO-LICENSE.md).

## Classifier coverage repair

Feature extraction, private vote accumulation and final selection have separate testable responsibilities. Existing thresholds and public behavior remain. Grid validation rejects invalid period/cross/length inputs before indexing or division; valid phases have positive boundary/interior counts by construction. No coverage-ignore annotations were introduced.

The original public image cases remain, supplemented by feature/vote/grid boundary cases, allocation failure and unavailable-profile checks. A frozen pre-refactor corpus checks 60 base results and 3840 availability combinations, including alpha and padded row strides. The baseline source commit/hash and golden checksum are recorded in the tracked regression test. All cases pass AddressSanitizer and UndefinedBehaviorSanitizer.

## Host evidence and remaining limits

- JavaScript: 186 tests,100% statements/branches/functions/lines.
- Kotlin: 126 host JVM/Robolectric tests, 1167/1167 lines and 1272/1272 branches, with source presence.
- Shared engine/raster and inference/raster JNI: 271/271 lines and 386/386 branches.
- Recommendation classifier: 227/227 lines,266/266 branches,15/15 functions and 302/302 regions. Its denominator increased from 220 lines/262 branches. Existing strict checks remain unchanged.
- Recommendation JNI: 57/57 lines and 34/34 branches. The complete owned C++ source-presence gate passes.
- The earlier quality implementation compiled Android Debug native/Kotlin and unsigned generic-device iOS Release. The subsequent classifier refactor and version metadata update are not covered by that historical platform-build receipt. Current release APK evidence is recorded separately.

Xiaomi, every emulator/simulator and all device execution are excluded by the owner. New iOS Objective-C++ runtime/source coverage is NOT RUN. Host checks do not establish device memory, smoothness, battery, OS interruption behavior, recommendation accuracy or a full accessibility/RTL/theme/font/locale matrix. Main-only CI remains unchanged; the candidate stays in a task PR while required acceptance is open. No historical receipt is relabeled as current.
