# Design and screen states

0.8.0 status: the visual direction is implemented in React Native components; final physical UI acceptance remains incomplete. No separately approved Figma design is established here. The [primary PRD](../PRD.md) defines behavior/limits; [workflow PRD](../product/prd.md) traces 0.8 changes.

## Visual system

- Themes: system, light and dark. Shared color roles are in `src/ui/theme.tsx`; surfaces and text have separate tokens, with accent color reserved for actions and current selections. Dark base surface: `#09090B`, card: `#18181B`, primary text: `#FAFAFA`, accent: `#7C3AED`; light theme defines its own values.
- Text uses the system font. Screen styles share `createStyles` with an RTL parameter. Action and selection components have accessible names and large touch targets, with a minimum guideline of 48 dp.
- Backgrounds and cards use simple surfaces, borders and moderate rounding. No WebView, video, heavy shaders or decorative animation.
- React Navigation disables transitions when system Reduce Motion is enabled. Expanding elements use opacity/transform and `ReduceMotion.System`.

## Routes and key states

`AppNavigation` waits for settings loading, then opens Home on every launch. The first-install language is `system`; a saved manual choice remains available through Settings. Main routes: `Home`, `Settings`, `Feedback`.

Main flow: choose an original, configure mode/scale, confirm large-copy preparation when needed, process, compare and export. The original is never overwritten. Mode recommendation is a local suggestion requiring explicit user action; it never changes the selection automatically.

| State | Display and behavior |
|---|---|
| Settings loading | Centered indicator before navigation appears. |
| Empty Home | Brief invitation to choose an image; system picker opens only on user action. Canceling selection is not an error. |
| Selected image | Aspect-preserving preview with mode and 2×/4× choices. Large-source reduction requires a separate confirmation with dimensions before processing. |
| Processing | Current work, actual progress/time and cancellation. Android reports long work through a notification; iOS explains possible interruption and manual retry. |
| Result | Before/after comparison, dimensions, time and export/share actions. Saving an existing format again does not create another export of the same result. |
| Error | Clear localized text; failed save/submission preserves user-entered content for retry. |
| Settings and support | Language, theme, format, working-file limit, permissions/diagnostics and contact form. Reply address is optional. |

These states describe the implemented UI, not physical verification of every transition. Detailed product rules remain in the primary PRD.

## Responsive layout and accessibility

`src/ui/layout.tsx` computes available space from safe areas and native window/hinge data. Narrow windows use one column; two columns require width ≥720 dp and font scale <1.5. Large text remains scrollable. RTL changes row/navigation direction while dimensions and numbers stay LTR.

There is no first-launch language selection route. Returning to system language in Settings uses the current system locale; manual selection applies immediately. The registry contains 34 locales and legacy `pt` migration to `pt-BR`. Arabic, Persian, Urdu and Hebrew are RTL. Translation status/limitations are recorded in the [locale registry](../product/locales.json) and private verification evidence.

Picker, help, dialogs and actions must work without mandatory dragging and have accessible names. Comparison has Before/After/Compare buttons. 200% fonts, TalkBack/VoiceOver, real hinges and a complete tablet matrix require separate acceptance; responsive code alone does not prove them.

## Icon and motion

Brand sources are in `assets/brand/`; export formats and preview results are verified only by corresponding build/store handoff evidence, not this description. Avoid animations competing with long-running AI progress. Respect reduced motion and retain meaning without animation.


## Product introduction — approved 2026-10-22

The new `Onboarding` route uses existing system typography, neutral surfaces, purple action accents and restrained cyan. Scene1 assembles nine image fragments then reveals the comparison; scene2 shows photo/illustration/pixel examples; scene3 places the image in a phone frame. Reanimated transforms/opacity and local assets only; no shaders, video, WebView or new UI dependencies. Pages advance only by explicit actions. Before/Compare/After controls avoid mandatory dragging. Motion stops in background/unfocused states and becomes static under system Reduce Motion.

`onboardingVersion` and `completeOnboarding` are separate from language and notification settings. New installs start at version0; completion/skip persist version1 before navigation resets to Home. Existing saved app settings/session/update evidence bypass the intro. Settings offers replay. A never-used historical iOS installation with no durable app evidence cannot be reliably distinguished from a new installation; it receives the introduction.
