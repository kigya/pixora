# Product and technical metrics

0.8.0 status: metrics below derive from existing Android/iOS native allowlists and current producers. They define aggregation after Analytics consent, not measured results. Values, targets, demand and revenue have not been measured here.

## Collection and data restrictions

- Analytics and Crashlytics are independent optional switches, both disabled until a current version-2 consent choice. Analytics events require Analytics to be enabled. Declining Crashlytics does not toggle Analytics.
- Remote Config remains independent of diagnostic consent: local defaults/cache and fetching work separately. When sent to Analytics, `remote_config_updated` follows Analytics consent and is not a prerequisite for Remote Config.
- The native telemetry boundary accepts only current allowlisted event names and shared allowlisted fields, retaining only finite numbers or short strings with restricted characters. Images, image URIs, file/path, filenames, email, support messages and image content are not allowed parameters. Android retains `rating` for compatibility, but the interface does not request a personal star rating.
- Android and iOS allowlists differ. The current iOS source lacks `job_backend_changed`, `review_prompt_requested`, `review_rating_selected`, `play_redirect_finished`, `previous_backend` and `rating`. Check actual native-boundary schemas before comparing platforms; a missing iOS event does not mean zero usage.
- Recommendations and image classification are not sent to telemetry. There is no image-type, recommendation-result or suggestion-acceptance event. `profile_selected` records explicit user mode selection only; `preparation_decision` concerns the large-copy reduction dialog.

## Existing events

Events are declared in native allowlists (`android/app/src/main/java/dev/kigya/pixora/Telemetry.kt` and `ios/Native/PixoraUpscale.mm`). Allowlist presence proves neither emission by every platform/scenario nor Firebase delivery.

| Name | Meaning and producer-allowed data | Product question |
|---|---|---|
| `screen_view`, `screen_engagement` | Screen name/class; focused foreground duration only. Automatic reporting is disabled in Android manifest/iOS Info.plist; JS tracks Home/Settings/Feedback. | Which main screens are opened and for how much active time? Exclude background time and duplicate automatic views. |
| `ui_action` | Short action code, e.g. opening settings/help/privacy/licenses or clearing data. | Are optional help and system settings used? |
| `image_import_started`, `image_import_finished` | Picker source and success/cancelled/error status, sometimes an error code. No filename, path or URI. | Does selection/import finish without error? |
| `profile_picker_opened`, `profile_preview_interacted`, `profile_selected` | Current/selected public `profile_id`, `previous_profile` and preview-action type. | Which presets are viewed/selected? This measures neither quality nor suggestion usefulness. |
| `processing_options_changed`, `preparation_decision` | Mode/scale/speed setting code and confirmed/declined preparation choice. | Which modes/scales are configured, and is preparation needed before starting? |
| `job_started`, `job_finished`, `job_backend_changed` | Public profile, speed, scale, backend, phase/error code, size bucket and duration where supported. `attempt_token` is single-job/deduplication context only. | How many jobs succeed/fail/cancel/interrupt; how often does Android fall back GPU→CPU; how does duration vary by configuration? |
| `result_viewed`, `comparison_used` | Job context and `before`/`after`/`compare`/`divider` comparison action. | How many completed results are viewed/compared? |
| `export_finished`, `share_opened` | Format and action result (success/error/already_saved). | Can users save/share results, and which formats do they use? |
| `review_prompt_requested`, `review_prompt_shown`, `review_submitted`, `review_dismissed`, `play_redirect_finished` | Technical request/display/navigation outcome only when exposed by the SDK/platform. Calling the system API proves neither dialog display nor review submission. | Does the UX reach the system API? Do not derive public ratings from this. |
| `feedback_opened`, `feedback_send_finished` | Send status and allowed screen context. No email, message, idempotency token or email content. | How often is the form opened and submission completed? Do not analyze feedback content through Analytics. |
| `settings_changed` | Setting type and short new language/theme/format/cache-limit/consent value. | Which settings change? Analyze consent only in aggregate, accounting for voluntary collection. |
| `remote_config_updated` | Source, application status and enabled-mode count. Config parameter values/text are not published as events. | Did mode-availability refresh work? Separate from diagnostic consent. |

Android allows: `screen_view`, `screen_engagement`, `ui_action`, `image_import_started`, `image_import_finished`, `profile_picker_opened`, `profile_preview_interacted`, `profile_selected`, `processing_options_changed`, `preparation_decision`, `job_started`, `job_backend_changed`, `job_finished`, `result_viewed`, `comparison_used`, `export_finished`, `share_opened`, `review_prompt_requested`, `review_rating_selected`, `review_submitted`, `review_dismissed`, `play_redirect_finished`, `feedback_opened`, `feedback_send_finished`, `settings_changed`, `remote_config_updated`. `review_rating_selected` remains only in the allowlist and does not represent the current neutral flow; it is not an active metric.

## Derived metrics

All formulas use allowed events collected with Analytics consent. Reports must specify period and segmentation. Do not use a universal user denominator when events cannot support it reliably.

| Metric | Definition | Interpretation limit |
|---|---|---|
| Import success | `image_import_finished(status=success)` / terminal success/error/cancelled import results | Excludes selections without a native terminal event; not an active-user count. |
| AI-job success | `job_finished(status=success)` / all terminal `job_finished` statuses by `attempt_token` | OS-forced termination may emit no event; compare only known platform/event paths. |
| Successful-job duration | Median `duration_ms` for `job_finished(status=success)`, split by available profile/speed/scale/size bucket | Native elapsed time, not universal device speed or perceived quality. Size buckets are absent from some platform payloads. |
| Selected-profile distribution | `profile_selected` shares by `profile_id`; distinguish current/previous choice where possible | Contains no recommendation data and does not show whether suggestions helped. |
| Export success | `export_finished(status=success)` / all terminal export statuses by format | `already_saved` requests an existing file, not a new write. |
| Result comparison | `comparison_used` counts by action relative to `result_viewed` | Events describe actions, not satisfaction or visual accuracy. |
| Support interaction | Count of `feedback_send_finished(status=success/error)` and `feedback_opened` | Never collect/segment by message, reply address or email content. |
| Screen time | Sum/median `screen_engagement.engagement_ms` by `screen_name` | Foreground/focused intervals only. Process termination can truncate an interval. |

These events do not define MAU/retention, market demand, user-level journeys, upscale quality, revenue conversion or financial indicators. Do not infer them from event counts or set targets without a separate decision and verifiable source.

## Checks and status

`android/app/src/test/java/dev/kigya/pixora/TelemetryTest.kt` verifies allowed Android fields/events; existing Jest suites cover JS calls. These establish local code behavior, not Firebase ingestion. Current 0.8 handoff must separately verify real delivery, Crashlytics QA, installed-APK upgrade/revocation and cross-platform parity; never inherit historical 0.7 results automatically.
