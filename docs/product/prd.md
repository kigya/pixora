# Workflow PRD 0.8.0

Primary behavior source: [PRD](../PRD.md). This document records approved changes and traceability.

| ID | Requirement and basis | Acceptance |
|---|---|---|
| FEAT-001 | Existing import → offline AI → comparison → export; docs/PRD.md | Android and iOS regression matrix |
| FEAT-801 | Offline conservative recommendation: photo→standard, smooth photographic content→natural, consistent illustration→art, strong native-resolution pixel grid→pixel, mixed/uncertain→balanced; quality speed. Owner-approved revision on 2026-10-17 supersedes photo/uncertainty→lite. Lite remains manual or an availability fallback | TEST-801: multi-scale/patch evidence, false Pixel Art, alpha, availability, failures and races; explicit Apply only |
| FEAT-802 | Explain preparation using actual dimensions, memory/time, unchanged original and possible detail loss. Explicit request | TEST-802: aspect ratios, 2x/4x, Fast and cancellation |
| FEAT-803 | Full iOS port of existing capabilities, ncnn CPU and limited background execution. Explicit owner choice | TEST-803: real inference/export/cancellation; unsigned Release |
| FEAT-804 | Analytics/Crashlytics default to enabled with a notice and independent switches under the 2026-10-16 manual-review clarification; neutral review, optional email and R8 off. Explicit workflow decision supersedes previous choices | TEST-804: cold start/upgrade/revoke/offline/RC/review |
| FEAT-805 | Open Home on first launch with `system` language by default; keep optional manual selection in Settings, native locale sync, existing languages plus pa/jv/gu/he and pt→pt-BR. Initial language onboarding is removed by the owner's 2026-10-17 correction (ADR-818; LESSON-0006) | TEST-805: fresh-install Home/system locale, Settings override, 34 schemas, RTL/large text/restoration |
| FEAT-806 | Public GitHub, task PR→release/0.8.0→one main merge; main-only CI. Explicit request | TEST-806: PR history, current-main CI, privacy/security |

FEAT-801 hypothesis: local color/luminance distributions, flat regions, edges, texture, noise and patch agreement can suggest a useful mode. Analyze the 1024 px working-equivalent image, an area-averaged overview up to 256 px and up to five native-scale patches up to 128 px. Pixel Art requires phase-aware evidence on both axes; 8/16 px block grids remain ambiguous. Natural is a smooth-content suggestion, not face recognition or restoration. Additional sharpening is manual only. All thresholds remain uncalibrated until validation on an authorized representative corpus; no accuracy percentage or guarantee of the best model is shown. No new weights, runtime dependencies or cloud classification.

If the chosen profile is disabled, the shared native policy selects the first available of standard, balanced, natural, lite and explains the alternative; if none is available it returns no suggestion. It never substitutes illustration/nearest-neighbor for an unavailable photo mode. An unreadable/uninformative analysis uses generic balanced with the same availability policy. Manual Apply, current-image race protection and scale preservation remain.

The owner initially deferred checks and delivery, then requested and accepted a signed Android release build installed over USB and authorized publication through release/0.8.5. No additional checks are requested. Version 0.8.5/code 15 metadata is aligned without rebuilding the accepted 0.8.4 artifact. Tests are updated as scenarios, without a fresh PASS or accuracy claim. Size/performance/corpus measurement remains deferred.

Owner clarification after manual review on 2026-10-16: Apply hides suggestions for the current image; Feedback uses centered headers matching Privacy/Licenses and no duplicate Having Issues button. Android 12+ system startup animates the logo. Further testing was explicitly paused; the next acceptance point is owner review of the installed release-mode build. See ADR-808–812.

Manual-review clarification on 2026-10-16: splash stays until initial data/navigation is ready and for at least 1500 ms, using max(loading, 1.5 s) without adding the two times. Brand animation also lasts 1500 ms. This is an explicit owner requirement and shared private lesson. The owner accepted other installed-release changes and requested continuation of the GitHub workflow. A repeated runtime app check was not requested.

Acceptance clarification (ADR-814): automatic checks/fixes are authorized; repeated Samsung UI/update installation is explicitly deferred. Splash lasts max(initial loading, 1500 ms); missing fresh physical validation must remain explicit.

Corrective 0.8.1/code 11 (ADR-815) fixes only CI/lock reproducibility after failed 0.8.0 main CI; FEAT-801–806 and accepted product requirements are preserved.

## Approved privacy and release update — 2026-10-17

FEAT-807: retain the localized Privacy summary and provide an accessible, explicit-action button to open the full per-app public HTTPS policy in the external browser. A rejected browser open must show a localized error. No user content or identifiers are added to the URL. The policy reflects Android/iOS data flows and observed provider configuration. Revisit policy/store disclosures whenever SDKs, permissions, telemetry, network payloads, consent, storage, deletion or audience changes. Source: explicit owner-approved privacy and 0.8.6 release plan.

Acceptance scenarios: successful browser handoff, rejected open, offline summary availability, navigation, RTL and long localized labels. The owner explicitly chose build-only delivery: new tests, lint, coverage, E2E and device checks are not run. Version0.8.6/code16 may be built, source-published, attached to a GitHub Release and uploaded only as a Play draft; formal readiness remains unverified. Existing main-push CI remains configured.


## Approved quality and introduction update — 2026-10-22 (historical scope)

The earlier 0.9 proposal documented FEAT-901 through FEAT-904, including an Original resolution option and a research-only reconstruction mode. The owner later issued a replacement implementation plan for Pixora 0.9.0/code 18. Where the two plans conflict, the newer plan below is authoritative: Original resolution is removed from new-job UI, and reconstruction is an explicit downloadable offline mode.

## Pixora 0.9.0 implementation requirements — 2026-10-22

