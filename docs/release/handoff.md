# Pixora 0.8.1 — состояние передачи

Автоматическая приёмка текущих исходников завершена по coverage/source gates; финальные release builds и main CI фиксируются в build-report и [main CI](https://github.com/kigya/pixora/actions/workflows/main.yml). Формальная готовность к публикации не объявляется: пользователь отложил новую установку/UI на Samsung, отдельные service QA остаются открытыми. Production signing, GitHub Release и stores относятся к отдельному release workflow.

## Реализованное поведение

Рекомендация после импорта применяется только кнопкой и скрывается для текущего фото. Подготовка большой копии объясняет точные исходные/рабочие/выходные размеры, стоимость памяти/времени, возможную потерю деталей и неизменный оригинал;1024px по длинной стороне, отдельно Fast512. Feedback использует центрированную панель как Privacy/Licenses без повторной Having Issues. Analytics/Error Reports default-ON с информационным notice, независимыми сохранёнными opt-outs и немедленным положением switches/serial native writes. Splash держится max(initial readiness,1500ms), анимация1500ms; iOS clock начинается после attachment, Reduce Motion учитывается.

Offline ncnn/shared engine сохраняет provenance/hashes моделей; iOS CPU поддерживает8presets/5models, bounded background/cancel/recovery и PNG/JPEG/WebP.34active locales плюс pt compatibility; профессиональной вычитки нет. Примеры остаются предоставленными владельцем иллюстрациями, не оценкой качества моделей. Общие LESSON-0001/0002 сохранены вне репозитория.

## Автоматические доказательства

JS168/168:869statements,632branches,275functions,807lines —100%; TypeScript PASS, lint0errors/88warnings. Kotlin b54:111/111,1062lines1106branches —100%. C++ engine207lines236branches, classifier110lines64branches, JNI48lines32branches —100%. iOS XCTest52/52,607lines794branches198functions —100%. Aggregate native2034/2034lines2232/2232branches; scripts/check-coverage.py/source-presence PASS. Все owned implementation files входят в reports, thresholds/exclusions не ослаблены. Полные commands/denominators и пределы в coverage.md.

Независимое review не оставило source blockers после исправления iOS clock и Android listener ownership. Secret/workflow/dependency/mobile scans прошли с адресными dispositions, перечисленными в security.md. Финальный CodeQL/main CI оценивается по фактическому SHA, не по локальному build.

## Артефакты и платформы

Android dev.kigya.pixora0.8.1/code11,min29,target36; debug отдельный .debug. Normal release b55 assembleRelease/bundleRelease SUCCESS, R8off, без QA/coverage, локальная тестовая подпись. APK `artifacts/Pixora-0.8.1-automatic-acceptance.apk`: SHA-256 `6687c8239a27858b0a5d7f43ae51c290c08cc7ddd43db6322a2ce1b317219123`. AAB `artifacts/Pixora-0.8.1-automatic-acceptance.aab`: `333b177dab37ee91adb75c347a3fdc409eb527232666c299e076240ba542dddd`. НЕ установлены по последнему указанию пользователя.

iOS15.1+, Xcode26.6/iOS26.5 SDK; unsigned generic-device Release результат/metadata в build-report и agent-reports/ios-port.md. Unsigned build не доказывает App Store signing/install. Сырые отчёты, paths mapping и artifact hashes хранятся в ignored local evidence.

## Физические и service ограничения

Samsung SM-S916B/Android16 заменяет Xiaomi по ADR-805. Ранее выполнены описанные debug instrumentation/Maestro и реальные AI/export сценарии. Normal release b44 установлен, пользователь самостоятельно подтвердил остальные функции, затем запросил splash1500. После этого новая установка/UI явно отложены (ADR-814); новый splash не получает физический PASS по наследству. Актуальные physical gates остаются blocked/deferred в pipeline.

Подтверждены ровно2 отдельно разрешённых feedback письма с optional Reply-To, Android Analytics DebugView, читаемые JVM/NDK Crashlytics QA reports. Новых реальных писем не отправлялось. Полная Firebase matrix/debug+JS crash QA и iOS ingestion не завершены; unsigned simulator ранее имел Keychain-34018. Unit/build не подменяет доставку. Remote Config независим от telemetry settings; inference/изображения/URI/имена/текст feedback в телеметрию не идут.

## Продолжение

GitHub flow: task PRs в release/<version>, один итоговый squash на версию в main, CI только main push; текущие ссылки/исходный SHA и machine receipts фиксирует pipeline. При падении main CI —новая corrective version/PR без стирания истории. Новая Samsung установка/UI возможна только после нового указания пользователя. Перед публикацией отдельный release workflow должен закрыть deferred physical/service gates, финальную подпись/backup и store disclosures; billing не включается.

## Корректирующая версия

0.8.0 main squash PR13/2ea2dd2 сохранён вместе с failed CI38955818843. После исправления frozen lock и setup-java matcher версия 0.8.1 проходит новый task PR в release/0.8.1 и один отдельный main squash; CI только main push. Empty-cache npm ci и повторные JS168/Kotlin111/iOS52/C++ gates PASS; финальные Android b55 и unsigned iOS 0.8.1(11) Release PASS. iOS binary SHA-256 `ed77cfd255a61d66b2eee8a2719f8202c9e9dac5a15ce2d50bddb40fd1c3ad19`; app/dSYM `artifacts/ios/DeviceRelease-0.8.1/`. Функции остаются из линии 0.8; новой установки/UI и публикации не было. Текущий CI/CodeQL результат связывается с фактическим новым main SHA, прежний failed run не переименовывается в PASS.
