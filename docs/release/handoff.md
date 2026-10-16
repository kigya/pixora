# Pixora0.8.0 — состояние передачи

Автоматическая приёмка текущих исходников завершена по coverage/source gates; финальные release builds и main CI фиксируются в build-report и итоговом [PR13](https://github.com/kigya/pixora/pull/13). Формальная готовность к публикации не объявляется: пользователь отложил новую установку/UI на Samsung, отдельные service QA остаются открытыми. Production signing, GitHub Release и stores относятся к отдельному release workflow.

## Реализованное поведение

Рекомендация после импорта применяется только кнопкой и скрывается для текущего фото. Подготовка большой копии объясняет точные исходные/рабочие/выходные размеры, стоимость памяти/времени, возможную потерю деталей и неизменный оригинал;1024px по длинной стороне, отдельно Fast512. Feedback использует центрированную панель как Privacy/Licenses без повторной Having Issues. Analytics/Error Reports default-ON с информационным notice, независимыми сохранёнными opt-outs и немедленным положением switches/serial native writes. Splash держится max(initial readiness,1500ms), анимация1500ms; iOS clock начинается после attachment, Reduce Motion учитывается.

Offline ncnn/shared engine сохраняет provenance/hashes моделей; iOS CPU поддерживает8presets/5models, bounded background/cancel/recovery и PNG/JPEG/WebP.34active locales плюс pt compatibility; профессиональной вычитки нет. Примеры остаются предоставленными владельцем иллюстрациями, не оценкой качества моделей. Общие LESSON-0001/0002 сохранены вне репозитория.

## Автоматические доказательства

JS168/168:869statements,632branches,275functions,807lines —100%; TypeScript PASS, lint0errors/88warnings. Kotlin b51:111/111,1062lines1106branches —100%. C++ engine207lines236branches, classifier110lines64branches, JNI48lines32branches —100%. iOS XCTest52/52,607lines794branches198functions —100%. Aggregate native2034/2034lines2232/2232branches; scripts/check-coverage.py/source-presence PASS. Все owned implementation files входят в reports, thresholds/exclusions не ослаблены. Полные commands/denominators и пределы в coverage.md.

Независимое review не оставило source blockers после исправления iOS clock и Android listener ownership. Secret/workflow/dependency/mobile scans прошли с адресными dispositions, перечисленными в security.md. Финальный CodeQL/main CI оценивается по фактическому SHA, не по локальному build.

## Артефакты и платформы

Android dev.kigya.pixora0.8.0/code10,min29,target36; debug отдельный .debug. Normal release b52 assembleRelease/bundleRelease SUCCESS, R8off, без QA/coverage, локальная тестовая подпись. APK `artifacts/Pixora-0.8.0-automatic-acceptance.apk`: SHA-256 `67f77d759358edcaa9c36e3f4f8ed8398b1df8a8a46295b15601e5b29ac1343f`. AAB `artifacts/Pixora-0.8.0-automatic-acceptance.aab`: `50ff8e941123337cf578fdb5d7f581c3251127337a2e8456d5d570790a1f685d`. НЕ установлены по последнему указанию пользователя.

iOS15.1+, Xcode26.6/iOS26.5 SDK; unsigned generic-device Release результат/metadata в build-report и agent-reports/ios-port.md. Unsigned build не доказывает App Store signing/install. Сырые отчёты, paths mapping и artifact hashes хранятся в ignored local evidence.

## Физические и service ограничения

Samsung SM-S916B/Android16 заменяет Xiaomi по ADR-805. Ранее выполнены описанные debug instrumentation/Maestro и реальные AI/export сценарии. Normal release b44 установлен, пользователь самостоятельно подтвердил остальные функции, затем запросил splash1500. После этого новая установка/UI явно отложены (ADR-814); новый splash не получает физический PASS по наследству. Актуальные physical gates остаются blocked/deferred в pipeline.

Подтверждены ровно2 отдельно разрешённых feedback письма с optional Reply-To, Android Analytics DebugView, читаемые JVM/NDK Crashlytics QA reports. Новых реальных писем не отправлялось. Полная Firebase matrix/debug+JS crash QA и iOS ingestion не завершены; unsigned simulator ранее имел Keychain-34018. Unit/build не подменяет доставку. Remote Config независим от telemetry settings; inference/изображения/URI/имена/текст feedback в телеметрию не идут.

## Продолжение

GitHub flow: task PRs в release/0.8.0, один итоговый squash PR13 в main, CI только main push; текущие ссылки/исходный SHA и machine receipts фиксирует pipeline. При падении main CI —новая corrective version/PR без стирания истории. Новая Samsung установка/UI возможна только после нового указания пользователя. Перед публикацией отдельный release workflow должен закрыть deferred physical/service gates, финальную подпись/backup и store disclosures; billing не включается.
