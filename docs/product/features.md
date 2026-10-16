# Реестр функций 0.8.0

Источник: [workflow PRD](prd.md) и [основной PRD](../PRD.md).

- FEAT-801: implemented; independent review and isolated unit/native checks passed; integrated Android/iOS and Samsung acceptance pending. See quality/recommendations-review.md.
- FEAT-802: implemented; dimensions, explanation and confirmation covered by isolated UI checks; integrated build and Samsung acceptance pending.
- FEAT-803: implemented in iOS task branch; unsigned Release and real-model XCTest passed; integration and strict coverage pending.
- FEAT-804: implemented via PR4/7; consent, neutral review, optional-email/platform backend and unit tests reviewed; installed-app delivery/Firebase QA pending.
- FEAT-805: implemented via PR4;34-locale schema and first-language unit checks passed; Samsung English/default-off smoke passed, fullRTL/large-text QA pending.
- FEAT-806: task PR1–7 merged into release/0.8.0; main-only workflow implemented; final acceptance/one main merge/current-main CI pending.

Ручное ревью 16.10.2026 изменило FEAT-801/804: карточка скрывается после применения, Analytics/Error Reports включены по умолчанию с уведомлением (явные сохранённые отключения остаются). Навигация Feedback приведена к Privacy/Licenses; добавлен Android12+ animated splash. Пользователь остановил дальнейшие тесты и принимает финальный release APK вручную. Все результаты выше относятся к состоянию до этих правок и не являются их проверкой.
