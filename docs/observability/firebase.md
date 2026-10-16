# Firebase и согласие 0.8.0

Remote Config остаётся независимым от диагностических согласий: локальные defaults и offline cache применяются независимо, а fetch не включает Analytics или Crashlytics.

Analytics и Crashlytics по последнему явному решению пользователя включены по умолчанию с информационным уведомлением. Сохранённые независимые значения версии2 остаются приоритетными, включая false; fresh/legacy unresolved values дают true без автоматического подтверждения уведомления. Android удаляет FirebaseInitProvider и согласует SDK switches до FirebaseApp.initializeApp. iOS конфигурирует эффективные значения при native startup, сохраняя ранее выбранные отключения. Неудачный opt-out выключает соответствующий sink в памяти; выключенный Crashlytics удаляет неотправленные отчёты. Remote Config остаётся независимым. Изображения, URI, имена файлов и содержимое формы не передаются в телеметрию. R8/resource shrinking выключены.

На Samsung 0.8.0 подтверждены Analytics DebugView (screen_view/screen_engagement/session_start/settings_changed), отдельный Analytics-only opt-in, native upgrade и revoke. Crashlytics получил контролируемый JVM fatal 16.10.2026 14:44:19Z (строки FirebaseDiagnosticsActivity.kt:39/33) и NDK fatal 14:45:17Z (controlledNativeCrash, crash.cpp:3/4), версия 0.8.0 (10). Это QA-only diagnostic APK; финальная normal release приёмка, debug crash QA и JS source-map проверка ещё pending. Исходные отчёты с SDK installation IDs хранятся только локально. Публичные Firebase client IDs/config не являются административными секретами; не публиковать service-account credentials, signing material или приватные устройства.

## Последующее решение пользователя после ручного ревью

16.10.2026 пользователь явно заменил opt-in/default-OFF на default-ON с информационным уведомлением. До инициализации Firebase применяется сохранённый независимый выбор версии2; при отсутствии такого выбора оба значения включены. Уведомление не является запросом разрешения, его закрытие сохраняет текущие значения. Ранее сохранённые false остаются false. Старые default-OFF/upgrade проверки выше описывают предыдущее состояние, а не доказательство текущей семантики. После этого изменения дальнейшие runtime-тесты остановлены по указанию пользователя; новая проверка ожидает его ручной приёмки release APK.

Уточнение ADR-814: автоматические проверки новых defaults разрешены и выполняются; новая установка и UI-проверки Samsung отложены. Получение iOS Firebase событий отдельно не подтверждено: предыдущий unsigned simulator имел Keychain-34018; это не скрывается за unit/build PASS.
