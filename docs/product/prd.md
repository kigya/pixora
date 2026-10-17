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
