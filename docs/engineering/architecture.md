# Architecture

Existing baseline: Bare RN 0.87.1 / React 19 / TypeScript / Hermes; Android Kotlin TurboModule + foreground service + JNI/C++/ncnn. Full-resolution images never enter JS. Weights are bundled; sources and SHA-256 values are preserved.

0.8.0: shared C++ primitives and recommendation policy; Objective-C++ iOS TurboModule, ncnn CPU and limited background execution. JS receives small typed snapshots/URIs and a suggestion. Independent Analytics/Crashlytics settings apply at native startup, separately from Remote Config. The latest owner decision enables fresh/unresolved legacy defaults with a notice; explicit saved values are preserved. Shared native/engine serves Android JNI and iOS CPU; processing stays local.

Sources: the primary PRD and approved owner plan; interface details are recorded with implementation.
