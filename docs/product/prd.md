# Workflow PRD 0.8.0

Primary behavior source: [PRD](../PRD.md). This document records approved changes and traceability.

| ID | Requirement and basis | Acceptance |
|---|---|---|
| FEAT-001 | Existing import → offline AI → comparison → export; docs/PRD.md | Android and iOS regression matrix |
| FEAT-801 | Local heuristic suggestion: photo→lite/quality, illustration→art/quality, pixel grid→pixel, uncertainty→lite. Explicit request on 2026-10-16; usefulness is a hypothesis | TEST-801: types, ambiguity, availability, failures and races; explicit Apply only, no automatic change |
| FEAT-802 | Explain preparation using actual dimensions, memory/time, unchanged original and possible detail loss. Explicit request | TEST-802: aspect ratios, 2x/4x, Fast and cancellation |
| FEAT-803 | Full iOS port of existing capabilities, ncnn CPU and limited background execution. Explicit owner choice | TEST-803: real inference/export/cancellation; unsigned Release |
| FEAT-804 | Independent Analytics/Crashlytics consent before collection; neutral review, optional email and R8 off. Explicit workflow decision supersedes previous choices | TEST-804: cold start/upgrade/revoke/offline/RC/review |
| FEAT-805 | Initial language selection, native locale sync, retain existing languages plus pa/jv/gu/he, pt→pt-BR. Approved workflow requirement without language removal | TEST-805: 34 schemas, system/RTL/large text/restoration |
| FEAT-806 | Public GitHub, task PR→release/0.8.0→one main merge; main-only CI. Explicit request | TEST-806: PR history, current-main CI, privacy/security |

FEAT-801 hypothesis: edge/texture/grid features can suggest a useful mode. Validate with an authorized labeled corpus and false Pixel Art checks; fallback is lite without claiming a recognized type. Technical PASS does not prove market demand. New models and cloud classification are excluded.
