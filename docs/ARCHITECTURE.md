# Implementation architecture

`docs/PRD.md` is the current requirements/behavior authority. Historical specifications are retained privately. Market research does not expand the product. Requirement changes are reflected in the PRD and private local product context.

## State ownership

`SessionStore` is the source of truth: one AtomicFile JSON journal in app-private storage, with language/format/theme in SharedPreferences. `UpscaleModule` implements Codegen TurboModule `NativeUpscaleSpec`. JS receives small typed snapshots, preview URIs and metadata, never full-resolution pixels or private paths. Context/reducer drops snapshots with lower/equal sequences. Subscription precedes snapshot reading; returning Activity triggers reconciliation.

Import uses a separate executor. The selected URI is streamed with a 50 MiB limit; content determines format. APNG/animated WebP/GIF are rejected; bitmap bounds are checked before decoding. EXIF rotation/mirroring is respected. inSampleSize bounds decoding memory; working dimensions are proportionally capped at 1024. Only successful import replaces the previous session. A large-source working file requires UI confirmation first.

## Inference

Kotlin `ProcessingService` owns the job independently of JS. A visible Activity starts it on user action with a foreground notification, mediaProcessing on API 35+ / dataSync on APIs 29–34 and a bounded wake lock. One executor; atomic JNI cancellation between tiles. The 30-minute deadline requests a stop; an active tile must return before buffers are released. Force-stop, reboot and process death do not resume work; an incomplete journal becomes INTERRUPTED at the next startup.

`NativeEngine` loads a separate `libupscale.so`. CMake retains RN default OnLoad/autolinking separately. ncnn links statically from the official Vulkan SDK; x4plus and general-x4v3 .param/.bin models load through AssetManager. SHA-256 is checked before execution. An empty screen does not load a model.

GPU selection requires Vulkan availability and an 8×8 self-test; a controlled GPU failure triggers one CPU retry. CPU uses two threads. GPU tiles are 128, CPU tiles 64, padding 32 with coordinate-based cropping; a memory error permits one retry with tile 32. Inference returns validated codes, dimensions and finite metrics. RGB is unpremultiplied from Android alpha, alpha is resampled separately, then output is premultiplied again. AI 4× output is filtered for 2×. JS receives previews only, capped at 1536.

Progress counts tiles and is capped at 4 events/second and 1 notification/second. Inference never shows final 100%; writing has a separate stage. The service releases model/bitmap/wake lock after terminal state.

## Export and storage

Full result.png remains in the current app-private session. PNG preserves transparency; JPEG 95 composites on white. Bitmap export omits original EXIF/GPS. MediaStore writes new files to Pictures/UpscaleImage with IS_PENDING until complete. Export per format is idempotent while its MediaStore URI exists. Sharesheet uses separate cache/share files and FileProvider read grants. At a subsequent startup, temporary share files older than 24 hours are deleted. Removing a session does not delete MediaStore files.

The release manifest retains INTERNET for explicitly submitted feedback and disables backup. No account tokens, remote assets, boot receivers or model downloaders. Inference is fully local. Debug permits Metro. Privacy information and licenses are readable offline.

## Structure

- `App.tsx`: provider and navigation composition.
- `src/application/`: session, settings, synchronous operation locks, error handling and startup.
- `src/screens/`: working screen and settings.
- `src/navigation/`: typed stack and transition styling.
- `src/specs/NativeUpscale.ts`: Codegen contract.
- `src/domain/session.ts`: snapshot reconciliation, geometry and language.
- `src/ui/`: themes, accessible components, dialogs, comparison and responsive layout.
- `src/locales/`: ten dictionaries and the language registry shared by JS and Android.
- `android/app/src/main/java/dev/kigya/pixora/`: Android features, journal, service and TurboModule.
- `android/app/src/main/cpp/engine/upscale.cpp`: JNI, ncnn, models, cancellation and metrics.
- `android/app/src/main/cpp/engine/pixels.cpp`: tile geometry, RGB/alpha and output assembly.
- `android/app/src/main/assets/`: bundled models, hashes and notices.
- `android/app/src/androidTest/`: real device tests without runtime test backdoors.
- `scripts/`: dependency verification and local signing/build tools.

## 0.2 interface and native stages

ThemeProvider supports system/light/dark; native Activity uses matching DayNight behavior. DialogProvider replaces standard confirmations with safe-area and large-font support. Workbench selects one/two columns; WindowManager reports a separating fold. The horizontal comparison gesture does not capture vertical scrolling.

Notifications are optional and requested only by separate action. Their absence does not block Android foreground service. Granted notifications show actual progress/cancellation. The service reports preparation, device validation, model loading, tile processing, assembly and writing; percentage refers to completed tiles.

Pinned ncnn SDK LLVM OpenMP can crash during lazy topology initialization when Activity is backgrounded on POCO C71. JNI_OnLoad disables thread binding, selects flat topology and calls omp_get_num_places to finish this short initialization before service work starts. Weights and GPU are not loaded here. User initiation from a visible Activity remains required. A regression test backgrounds Activity immediately after service startup.


## 0.3 localization

