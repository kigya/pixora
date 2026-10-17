# Privacy and consent 0.8.0

Status: behavior is being implemented; legal/store disclosure review remains pending.

- AI inference, original images, results, URIs, filenames and working paths stay on the device. They are not sent to Firebase or the support form.
- Android applies independent saved Analytics/Crashlytics switches before Firebase initialization; iOS applies effective values at native startup. Under the owner's 2026-10-16 decision, no explicit choice means both ON with an informational notice. Explicit saved opt-outs remain OFF; declining Crashlytics deletes unsent reports.
- Analytics and Crashlytics switches are independent. Both default to enabled with an informational notice; explicit saved choices take precedence. Disabling a switch stops future collection by its SDK; Remote Config works independently.
- Firebase receives only allowlisted product events and crash reports under independent collection settings. Code does not add images, URIs, filenames, email, form text, a persistent user ID or an advertising ID to telemetry. Crashlytics deletes unsent reports when disabled.
- Support sends only text, an optional reply address, app version, normalized platform (`android`/`ios`) and a random request ID. Legacy requests without `platform` default to Android; Apps Script includes platform/version in email. The protocol retains `rating=0` for compatibility; the application does not collect a personal rating. Submission is independent of telemetry consent. If the endpoint is unavailable, an explicit email-app action is offered; content leaves the device only after user submission.
- The form retains its original size, rate, daily-quota and idempotency policy. Apps Script sends to a fixed recipient and sets Reply-To only when a valid address is provided.

Public privacy-policy and Google Play Data Safety/Apple privacy-disclosure checks are incomplete. Do not claim legal review passed.

2026-10-16 clarification: the owner explicitly enabled Analytics/Crashlytics by default with an informational notice. Independent switches and saved opt-outs remain. This supersedes previous opt-in descriptions for current 0.8 implementation. Inference/images stay local. Automatic verification is authorized; new Samsung installation/UI checks are deferred.

## 0.8.6 policy review — 2026-10-17

Canonical public policy: https://kigya.github.io/pixora/privacy/ (GitHub Pages, gh-pages). The in-app full-policy button uses this fixed URL only on explicit action; browser rejection is handled. Local summary remains available offline. No extra telemetry event or data is introduced by the link.

Live Analytics property pixora-1dc08: event retention2months, user retention14months, reset on activity enabled. Account Google products/services sharing disabled; aggregated/de-identified modelling contributions, technical support access and account business recommendations enabled. No provider setting was changed. The UI states Data Processing Terms have not been accepted; applicability and agreement remain an owner/legal decision, not a completed compliance gate.

Policy now covers both implemented platforms, independent collection controls and Remote Config, optional support payloads, actual observed retention and GitHub Pages visitor-IP security logging. Full backend deletion, linked-product account auditing and applicable regional consent/legal compliance remain unverified. No test messages, crashes or device scenarios were executed.
