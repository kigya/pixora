# Firebase and consent 0.8.0

Remote Config remains independent of diagnostic consent: local defaults/offline cache apply separately and fetching does not enable Analytics or Crashlytics.

Analytics and Crashlytics default to OFF at native startup. The current choice version is 2; legacy `noticeSeen` is not consent. Settings store separate `analytics` and `crashes` values; the native boundary allows collection only for version 2 with the corresponding value enabled. Each opt-out applies independently. Android removes automatic `FirebaseInitProvider` and reconciles the choice with `measurement_enabled` and `firebase_crashlytics_collection_enabled` before `FirebaseApp.initializeApp`; old versions remove both overrides, restoring disabled manifest defaults. Other SDK settings are preserved. The SDK initializes Crashlytics with FirebaseApp, but collection is gated first; disabling also deletes unsent reports. A real upgrade-APK check is still required. R8 and resource shrinking are disabled for readable stacks.

Analytics collection/delivery, consent upgrade/revocation and Crashlytics QA on physical releases remain unconfirmed. Never publish real client configurations, service-account credentials, signing material or private device data.
