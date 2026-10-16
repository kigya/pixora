# Implementation design

Reviewed on 2026-10-07 using public pages only. Interface code, SVG icons and decorative cards were written for React Native; no third-party TSX, graphics or web runtime was imported.

| Free reference | Applied pattern |
|---|---|
| [21st.dev](https://21st.dev/) | Accent card, soft decorative gradient and prominent primary action |
| [shadcn Button](https://ui.shadcn.com/docs/components/base/button) | Primary/secondary hierarchy and disabled states |
| [Aceternity Compare](https://ui.aceternity.com/components/compare) | Two images sharing bounds with a draggable divider |
| [Origin → coss ui](https://coss.com/ui) | Simple grouped settings and segmented choices |

Comparison includes accessible Before / Compare / After buttons, so dragging is optional. Uses View/Text/Pressable/Image/PanResponder/SVG without DOM or WebView. One stack replaces a desktop sidebar. PRD tokens: dark background, purple actions, decorative cyan only; minimum 48 dp targets and scalable system text. A static gradient does not compete with inference.

Private Mobbin/Refero screens, paid templates and MCP access were not used or claimed as viewed. Other PRD directories are optional references, not required dependencies. Runtime licenses are available in the local app screen; visual patterns use original code.

0.2 update (2026-10-08): original Upselora: AI Photo Upscaler branding with an image/two enlargement arrows in Android vector/adaptive/monochrome assets, without copying a competitor. System/light/dark themes use src/ui/theme.tsx; custom Modal dialogs share tokens. Short Reanimated press feedback respects ReduceMotion.System. Preview/controls use two columns from 840 dp, one at large fonts, and fold-safe space. Processing optionally offers notifications. Explanations describe actual stages and free local inference.

AndroidX WindowManager 1.5.1 follows the [official release list](https://developer.android.com/jetpack/androidx/releases/window). Russian strings follow plain-language principles; the application does not claim formal ASD-STE100 compliance for Russian text.


0.3 update (2026-10-08):
- [shadcn Alert](https://ui.shadcn.com/docs/components/base/alert): icon, title, description and optional action layout. [Preline Alerts](https://preline.co/docs/components/alerts.html): neutral border and themed surface. Implemented in original React Native code without web dependencies.
- Duplicate benefit text is removed; help contains three conceptual sections and one button. A single background-information card uses a purple icon and regular text in both themes.
- Language picker: scrolling bottom sheet on phones and a centered panel up to 480 dp in wide windows. Language names use their own language; flags are decorative. Arabic text and navigation use RTL; comparison and numbers remain LTR.
- Twemoji country flags by Twitter, Inc. and contributors, maintained by jdecked, [CC BY 4.0](https://github.com/jdecked/twemoji/blob/main/LICENSE-GRAPHICS). Original SVG paths are unchanged; only display dimensions are reduced. Pinned commit and SHA-256 values are in assets/flags/manifest.json. Full license and attribution are bundled in LEGAL.txt; flags require no network.

## 0.5: context and profiles

A brief image-selection invitation replaces the AI label. Previews preserve aspect ratio without black bars. Neutral profile cards use real before/after pairs and one purpose label, following [shadcn](https://ui.shadcn.com/docs/components/radio-group) and [Preline](https://preline.co/docs/components/cards.html) hierarchy with native implementation. Feedback uses ordinary fields, a clear data disclosure, optional stars and one primary action. No Upscayl images/code were copied. Example photos: Hannes Röst, CC BY-SA 3.0; illustration/pixel art created for this project, CC0. Exact attribution is in assets/profiles/LICENSE.md and bundled LEGAL.txt.


## Pixora 0.6

Preset picker uses original symbolic SVG landscapes, line art and pixel blocks instead of demonstration outputs. No external sample images are bundled in the picker. Source links live in PRESETS.md. Processing overlay uses app purple/cyan tokens, three-second transform-only scan and static frame fallback; no third-party animation graphics or copied product code.

### Processing overlay: Android updates

Reanimated 4.7.1 uses `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` for transform/opacity. This avoids a ShadowTree layout commit on every scan frame. The decorative overlay has `pointerEvents="none"` and contains no controls; animated touch hit-testing does not apply to it. Source: [Reanimated performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/) and [feature flags](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/). The change passed the Android 11 ARM64 emulator and Xiaomi Android 15 UI tests. The scan is an explicitly bounded 80 dp SVG inside an unflattened clipped view. A three-run Lite comparison measured −0.72% median pipeline time with the animation; this is normal measurement variation, within the +5% budget.

## 0.7 — processing layout and interactive examples

[shadcn Progress](https://ui.shadcn.com/docs/components/base/progress) informs the relationship between actual value and label. Pixora uses a ring, two time cards and a separate backend badge. [Preline Stepper](https://preline.co/docs/components/stepper.html) informs the three-stage icon sequence. States come from the native pipeline; tile counts are not repeated in text.

[Aceternity Compare](https://ui.aceternity.com/components/compare) informs the example-divider layout. The implementation is original React Native/RNGH/Reanimated without web dependencies. The owner supplied the pairs; originals/hashes are recorded in `assets/presets/manifest.json`. The Processing example label does not promise the same output from a bundled model. Comparison is separate from mode selection.

The storage slider has a track, five marks, selected-value label and continuous UI gesture. Save occurs on release; snapping takes 180 ms. RTL mirrors direction and Reduce Motion follows Reanimated's system setting. The current visual-verification matrix is retained privately.
