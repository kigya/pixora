# FEAT-803 iOS port — implementation and verification

Implemented the bare React Native 0.87.1 iOS project for `dev.kigya.pixora` (`.debug` in Debug), iOS 15.1+, with Objective-C++ TurboModule implementations for the shared API: photo import, preparation, recommendations, jobs, cancellation, journal recovery, PNG/JPEG/WebP export, share/open, settings, notifications, review, legal text, and explicit feedback.

Extracted the existing Android ncnn/pixel loop into `native/engine`; Android retains JNI/OpenMP initialization and GPU behavior. iOS uses actual offline CPU inference with the same five bundled models and manifest hashes. Eight presets include nearest-neighbor Pixel Art; preparation caps remain 1024 and Fast 512. Alpha and tile assembly share the portable implementation. PHPicker input copying is bounded to 50 MiB even if provider metadata is stale.

Added checksum-pinned ncnn 20260526 iOS archives, generated XCFramework, locked CocoaPods, libwebp 1.5.0, actual registered Firebase configurations, Ruby 3.3.12/Bundler 4.0.23 and patched gems. `scripts/build-ios.sh` builds unsigned device Release; `scripts/test-ios.sh` exports actual LLVM coverage. Project changes use pinned XcodeProj. Generated SDKs, endpoint bytes, dependencies and artifacts stay ignored. Unsigned builds defer Crashlytics symbol upload.

Latest user steering supersedes the earlier opt-in requirement: effective analytics/error-report defaults are ON for new/unresolved preferences; explicit version-2 choices and opt-outs remain intact. Startup applies effective settings immediately after Firebase configure; the unacknowledged version remains unchanged until acknowledgement. Failed withdrawal disables the requested sink in process. Remote Config is independent. Telemetry allowlists exclude images, filenames, URIs, image features and feedback content. Temporary share exports older than 24 hours are removed on the next native launch; explicit cleanup removes all share exports.

Completed evidence on Xcode 26.6 (17F113), SDK/runtime 26.5, before the final requested telemetry/share changes:

- Actual simulator application and unsigned generic-device Release builds passed.
- Thirty-one native XCTest cases passed in the last entirely passing full suite. Later expansion ran 42 cases, with three assertions failing in the single simulated older-OS notification-boundary case; the corrected focused boundary test subsequently passed. Actual-model cases exercise all eight presets/five models, codecs, preparation, cancellation, recovery, and tiled/whole inference (maximum byte difference 1).
- The preserved LLVM snapshot `.p-build-app/local/ios-coverage-pending.json` includes all owned iOS implementation sources: 513/514 lines (99.81%), 760/764 branches (99.48%). It is not 100% and predates the final changes. A later focused-test export does not represent full coverage. Shared portable adapter tests passed separately.
- The final full run was stopped before results following the user's explicit instruction to stop further testing. No additional tests or Firebase signing experiment were run. Final telemetry/share changes are untested.

Limitations: unsigned simulator Firebase installation/Remote Config fetch reports Keychain -34018; server receipt/activation is unverified. No real feedback sent. Background execution is best effort: expiration interrupts and requires manual retry. No physical iOS, signing, App Store, or publication claim. Debug/Release builds must run serially because RN prebuilt Pods paths are shared. Git integration remains with the main agent.
