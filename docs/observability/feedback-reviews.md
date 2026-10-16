# Support and neutral review requests 0.8.0

Support is independent of Analytics/Crashlytics choice. Reply email is optional: client/Apps Script accept an empty address and validate nonempty addresses at client/native/backend boundaries. Reply-To is set only for a valid nonempty address. Length/rate/daily-quota/replay/bounded-response restrictions remain. A failed service offers an explicit `mailto:` fallback. Real delivery remains pending; development must not send a test email without authorization.

After successful export, native eligibility checks cooldown/display limits. At an eligible successful moment the app requests the neutral system review flow. Ratings never filter eligibility; there are no stars, rewards or forced invitations. Play does not reveal whether its card appeared or a review was submitted. Fallback when the native request cannot start remains unverified.

TEST-804 includes cold start, upgrade from legacy `noticeSeen`, separate permission/revocation, independent Remote Config, offline behavior and a successful action for review. Firebase delivery and the system review flow require platform QA.