src/locales/*.json is the sole source for owned strings, including errors/notifications; registry.json defines order, native names, direction and flags. JS imports JSON directly. Gradle verifyLocalization checks keys, object shapes, placeholder names and bundled SVG hashes; syncLocalization copies the same set into generated assets/locales before preBuild. Kotlin Localizer reads the existing language preference, maps full BCP-47 tags and caches dictionaries. ProcessingService builds each normal notification update in the selected language; the processing ID and permission stay unchanged.

LocaleContext controls component RTL and locale number formatting. I18nManager.forceRTL is unused: selecting Arabic requires no reboot/reload and does not restart a job. Comparison retains a physical LTR canvas; technical numeric strings use Unicode LTR isolates. InformationProvider shares one help window across three screens. LanguagePicker uses a responsive Modal and SVG flags from src/ui/flags.ts, with raw sources/provenance/license in assets/flags.

notificationDismissedSession in preferences and dismissNotificationHint(sessionId) retain dismissal of optional card actions for the current session only. updateSettings(language,format,theme) preserves its signature and system/ru/en values; session/export data is neither migrated nor deleted by an APK update.

## 0.4 responsibility boundaries

`AppProvider` subscribes before reading snapshots and reconciles sequence numbers. `useOperation` blocks duplicate starts synchronously with a ref before the next React render. Home and Settings share this action contract; business computation remains native. Components receive no pixel arrays.

`UpscaleModule` handles platform operations. `JsonBridge` converts metadata only; `BundledModels` validates checksums and caches verification. `SessionStore` atomically writes new state before publication and removal of previous managed files. A failed write preserves the current in-memory session. Reopening the picker does not clear the first request's Promise.

`ProcessingService` owns the lifecycle. `ImageProcessor` separately handles preparation, backend selection, final output and bitmap release. `ProcessingBackend` and `WorkFiles` allow controlled failure testing without replacing app AI: production calls use JNI and Android Bitmap. Memory exhaustion permits one tile-32 retry; a GPU error permits one CPU fallback even after tile reduction.

Detail uses x4plus; Fast uses general-x4v3. Existing `startJob` keeps quality mode; new `startJobWithMode` pins mode/modelId at start. Old journals default to quality. One loaded ncnn network serves GPU self-test and inference, then releases. Scratch buffers are reused between tiles. Alpha remains model-independent.

Tests have three levels: TypeScript/RNTL for UI/application; Robolectric for Android logic with controlled failures; instrumentation for real system integrations and CPU/GPU inference. Host C++ fault tests compile production algorithms/JNI with controlled dependencies. They supplement device checks and do not establish model quality. Instrumented coverage builds are never used for benchmarks.

`withClosed` closes streams/cursors on success and failure; a close error does not hide the original write failure. Partial files are deleted; bitmaps are released in finally. If journal writing fails during job termination, `updateProcessingState` publishes a terminal in-memory state so disk failure does not retain the service/wake lock. After process exit, recovery uses the last successfully persisted journal.

Activity synchronizes system-navigation contrast with the theme; `ThemePolicy` is shared by the application, settings and Activity. `UpscaleModule.invalidate` removes its session/window/activity listeners. Tests cover system-provider failure, missing Activity, forbidden foreground service, codec/disk errors, timeout and late cancellation. Test dependencies neither replace the production engine nor enter the APK.

## 0.5: profiles, storage and feedback

ProcessingProfiles defines five stable IDs; JNI processProfile routes four AI variants to their ncnn models, while pixelScale preserves exact blocks without AI. Kotlin retains ownership of cancellation, alpha, background work, journal and export. Preview aspect-fit uses actual width/available height; comparison shares identical bounds for both images.

RetentionPolicy runs at process startup after SessionStore restoration. The limit concerns retained data, not current intermediate files. Settings use SharedPreferences; a change does not remove an open result or active job.

FeedbackClient is the only production HTTP client. Its native executor sends only user-entered text/email/stars, version and requestId. The HTTPS endpoint is restricted to Google Apps Script; redirected GET is allowed only to script.googleusercontent.com; a bounded fixed-size response validates ok and ID. The network does not participate in models, picking or export. Endpoint configuration comes from local android/feedback.properties; account credentials are absent from the APK. support/apps-script sends email to the owner; errors preserve form text.

AppProvider checks notification status with snapshot/settings when AppState becomes active. Permission and channel status are evaluated together; Android requires a service notification but not POST_NOTIFICATIONS to start the foreground service. Prompts are capped at three. claimReviewPrompt permits at most two requests after three distinct saved jobs and a 30-day interval; personal stars do not filter Play navigation.

Feedback HTTP uses a separate native executor. Waiting on email does not occupy the import/session/cancellation command queue. invalidate releases both queues; an accepted request finishes within network timeouts. A unit test blocks the feedback queue and verifies independent cancelJob/getCurrentSession completion.


## 0.6 contracts

startJobWithProfile freezes profileId, speed and scale. Legacy calls preserve previous model mapping; schema 1 migrates to 2. ProcessingProfiles centralizes model IDs; PresetFinisher handles luminance mask/blending after final dimensions. TimeEstimator owns local histories and native snapshots; JS only presents ranges. MotionPolicy supplies power/thermal restrictions; Reanimated owns foreground transform/opacity and respects Reduce Motion. See PRD for preset matrix and compatibility rules.
