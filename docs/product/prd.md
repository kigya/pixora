# Workflow PRD 0.8.0

Primary behavior source: [PRD](../PRD.md). This document records approved changes and traceability.

| ID | Requirement and basis | Acceptance |
|---|---|---|
| FEAT-001 | Existing import → offline AI → comparison → export; docs/PRD.md | Android and iOS regression matrix |
| FEAT-801 | Local heuristic suggestion: photo→lite/quality, illustration→art/quality, pixel grid→pixel, uncertainty→lite. Explicit request on 2026-10-16; usefulness is a hypothesis | TEST-801: types, ambiguity, availability, failures and races; explicit Apply only, no automatic change |
| FEAT-802 | Explain preparation using actual dimensions, memory/time, unchanged original and possible detail loss. Explicit request | TEST-802: aspect ratios, 2x/4x, Fast and cancellation |
| FEAT-803 | Full iOS port of existing capabilities, ncnn CPU and limited background execution. Explicit owner choice | TEST-803: real inference/export/cancellation; unsigned Release |
| FEAT-804 | Analytics/Crashlytics default to enabled with a notice and independent switches under the 2026-10-16 manual-review clarification; neutral review, optional email and R8 off. Explicit workflow decision supersedes previous choices | TEST-804: cold start/upgrade/revoke/offline/RC/review |
| FEAT-805 | Initial language selection, native locale sync, retain existing languages plus pa/jv/gu/he, pt→pt-BR. Approved workflow requirement without language removal | TEST-805: 34 schemas, system/RTL/large text/restoration |
| FEAT-806 | Public GitHub, task PR→release/0.8.0→one main merge; main-only CI. Explicit request | TEST-806: PR history, current-main CI, privacy/security |

FEAT-801 hypothesis: edge/texture/grid features can suggest a useful mode. Validate with an authorized labeled corpus and false Pixel Art checks; fallback is lite without claiming a recognized type. Technical PASS does not prove market demand. New models and cloud classification are excluded.

Owner clarification after manual review on 2026-10-16: Apply hides suggestions for the current image; Feedback uses centered headers matching Privacy/Licenses and no duplicate Having Issues button. Android 12+ system startup animates the logo. Further testing was explicitly paused; the next acceptance point is owner review of the installed release-mode build. See ADR-808–812.

Manual-review clarification on 2026-10-16: splash stays until initial data/navigation is ready and for at least 1500 ms, using max(loading, 1.5 s) without adding the two times. Brand animation also lasts 1500 ms. This is an explicit owner requirement and shared private lesson. The owner accepted other installed-release changes and requested continuation of the GitHub workflow. A repeated runtime app check was not requested.
