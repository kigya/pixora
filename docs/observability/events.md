# Event matrix

Status: Android/iOS have native event/parameter allowlists. These are transmission filters, not delivery evidence. Actual product metrics/counting limits are in [metrics.md](../product/metrics.md). The matrix includes the approved 0.9 result-rating revision; allowlists alone do not prove delivery.

## General rules

- Analytics and Crashlytics have independent saved switches and default to enabled under the approved 2026-10-16 decision. Explicit saved opt-outs remain effective. The `noticeSeen` flag records notice display only.
- Remote Config is independent of diagnostic consent and can apply local defaults/cache or fetch configuration separately. `remote_config_updated` is an Analytics event and still requires Analytics enabled.
- Android disables Firebase automatic screen reporting and advertising-ID collection in the manifest. iOS Info.plist disables automatic screen reporting. JS emits manual `screen_view`/`screen_engagement` only for focused Home/Settings/Feedback screens; duration includes active foreground intervals only.
- The matrix describes custom events from app producers. Firebase SDKs may collect their own app/lifecycle signals after consent; verify the full outbound stream and SDK automatic collection through Firebase configuration and ingestion evidence, rather than inferring it solely from the `Telemetry.event` allowlist.
- Android `Telemetry.kt` and the iOS native boundary filter event names and allowed keys. Strings have length and character restrictions; numbers must be finite. This is a global field allowlist rather than a separate per-event schema validator.
- Never transmit images, preview/source URIs, filenames, working paths, feedback text, reply addresses, crash breadcrumbs containing user content or persistent user identifiers. `attempt_token` is context for a single processing attempt linking its terminal event, not a user account/profile.
- Do not use Firebase automatic signals to expand product telemetry without separate approval and disclosure review.

## Android allowlist and producer matrix

| Event name | Current producer parameters | Trigger / question | Consent / TEST-ID |
|---|---|---|---|
| `screen_view` | `screen_name`, `screen_class`, short allowed context | Focused screen opened/returned active; which screens are opened? | Analytics enabled; `useTrackedScreen`; FEAT/TEST-804. |
| `screen_engagement` | `screen_name`, `engagement_ms`, allowed context | Screen left/deactivated; how much foreground time? | Analytics enabled; blur/background/unmount; FEAT/TEST-804. |
| `ui_action` | `action` | Help/settings/privacy/licenses/cleanup codes; which auxiliary actions are used? | Analytics enabled; native allowlist + UI tests; TEST-804. |
| `image_import_started` | `source` | Native picker invoked; import started? | Analytics enabled; native telemetry tests; TEST-804. |
| `image_import_finished` | `source`, `status`, optional `error_code` | Picker completed: success/cancelled/error; does import work? | Analytics enabled; native tests; TEST-804. May be absent after process/OEM termination. |
| `profile_picker_opened` | `profile_id` | Preset list opened; which modes are considered? | Analytics enabled; UI producer/Jest; TEST-801. |
| `profile_preview_interacted` | `profile_id`, `action` | Mode-example interaction; which previews are viewed? | Analytics enabled; UI producer/Jest; TEST-801. |
| `profile_selected` | `profile_id`, `previous_profile` | Explicit preset selection; how are choices distributed? | Analytics enabled; TEST-801; no inference about recommendations/quality. |
| `processing_options_changed` | `profile_id`, `speed`, `scale` and UI context when available | Processing options changed; which choices are used? | Analytics enabled; allowed fields; TEST-801/802. |
| `preparation_decision` | `profile_id`, `scale`, `status` (`confirmed`/`declined`) | Large-copy preparation confirmed/declined; is the dialog needed? | Analytics enabled; TEST-802; separate from recommendation. |
| `job_started` | `attempt_token`, `profile_id`, `speed`, `scale`, `backend`, `size_bucket`, `model_version`, `phase` | Explicit native processing started | Analytics enabled; `jobContext`, native tests; TEST-804. |
| `job_backend_changed` | Job context, `previous_backend`, `error_code` | Android GPU fallback to CPU | Analytics enabled; Android only. |
| `job_finished` | Job context, `status`, `duration_ms`, `error_code` | Terminal success/error/cancelled/interrupted/time_limit state | Analytics enabled; once per `attempt_token`, native tests; TEST-804. |
| `result_viewed` | Completed-job context | Result displayed; how many jobs reach a result? | Analytics enabled; JS Home producer/Jest. |
| `comparison_used` | Job context, `action` (`before`/`after`/`compare`/`divider`) | User compared the result | Analytics enabled; UI producer/Jest. |
| `export_finished` | Job context, `format`, `status`, optional `error_code` | Export completed or already saved | Analytics enabled; native tests. |
| `share_opened` | Job context, `format`, `status` | System share sheet opened successfully | Analytics enabled; native tests. |
| `review_prompt_requested` | Job context | Custom result-rating dialog actually displayed after a newly successful result and the five-minute native gate | Analytics enabled; does not prove Play displayed a prompt. |
| `review_rating_selected` | Android allowlist includes `rating` | Historical name/key retained for compatibility | Legacy compatibility name; the current producer is `result_rating_submitted`. |
| `review_submitted`, `review_dismissed`, `play_redirect_finished` | Technical status/route only when emitted by a producer | Possible review-transition outcome | Allowlist presence does not mean Play exposes actual review submission. |
| `feedback_opened` | Allowed screen/context | Support form opened | Analytics enabled; no email/message. |
| `feedback_send_finished` | `status` (`success`/`error`), safe context | Form submission finished | Analytics enabled; text, reply email and request ID excluded. |
| `settings_changed` | `setting`, `value` | Language/theme/format/cache-limit/telemetry selection changed | Analytics enabled; short allowlisted values, never user identity. |
| `remote_config_updated` | `source`, `status`, `enabled_count` | Availability snapshot applied/updated | Fetch/apply requires no consent; emitting this event requires Analytics enabled. |

