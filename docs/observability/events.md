# Event matrix

Status: Android/iOS have native event/parameter allowlists. These are transmission filters, not delivery evidence. Actual product metrics/counting limits are in [metrics.md](../product/metrics.md). Only names/data already implemented in 0.8 are recorded below; no events or parameters are added here.

## General rules

- Analytics and Crashlytics are requested independently and default to disabled. Analytics events require saved explicit version-2 consent with analytics enabled. The old `noticeSeen` flag records notice display only, not consent.
- Remote Config is independent of diagnostic consent and can apply local defaults/cache or fetch configuration separately. `remote_config_updated` is an Analytics event and still requires Analytics opt-in.
- Android disables Firebase automatic screen reporting and advertising-ID collection in the manifest. iOS Info.plist disables automatic screen reporting. JS emits manual `screen_view`/`screen_engagement` only for focused Home/Settings/Feedback screens; duration includes active foreground intervals only.
- The matrix describes custom events from app producers. Firebase SDKs may collect their own app/lifecycle signals after consent; verify the full outbound stream and SDK automatic collection through Firebase configuration and ingestion evidence, rather than inferring it solely from the `Telemetry.event` allowlist.
- Android `Telemetry.kt` and the iOS native boundary filter event names and allowed keys. Strings have length and character restrictions; numbers must be finite. This is a global field allowlist rather than a separate per-event schema validator.
- Never transmit images, preview/source URIs, filenames, working paths, feedback text, reply addresses, crash breadcrumbs containing user content or persistent user identifiers. `attempt_token` is context for a single processing attempt linking its terminal event, not a user account/profile.
- Do not use Firebase automatic signals to expand product telemetry without separate approval and disclosure review.

## Android allowlist and producer matrix

| Event name | Current producer parameters | Trigger / question | Consent / TEST-ID |
|---|---|---|---|
| `screen_view` | `screen_name`, `screen_class`, short allowed context | Focused screen opened/returned active; which screens are opened? | Analytics opt-in; `useTrackedScreen`; FEAT/TEST-804. |
| `screen_engagement` | `screen_name`, `engagement_ms`, allowed context | Screen left/deactivated; how much foreground time? | Analytics opt-in; blur/background/unmount; FEAT/TEST-804. |
| `ui_action` | `action` | Help/settings/privacy/licenses/cleanup codes; which auxiliary actions are used? | Analytics opt-in; native allowlist + UI tests; TEST-804. |
| `image_import_started` | `source` | Native picker invoked; import started? | Analytics opt-in; native telemetry tests; TEST-804. |
| `image_import_finished` | `source`, `status`, optional `error_code` | Picker completed: success/cancelled/error; does import work? | Analytics opt-in; native tests; TEST-804. May be absent after process/OEM termination. |
| `profile_picker_opened` | `profile_id` | Preset list opened; which modes are considered? | Analytics opt-in; UI producer/Jest; TEST-801. |
| `profile_preview_interacted` | `profile_id`, `action` | Mode-example interaction; which previews are viewed? | Analytics opt-in; UI producer/Jest; TEST-801. |
| `profile_selected` | `profile_id`, `previous_profile` | Explicit preset selection; how are choices distributed? | Analytics opt-in; TEST-801; no inference about recommendations/quality. |
| `processing_options_changed` | `profile_id`, `speed`, `scale` and UI context when available | Processing options changed; which choices are used? | Analytics opt-in; allowed fields; TEST-801/802. |
| `preparation_decision` | `profile_id`, `scale`, `status` (`confirmed`/`declined`) | Large-copy preparation confirmed/declined; is the dialog needed? | Analytics opt-in; TEST-802; separate from recommendation. |
| `job_started` | `attempt_token`, `profile_id`, `speed`, `scale`, `backend`, `size_bucket`, `model_version`, `phase` | Explicit native processing started | Analytics opt-in; `jobContext`, native tests; TEST-804. |
| `job_backend_changed` | Job context, `previous_backend`, `error_code` | Android GPU fallback to CPU | Analytics opt-in; Android only. |
| `job_finished` | Job context, `status`, `duration_ms`, `error_code` | Terminal success/error/cancelled/interrupted/time_limit state | Analytics opt-in; once per `attempt_token`, native tests; TEST-804. |
| `result_viewed` | Completed-job context | Result displayed; how many jobs reach a result? | Analytics opt-in; JS Home producer/Jest. |
| `comparison_used` | Job context, `action` (`before`/`after`/`compare`/`divider`) | User compared the result | Analytics opt-in; UI producer/Jest. |
| `export_finished` | Job context, `format`, `status`, optional `error_code` | Export completed or already saved | Analytics opt-in; native tests. |
| `share_opened` | Job context, `format`, `status` | System share sheet opened successfully | Analytics opt-in; native tests. |
| `review_prompt_requested` | Job context | Native Play review flow requested after an eligible successful action | Analytics opt-in; does not prove Play displayed a prompt. |
| `review_rating_selected` | Android allowlist includes `rating` | Historical name/key retained for compatibility | Not the current UI flow: no stars are requested or used to filter system reviews. |
| `review_submitted`, `review_dismissed`, `play_redirect_finished` | Technical status/route only when emitted by a producer | Possible review-transition outcome | Allowlist presence does not mean Play exposes actual review submission. |
| `feedback_opened` | Allowed screen/context | Support form opened | Analytics opt-in; no email/message. |
| `feedback_send_finished` | `status` (`success`/`error`), safe context | Form submission finished | Analytics opt-in; text, reply email and request ID excluded. |
| `settings_changed` | `setting`, `value` | Language/theme/format/cache-limit/telemetry selection changed | Analytics opt-in; short allowlisted values, never user identity. |
| `remote_config_updated` | `source`, `status`, `enabled_count` | Availability snapshot applied/updated | Fetch/apply requires no consent; emitting this event requires Analytics opt-in. |

Global Android field allowlist: `screen_name`, `screen_class`, `action`, `source`, `status`, `profile_id`, `previous_profile`, `speed`, `scale`, `backend`, `previous_backend`, `size_bucket`, `model_version`, `phase`, `error_code`, `attempt_token`, `format`, `rating`, `route`, `setting`, `value`, `duration_ms`, `engagement_ms`, `enabled_count`. A field appears only if the specific producer also emits it.

## Platform parity and evidence

The iOS native allowlist in `PixoraUpscale.mm` currently differs: it excludes `job_backend_changed`, `review_prompt_requested`, `review_rating_selected`, `play_redirect_finished`, `previous_backend` and `rating`. Review-request and Android GPU-fallback reporting therefore differ by platform. Update parity only with a product decision and tests; never fill gaps by adding events automatically.

Code checks: `android/app/src/test/java/dev/kigya/pixora/TelemetryTest.kt` and JS Jest suites. They verify local boundaries/producers, not Firebase delivery. Real DebugView/ingestion, consent upgrade/revocation and Crashlytics runtime require current build/device evidence; another release's historical QA does not verify 0.8.
