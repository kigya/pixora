# Workflow parity implementation report

Branch: `feat/workflow-parity` (isolated worktree). No Git mutations, deployments, external-account writes, or real feedback sends were performed.

Implemented in this worktree:

- Native consent version 2, independent Analytics/Crashlytics choices initially off, legacy `noticeSeen` excluded from consent, native settings API, Android consent initialization before FirebaseApp, and independent Remote Config ordering. Android manifest disables collection defaults and removes FirebaseInitProvider. SDK clients are constructed only when their corresponding explicit setting is on. Pre-init reconciliation covers Analytics' `measurement_enabled` and `measurement_enabled_from_api` plus Crashlytics' collection override.
- Android startup stays usable when pre-Firebase SDK preference reconciliation cannot commit: Firebase initialization and Remote Config fetch are skipped, local profile defaults/cache and React Native still load, and native telemetry settings remain editable but inert until a later launch safely reconciles them. FirebaseInitProvider removal is scoped inside `<application>`.
- Fresh-install language selection, system language/locale support, legacy Portuguese `pt` migration to `pt-BR`, RTL registry entry for Hebrew, language state preserved for existing installs, and matching JS onboarding/navigation/native API wiring.
- iOS-specific localized notification text explains that background work may be interrupted and can be restarted on return. The wording is selected on iOS for the permission introduction, Settings, and background status card, avoiding Android service/progress/cancel claims. Added for the 34 supported languages and retained `pt` dictionary.
- Neutral native Play review request after export success and native eligibility checks; removed star prompt/rating filter. Telemetry records `review_prompt_requested` because Play does not report whether its prompt appeared or was submitted.
- Optional reply email validation at JS/native/Apps Script boundaries; backend omits Reply-To when absent while retaining existing quota/idempotency behavior. Support email action remains separately accessible.
- Android release minification/resource shrinking disabled. Documentation updated for consent, privacy, support, and review behavior.

Focused verification passed:

- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck`
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- --runInBand` — all 12 suites and 145 tests passed.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test:coverage -- --silent` — all 12 suites and 145 tests passed, but the unchanged global 100% thresholds fail at 98.00% lines and 98.01% branches (98.03% statements, 96.64% functions). Uncovered owned paths include `src/navigation/routes.ts`, new `src/screens/LanguageOnboarding.tsx`, NativeUpscale type-only spec, feedback validation/error branches, iOS/Android notification platform branches, and telemetry-control error rendering. No thresholds or exclusions were changed.
- `python3 scripts/verify-locales.py` — 34 locale schemas/placeholders and bundled flag hashes passed.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH node --test support/apps-script/feedback.test.cjs` — 6 tests passed.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run lint -- --no-fix` — 0 errors; warnings are existing inline-style/shadow/bitwise warnings.
- `git diff --check` passed after the final JS/localization changes.

Pinned Measurement SDK audit (23.2.0): bytecode in `play-services-measurement-api` shows `FirebaseAnalytics.setAnalyticsCollectionEnabled(boolean)` forwards to `zzez.zzq`, whose `zzdl.zza` invokes `zzcp.setMeasurementEnabled(boolean,long)`. In `play-services-measurement-sdk`, `AppMeasurementDynamiteService.setMeasurementEnabled` calls `zzic.zzj().zzn(Boolean)`; `zzlj.zzn` schedules `zzks.run`, which invokes `zzlj.zzai(Boolean,true)`. `zzlj.zzai` calls `zzaq(Boolean,true)`, which stores the ordinary `measurement_enabled` value through `zzhh.zzh(Boolean)` and separately writes/removes `measurement_enabled_from_api`. `zzlj.zzz(zzjl)` reads the API override and honors a stored false when applying the computed enabled state. Therefore removing or reconciling only `measurement_enabled` would leave a legacy API opt-in; both keys are now handled before Firebase initializes. This is cached bytecode inspection, not a live-upgrade/device test.

Remaining blockers/limits:

- New `pa`, `jv`, `gu`, and `he` locale JSON files are manually translated across the merged schema, including recommendation/preparation copy, and retain `translationStatus: unreviewed` to indicate they have not had native-speaker review. The source-identical values are only the product name and format names. `pt-BR` retains Portuguese copy while `pt.json` remains for migration compatibility. Existing locale dictionaries received updated optional-email/privacy and iOS notification copy.
- Android native unit tests/build were not run here because Gradle execution is routed through the parent’s Gradle MCP workflow. Robolectric regression tests were added for failed pre-Firebase preference reconciliation, editable durable choices with telemetry inert until a safe next launch, failed persistence during opt-out immediately suppressing active collection, and review-eligibility write failure. These are native unit tests, not MainApplication orchestration or device tests. No device validation was performed.
- Strict JS coverage remains a blocker for a 100% coverage claim; the full suite passes, but the measured 98.00% line / 98.01% branch report is below the repository gate. The newly added onboarding and platform-specific copy branches need focused test execution before that gate can pass.
- Removing FirebaseInitProvider and pre-initialization reconciliation of both pinned Analytics keys and the Crashlytics collection preference establishes the intended source ordering. Tests cover legacy enabled SDK flags, including the API override, and current explicit preferences overriding stale SDK values. A live upgrade test against persisted SDK collection settings and old unsent crash reports is still needed before claiming runtime behavior is proven.
- Firebase ingestion, Play review display, support-email delivery, policy/legal disclosures, and native-speaker translation review remain unverified.
