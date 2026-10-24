# Result ratings and support — 0.9 UX revision

A new successfully saved internal result may offer the dismissible Kinetik Star Rating dialog after its completion animation. No thumbs voting is used. Native persisted eligibility requires at least 300000 ms since the last actual display and excludes a previously prompted job. Export, restored-result viewing, failures and cancellation do not trigger it. A dismissed prompt consumes the same interval.

Confirmed 1–4 stars open the existing support form with a visible retained rating. Only the explicit Send action submits the message, optional reply email, rating, version, platform and idempotency ID to the existing Apps Script service. Confirmed 5 stars open the Android product listing externally; the user controls the actual store review. This selective routing was explicitly chosen by the owner after its policy risk was discussed; it is not an assertion of Google Play compliance. The neutral system review-after-export flow is removed. iOS must not invent a product listing ID.

The native result_rating_submitted event is emitted once after durable rating persistence, only with Analytics enabled. Its bounded context includes the job, model, recommendation choice, speed, scale, backend, original/AI/output dimensions, source format, alpha, duration and applicable Recreate technical parameters. It never includes image bytes, URIs, paths, filenames, EXIF, prompt text, support text or reply email. Local ratings are not replayed to Analytics after opt-in.

Support remains independent of telemetry choice and preserves size/rate/idempotency restrictions. Actual delivery must be verified separately; no real test email is sent without explicit authorization.
