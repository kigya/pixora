# Privacy and consent 0.8.0

Status: behavior is being implemented; legal/store disclosure review remains pending.

- AI inference, original images, results, URIs, filenames and working paths stay on the device. They are not sent to Firebase or the support form.
- Android removes `FirebaseInitProvider` and reconciles the local choice with known Analytics/Crashlytics SDK switches before `FirebaseApp.initializeApp`. For an old consent version these switches are cleared, leaving disabled manifest defaults effective. The SDK initializes the Crashlytics component with FirebaseApp, but collection is disabled first; on opt-out the SDK also deletes unsent reports. The old `noticeSeen` flag records a previous notice only and does not enable collection. Persisted reports require upgrade/runtime verification.
- Analytics and Crashlytics consent is independent and both initially default to disabled. A choice is shown before either collector is enabled. Revoking a switch stops future SDK collection; Remote Config works independently and requires no diagnostic consent.
- Firebase receives only allowlisted product events and crash reports under separate consent. Code does not add images, URIs, filenames, email, form text, a persistent user ID or an advertising ID to telemetry. Crashlytics deletes unsent reports when disabled.
- Support sends only text, an optional reply address, app version and a random request ID. The protocol retains `rating=0` for compatibility; the application does not collect a personal rating. Submission is independent of telemetry consent. If the endpoint is unavailable, an explicit email-app action is offered; content leaves the device only after user submission.
- The form retains its original size, rate, daily-quota and idempotency policy. Apps Script sends to a fixed recipient and sets Reply-To only when a valid address is provided.

Public privacy-policy and Google Play Data Safety/Apple privacy-disclosure checks are incomplete. Do not claim legal review passed.
