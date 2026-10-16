# Feature registry 0.8.0

Source: [workflow PRD](prd.md) and [primary PRD](../PRD.md).

- FEAT-801: implemented; independent review and isolated unit/native checks passed; integrated Android/iOS and Samsung acceptance pending. See quality/recommendations-review.md.
- FEAT-802: implemented; dimensions, explanation and confirmation covered by isolated UI checks; integrated build and Samsung acceptance pending.
- FEAT-803: implemented in iOS task branch; unsigned Release and real-model XCTest passed; integration and strict coverage pending.
- FEAT-804: implemented via PR4/7; consent, neutral review, optional-email/platform backend and unit tests reviewed; installed-app delivery/Firebase QA pending.
- FEAT-805: implemented via PR4;34-locale schema and first-language unit checks passed; Samsung English/default-off smoke passed, fullRTL/large-text QA pending.
- FEAT-806: task PR1–7 merged into release/0.8.0; main-only workflow implemented; final acceptance/one main merge/current-main CI pending.

Manual review on 2026-10-16 changed FEAT-801/804: Apply hides the card; Analytics/Error Reports default ON with a notice while preserving explicit opt-outs. Feedback navigation now matches Privacy/Licenses; Android 12+ animated splash was added. The owner paused further tests and accepts the final release APK manually. Earlier results precede and do not verify these changes.
