# Pixora 0.8.0 — статус

Дата: 16.10.2026. Этап: реализация и интеграция 0.8.0.

База приложения импортирована через PR #1 в release/0.8.0. Рекомендации и пояснение подготовки фото прошли независимое ревью и включены через PR #2; Android debug с ними собран. Изолированная проверка рекомендаций: 163 Jest tests, 100% всех четырёх метрик JS/TS; C++ classifier 110/110 строк и 64/64 ветвей. Это не итоговая приёмка 0.8.0 и не доказательство точности классификации.

Через PR #3–7 включены main-only CI, JNI safety, 34 языка, миграции независимых согласий, нейтральный review, optional feedback email и platform metadata. PR #8 содержит Android coverage и физические Maestro flows; исправление QA debug C++ ABI отправлено в этот же PR. Свежий Jest: 166/166 в 14 suites, все четыре метрики собственных JS/TS файлов 100%; Kotlin b39: 106/106, 1039/1039 строк и 1096/1096 ветвей. iOS агент завершает строгую native coverage и финальную unsigned generic-device Release; интеграция в root ещё pending.

Samsung SM-S916B / Android 16 / API36: реальный Lite/Fast GPU inference 4561ms, экспорт PNG/JPEG/WebP и native Pixora08 3/3 прошли. Обе debug Maestro flows прошли: recommendation/preparation/manual Standard/Fast4x/PNG и Settings/Urdu/Hebrew/restart/theme/feedback без отправки. Получены ровно два отдельно разрешённых тестовых feedback письма; Reply-To проверен с адресом и без него. Analytics DebugView, native upgrade consent и revoke подтверждены. Crashlytics получил контролируемые JVM и NDK fatal с читаемыми Kotlin/C++ строками; финальная диагностика debug и JS source map ещё выполняется. Приватные raw logs, inbox, ID и serial не публикуются.

Остаются интеграция iOS/shared engine, итоговые root coverage/security/review/build checks, повтор debug/release Samsung приёмки на финальных APK, полная Firebase QA и CI текущего main. Main пока содержит только технический bootstrap. Один финальный main squash выполняется после локальной приёмки. Финальная подпись, GitHub Release и stores вне этого этапа.

## Последнее указание пользователя

После самостоятельной проверки пользователь сообщил «все ок» и запросил UI/defaults правки ADR-808–811. Дальнейшее тестирование остановлено (ADR-812). Следующее действие: интегрировать готовый iOS/shared engine, собрать normal release-mode APK без диагностики, установить на Samsung и запросить ручное подтверждение. Новые правки не проверялись; полный release handoff/main merge пока ожидает эту приёмку.

Release установка для пользователя выполнена: b44 normal assembleRelease/bundleRelease SUCCESS, APK0.8.0/code10 установлен на USB Samsung (Success), данные сохранены. APK SHA-25640fe94c818944ab1ff0151ffa05aea890f157a62a13d014d77e3ba6a7f7828f1. После последних правок приложение не тестировалось. Текущий следующий шаг: пользователь вручную подтверждает результат, затем согласуется завершение финального GitHub main-flow с неполными строгими gates. Main пока bootstrap; task PR8–10 merged в release/0.8.0.
