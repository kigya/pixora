# Firebase and consent 0.8.0

Remote Config remains independent of diagnostic consent: local defaults/offline cache apply separately and fetching does not enable Analytics or Crashlytics.

Under the latest explicit owner decision, Analytics and Crashlytics default to ON with an informational notice. Saved independent version-2 choices take precedence, including false; fresh/unresolved legacy values become true without automatically acknowledging the notice. Android removes FirebaseInitProvider and reconciles SDK switches before FirebaseApp.initializeApp. iOS applies effective values at native startup while preserving opt-outs. A failed opt-out disables the corresponding in-memory sink; disabled Crashlytics deletes unsent reports. Remote Config remains independent. Images, URIs, filenames and form content never enter telemetry. R8/resource shrinking are disabled.

Samsung 0.8.0 confirmed Analytics DebugView (screen_view/screen_engagement/session_start/settings_changed), a separate Analytics-only opt-in, native upgrade and revocation. Crashlytics received a controlled JVM fatal at 2026-10-16 14:44:19Z (FirebaseDiagnosticsActivity.kt:39/33) and NDK fatal at 14:45:17Z (controlledNativeCrash, crash.cpp:3/4), version 0.8.0 (10). This was a QA-only diagnostic APK; final normal-release acceptance, debug crash QA and JS source-map verification remain pending. Source reports containing SDK installation IDs stay private. Never publish service-account credentials, signing material, real client configurations or private device data.

## Subsequent decision after manual review

On 2026-10-16 the owner explicitly replaced opt-in/default-OFF with default-ON and an informational notice. Independent saved version-2 choices apply before Firebase initialization; absent a choice, both values are enabled. The notice is informational; dismissing it retains current values. Previously saved false values remain false. The default-OFF/upgrade checks above describe the previous state, not evidence of current semantics. Further runtime testing was then paused by the owner pending manual release-APK acceptance.

ADR-814 clarification: automatic checks of new defaults are authorized and running; new Samsung installation/UI checks are deferred. iOS Firebase event receipt is separately unconfirmed: the earlier unsigned simulator hit Keychain -34018, which unit/build PASS must not conceal.
