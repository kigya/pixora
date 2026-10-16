# Pixora 0.8.0 — статус

Дата:16.10.2026. Этап: автоматическая приёмка перед итоговым GitHub merge.

## Действующие требования пользователя

Рекомендация появляется после импорта и применяется только кнопкой; Apply скрывает карточку для текущего фото. Подготовка большой копии объясняет ограничение1024px по длинной стороне, точные рабочие/выходные размеры и неизменность оригинала; Fast отдельно ограничивает AI-вход512px. Feedback использует центрированную панель как Privacy/Licenses, без дублирующей Having Issues. Analytics/Error Reports включены по умолчанию с информационным уведомлением, независимые сохранённые отключения приоритетны; switches обновляются сразу с последовательной записью. Splash ждёт initial loading/navigation и минимум1500ms, анимация бренда1500ms. Общие LESSON-0001/0002 сохранены только в локальной базе Personal.

После самостоятельной проверки пользователь подтвердил остальные изменения («все остальное ок»). Последнее уточнение ADR-814 разрешает автоматические проверки, сборки, CI и исправления; новую установку и повторные UI-проверки Samsung пока не выполнять. Прежняя остановка всех тестов в ADR-812 заменена этим уточнением. Никакие физические PASS не добавляются без выполнения.

## Интеграция

Публичный репозиторий kigya/pixora. PR1–12 merged в release/0.8.0, включая iOS/shared engine и splash1500. Дополнительная автоматическая приёмка и исправления проходят task PR14 (fix/08-automatic-acceptance), source re-review завершено без оставшихся blockers. Итоговый PR13 предназначен для единственного squash в main и CI на фактическом SHA; текущее состояние merge/checks —в GitHub PR13 и Actions. CI только main push. Сохранённый bootstrap7ad1c20 не является продуктовым выпуском.

## Свежие автоматические результаты

- Node22: Jest14suites/168tests PASS, statements869/869, branches632/632, functions275/275, lines807/807 —100%. TypeScript PASS; lint0errors/88warnings.
- Root C++: engine207/207lines236/236branches, classifier110/110lines64/64branches, JNI48/48lines32/32branches; source-presence PASS. Тестовыеfixtures не выдаются за реальный inference.
- Контрольные суммы bundled моделей и схемы/placeholder/flag hashes34локализаций PASS.
- Secret/workflow/dependency/mobile-source scans прошли с указанными в security.md индивидуальными dispositions; backend9/9tests PASS, новых реальных писем не отправлялось.
- Kotlin b51:111/111tests PASS,1062/1062lines1106/1106branches —100%, source-presence PASS. Новые test-hang/clock-offset исправлены; partial failed runs не выдаются за PASS.
- iOS:52/52simulator XCTest PASS,607/607lines794/794branches —100%. Clock после attachment исправлен и прошёл re-review. Unsigned generic-device Release PASS (arm64,min15.1,dev.kigya.pixora0.8.0/10,code signing disabled). Полный aggregate coverage/source-presence gate PASS; thresholds не снижены.

## Сборка и физическая граница

Android b52 normal release APK/AAB SUCCESS, без QA/coverage, R8off, локальная тестовая подпись. APK `artifacts/Pixora-0.8.0-automatic-acceptance.apk`, SHA-256 `67f77d759358edcaa9c36e3f4f8ed8398b1df8a8a46295b15601e5b29ac1343f`. По указанию пользователя НЕ установлен. Подробности build-report.md.

Ранее Samsung SM-S916B/Android16 прошёл описанные debug instrumentation/Maestro сценарии с реальным AI и PNG/JPEG/WebP. Normal release b44 установлен для ручного review; пользователь подтвердил остальные функции. Эти результаты не подтверждают последующий splash1500 и текущую полную физическую матрицу. Свежие physical gates отложены пользователем.

Ранее подтверждены ровно2 отдельно разрешённых feedback письма и optional Reply-To, Android Analytics DebugView и читаемые JVM/NDK Crashlytics QA reports. iOS ingestion пока не подтверждён (unsigned simulator Keychain-34018); debug/JS crash QA не завершена. Эти ограничения не скрываются за unit/build PASS.

## Следующее действие

Локальные strict coverage/security и Android/iOS Release PASS; независимое re-review без оставшихся source blockers. Провести task PR и итоговый GitHub PR/CI. Сохранить текущие факты и отложенные физические/service gates в pipeline/handoff. До нового указания не устанавливать приложение на Samsung и не запускать там UI. Финальная подпись, GitHub Release, stores и billing вне Build App.