Global Android field allowlist: `screen_name`, `screen_class`, `action`, `source`, `status`, `profile_id`, `previous_profile`, `speed`, `scale`, `backend`, `previous_backend`, `size_bucket`, `model_version`, `phase`, `error_code`, `attempt_token`, `format`, `rating`, `route`, `setting`, `value`, `duration_ms`, `engagement_ms`, `enabled_count`. A field appears only if the specific producer also emits it.

## Platform parity and evidence

The native implementations now include the approved rating fields and immutable recommendation context. Android opens the fixed Google Play page through its explicit Play package, with an HTTPS fallback; iOS opens that same fixed HTTPS page. No App Store identifier is invented. Android GPU fallback remains platform-specific. Current iOS compilation/runtime acceptance is blocked by the missing local iOS SDK, so source parity is not runtime proof.

Code checks: `android/app/src/test/java/dev/kigya/pixora/TelemetryTest.kt` and JS Jest suites. They verify local boundaries/producers, not Firebase delivery. Real DebugView/ingestion, consent upgrade/revocation and Crashlytics runtime require current build/device evidence; another release's historical QA does not verify 0.8.

## 0.9 result-rating revision

The owner-approved five-minute star flow supersedes the older neutral-review descriptions above. New `result_rating_submitted` is produced natively once after a durable 1–5 rating is saved. `review_prompt_requested` means the custom dialog was actually displayed; `review_dismissed` means it was closed. `play_redirect_finished` reports only external intent handling, never review publication. Feedback events retain source `settings` or `result_rating`.

The per-rating allowlist uses at most 25 parameters, including the stars, attempt token, processing kind, actual model/version, immutable recommendation context, speed, scale, backend, original/AI/output dimensions, format, alpha and duration, plus applicable recreation revision/steps/CFG/strength/description-presence. Native validation and existing Analytics opt-outs apply. Images, paths, prompt/comment/email content remain prohibited. Current ingestion and custom-definition registration are blocked because Firebase Console requires renewed authentication. Local unit tests verify filtering and opt-outs; they do not verify Firebase delivery.
