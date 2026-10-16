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
