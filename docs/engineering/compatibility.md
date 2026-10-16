# Compatibility and platforms

0.8.0 status: sources/build configurations exist on both platforms; final release acceptance continues. The current checkout establishes RN/Android minimums; iOS deployment target comes from its implementation project. No declared minimum alone proves physical-device compatibility.

## Pinned build targets

| Platform | Minimum / target | Technical basis | Verification status |
|---|---|---|---|
| Android | `minSdkVersion 29` (Android 10); compile/target SDK 36; ABI `arm64-v8a`; native total-RAM check ≥3.5 GiB (approximately the 4 GB device class) | `android/build.gradle`, `android/app/build.gradle`, `UpscaleModule.kt`. Debug/release version 0.8.0, code 10. Release R8/minification and resource shrinking disabled under the 0.8 decision. | Physical acceptance targets Samsung SM-S916B, Android 16/API 36. The application is installed, but local device evidence records UI checks awaiting unlock; debug/release gates remain pending. |
| iOS | Deployment target 15.1; app additionally requires physical RAM ≥3.5 GiB. CPU inference. | `ios/Pixora.xcodeproj` sets `IPHONEOS_DEPLOYMENT_TARGET = 15.1`; `PixoraUpscale.mm` checks `NSProcessInfo.physicalMemory` and uses CPU. | Physical iPhone/iPad validation is unconfirmed. Project/simulator/compiler checks do not prove sustained inference, export or background behavior on hardware. |

Android minimum OS comes from `minSdkVersion`; a separate app gate requires 64-bit ARM and sufficient memory. The iOS target defines minimum OS; the explicit runtime memory gate uses 3.5 GiB without a separate model/ARM-ABI check in this code. The memory threshold is an engineering safeguard, not a universal compatibility/performance promise.

## Shared stack

- Bare React Native 0.87.1, React 19.2.3, TypeScript 6.x and Hermes; Node.js 22.11 or newer and JDK 21 for the pinned Android toolchain.
- Android: compile/target SDK 36, NDK 27.1.12297006, CMake 3.22.1, Kotlin native module, JNI/C++ and ncnn. Weights are bundled locally; inference does not send images over the network.
- iOS: Objective-C++ native module, shared C++/ncnn assets and CPU inference. Native background work is bounded by iOS background execution; expiration interrupts the current job and the UI allows processing to restart.
- Shared dependencies include React Navigation 7, Reanimated 4, Gesture Handler 3, Safe Area Context, Screens and SVG. Do not add Expo or web-only substitutes.

## OS behavior differences

| Capability | Android | iOS |
|---|---|---|
| Image selection | System photo/document picker, one file copied to internal working storage | `PHPickerViewController`, one file copied to private app storage |
| Long processing | Foreground service: media processing on API 35+, data sync on earlier APIs; progress/cancel notification | Bounded background task; expiration interrupts processing for manual restart; completion notification is not an ongoing progress/cancel service |
| Locale selection | Manual choice stored separately; `system` uses system language | Native iOS locale sync applies the chosen language or restores system language preferences |
| Diagnostics | Independent Analytics/Crashlytics opt-ins, disabled by default; SDK preferences reconciled before FirebaseApp init; Remote Config separate | Independent Analytics/Crashlytics switches; remote config is not diagnostic consent |

Image/format/memory requirements are in the [primary PRD](../PRD.md). UI errors use platform-neutral strings; actual OS/memory requirements are documented above rather than encoded as Android-only text.

## Verified behavior and remaining unknowns

- Automatic checks and source coverage do not replace a physical device. The current physical gate uses Samsung SM-S916B, replacing Xiaomi by owner instruction; actual debug and separate release-install scenarios each require their own evidence.
- Physical iPhone/iPad, real-system iOS background expiration, thermal behavior over prolonged runs, all Android APIs 29–35, OEM battery controls, a real foldable/hinge and full tablet landscape remain unverified.
- The iOS 15.1 build target is the project's declared deployment minimum, not a test result on iOS 15.1 hardware. The RAM threshold also requires actual runtime/device validation.
- Android 16/API 36 is the target Samsung acceptance environment, not proof of coverage for all API 36 devices. Do not extrapolate benchmarks or a successful build to untested devices.

The primary integrator maintains actual execution status/blockers in private device evidence; this document does not change acceptance results.