The owner explicitly authorized implementation, a signed local release APK, and a GitHub source PR. The owner prohibited Xiaomi, emulator, simulator and test-suite execution. Do not infer any of those checks passed.

- **FEAT-901 — introduction:** three skippable, replayable slides for Details (Golden Gate before/after), Recreate (CC0 cat demonstration), and Privacy (image remains on device). Use the Kinetik onboarding layout, horizontal paging only, no vertical scrolling, subtitles, or required interaction with demo images. Show on new installs, bypass on upgrades, and persist completion independently from language/settings. Reduce Motion, app background and navigation lifecycle behavior remain acceptance criteria.
- **FEAT-902 — example assets:** degrade only the eight supplied Before images to show contrast; preserve every After file, geometry and transparency. Preserve provenance/hashes in the manifest and exclude presentation pairs from quality evaluation.
- **FEAT-903 — prepared inputs:** all new jobs use the prepared working copy; remove Original resolution selection and its associated new-job path. Preserve existing completed results and their export/share behavior. New enhancements retain their documented prepared/Fast constraints; Recreate caps the generation canvas at 512 px on its long side, pads aspect ratio, crops padding after generation, then uses the existing upscaler for 2×/4× output. Display expected dimensions before starting. No silent input-size substitution.
- **FEAT-904 — preservation of existing models:** keep the existing model files, hashes, IDs, presets and finishers. Improvements to model behavior remain evidence-gated and are not assumed from UI or pipeline changes.
- **FEAT-905 — explicit Recreate mode:** add a separate Enhance/Recreate choice. Recreate uses `stable-diffusion.cpp`, SD 1.5 Q4_0 and LCM-LoRA, initially CPU. Download the approximately 1.88 GB model package only after an explicit action and license acceptance. Pin revisions, exact sizes, SHA-256, provenance and licenses. Download to temporary files with resume/cancel/retry; install only after integrity validation. Settings exposes model size and deletion; cache clearing must retain model, gallery, settings and active-job files.
- **FEAT-906 — local generation controls and lifecycle:** optional one-line prompt remains on device and is excluded from telemetry. Use LCM, CFG 1, strength 0.6, 4/8 steps mapped to the native fast/quality contract, and persist seed/model revision/parameters in the job. Keep one active job, native progress stages, cancellation, interrupted-job recovery and temporary-file cleanup. Check disk and memory before execution; preserve original input on failures. Keep alpha separately and strip service metadata from result output.
- **FEAT-907 — Expo/Kinetik migration:** use Expo SDK 58 / React Native 0.88.0 with Expo Router while preserving existing Android/iOS native projects, package IDs, signing identity, ncnn, foreground service, exports, settings and session compatibility. Use Node 22/JDK 21. `NativeUpscale` remains the bridge; image pixels/model weights do not cross through JS. Kinetik supplies the requested interaction patterns, including collapsed selectable model cards with independent before/after comparison.
- **FEAT-908 — launch and result motion:** preserve the 1500 ms minimum splash readiness rule; use Aurora Veil at intensity 1/speed 3 beneath the animated icon. Processing progress reflects native events, with unknown progress indeterminate. Successful native job completion opens Aperture and fires Confetti once; restored results do not replay it. Respect Reduce Motion and app foreground state.

### Verification and release boundary

Update test sources and traceability, but mark every new 0.9 test **NOT RUN**. Do not inherit prior 100% classifier coverage, historical platform test results, or earlier build evidence as proof for changed source. The specifically prohibited Xiaomi/emulator/simulator runs remain **NOT RUN**. A release APK build/signature/package inspection and GitHub PR, if completed, are separate evidence and do not establish runtime, visual, model-quality, speed, memory or device acceptance. No GitHub Release, store upload, or publication is in scope.

## Approved UX and result-rating revision — 24 October 2026

Source: explicit owner review and accepted replacement plan in this task. This supersedes earlier no-test/no-Xiaomi restrictions, photographic onboarding, nested language navigation, two-state theme plus system toggle, warning-before-start placement, and neutral review-after-export behavior. Emulators and simulators remain excluded.

- FEAT-909: logo-only Aurora launch remains visible for at least1500ms from a rendered app frame; seamless theme-matched Android starting window. Three custom drawn horizontal onboarding scenes, passive visuals, separated page indicator, reduced motion and lifecycle cancellation.
- FEAT-910: Segment Bar controls for processing kind and scale, brand-colored export selector, text-only collapsed models with independent selection/expanded comparison, one expected output size, Quality-left/Speed-right. The working preview always retains the imported image. The same-cat illustration pair is explicitly reference content, not model output.
- FEAT-911: inline searchable language selector, directly selectable System/Light/Dark adapted Theme Switch, corrected telemetry layout, functional modal gestures, disjoint real app-storage buckets and protected cache deletion.
- FEAT-912: no thumbs voting. After a new successful generation, a dismissible Pop Dialog/Star Rating may be shown at most once every300000ms, persisted across restart and tied to one job. Confirmed1–4 stars opens the existing support form and sends the selected rating with the user-written message; confirmed5 opens the product's external Google Play page. Internal stars never count as an actual store review. No neutral system In-App Review is invoked by this flow. The owner explicitly selected this selective store-routing approach after discussion of its store-policy risk; implementation is not policy approval.
- FEAT-913: opt-out-respecting result-rating analytics uses frozen job/recommendation context and bounded technical dimensions only. No images, paths, filenames, EXIF, prompt content, message text or email enter telemetry. Registration/ingestion evidence is separate from source presence.

Verification is in progress. Current-source coverage, device quality and performance require measured evidence; historical percentages do not apply. Deliver the signed APK to Downloads and Xiaomi, push/update the existing release/0.9.0 task PR; no main merge, public release, store upload, real test mail or simulator execution.
