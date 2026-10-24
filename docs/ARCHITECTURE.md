# Pixora architecture

The current 0.9 source architecture is maintained in [docs/engineering/architecture.md](engineering/architecture.md). That document covers Expo Router and the retained native lifecycle, local enhancement and optional reconstruction, model download/integrity handling, job metadata, storage, privacy boundaries, compatibility, and verification status.

## Current stack

- Expo SDK 58, React Native 0.88, React 19.3, TypeScript, Hermes, New Architecture, Expo Router.
- Preserved Android Kotlin/JNI and iOS Objective-C++/C++ projects; platform job ownership and image pixels remain native.
- Kinetik UI components/tokens provide the onboarding, processing, comparison, model-selection, and settings motion systems.
- Existing enhancement uses bundled local ncnn models. Optional “Recreate” uses the pinned local stable-diffusion.cpp CPU pipeline after explicit model download.

## State and verification

Architecture documentation describes source intent and ownership; it is not build or runtime evidence. The owner later authorized code19 host tests and physical Xiaomi checks. Current measurements, real saved Recreate results, failed trials and remaining coverage/platform/Firebase limits are maintained in [the verification report](engineering/ux-090.md). Earlier0.8.x and code18 results remain historical; they do not establish current-source acceptance.

## Historical notes

Pixora 0.8.x was Bare React Native 0.87.1 with a React Navigation container. Original-resolution processing and its user-facing choice belonged to the approved 0.8 quality revision. They are not part of the 0.9 new-job interface. Keep older technical details only in revision-bound reports; do not treat them as current architecture or verification.
