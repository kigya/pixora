<p align="center"><img src="assets/brand/logo.svg" width="96" height="96" alt="Pixora logo"></p>

# Pixora

Make a larger copy of a photo or illustration, compare the details and save the result. Pixora runs its AI models on your device, so image processing works offline from the first launch.

Free to use. No account, ads, subscriptions, credits or paid AI service.

## From a small image to a new copy

1. Choose a photo or illustration from your device.
2. Pick a look and **2× or 4×** enlargement. A local suggestion can help you choose; applying it is always your decision.
3. Process the image, compare before and after, then save or share as **PNG, JPEG or WebP**.

Your original stays unchanged. Transparent images keep their alpha in PNG and lossless WebP. Large images show the actual preparation and output dimensions before you start. Processing can be canceled.

Eight presets cover photos, illustrations and pixel art. Seven use bundled ncnn/Real-ESRGAN models; Pixel Art uses nearest-neighbor scaling to keep pixel boundaries. AI can change small details and does not promise to recover information missing from the original.

## Your images stay on your device

Image processing does not upload photos or require a server. Images, filenames, URIs and support-message content are excluded from telemetry.

Usage analytics and error reporting use Firebase and have independent switches in Settings. They currently default to enabled with an informational notice; saved opt-outs are preserved. Remote Config separately controls mode availability. Feedback sends only the information you explicitly submit.

Read the [privacy policy](privacy/index.html) and [data-flow documentation](docs/observability/privacy.md).

## Platforms and availability

The source includes Android and iOS implementations. Android targets ARM64 phones and tablets running Android 10 or later; iOS targets 15.1 or later and uses CPU inference. Both apply a 3.5 GiB memory check. Performance depends on the device, image and preset.

Pixora 0.8.1 includes light, dark and system themes, 34 active interface languages, right-to-left layouts and scalable text. Translations have not been professionally reviewed. The iOS port has simulator tests and unsigned Release-build evidence; physical iPhone/iPad acceptance remains open. Updated Android physical-device acceptance is also deferred. This repository does not currently distribute a signed release or provide a store download.

## For developers

Built with Bare React Native 0.87.1, React 19, TypeScript, Kotlin, Objective-C++ and C++/ncnn. Use Node 22 and JDK 21.

- [Build, test and local configuration](docs/engineering/tooling.md)
- [Product requirements](docs/PRD.md) and [feature registry](docs/product/features.md)
- [Architecture](docs/ARCHITECTURE.md) and [test matrix](docs/quality/test-matrix.md)
- [Model and asset notices](docs/THIRD_PARTY_NOTICES.txt)
- [Current CI runs](https://github.com/kigya/pixora/actions/workflows/main.yml)

Models and sample assets retain their original licenses and checksums. Picker examples are supplied illustrations of a look, not verified outputs of the bundled models.
