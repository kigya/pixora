# Физическая проверка 0.8.0

Последнее указание16.10.2026: пользователь сообщил об успешной самостоятельной проверке и остановил дальнейшие тесты приложения. Последние UI/defaults/shared-engine правки не тестировались; предыдущие PASS относятся к прежним исходникам. Выполняется только normal release сборка/установка для ручного подтверждения.

Устройство: Samsung SM-S916B, Android16/API36, USB. Это явная замена Xiaomi по указанию пользователя; legacy gate IDs xiaomi-debug/xiaomi-release означают этот Samsung override. Серийный номер не публикуется.

## Текущий результат

Debug0.8.0/code10 установлен в owner profile0 через `adb install --user 0 -r`, получен `Success`; существующие данные не сбрасывались. Activity запрошена через явный component. После разблокировки пользователем выполнен первый UI-прогон. Выбор English сохранён; оба consent switch исходно выключены, Not now сохраняет consentVersion2 с Analytics=false/Crashes=false. После импорта1600×1200 показаны рабочие1024×768, ожидаемые2048×1536 при2x и пояснение памяти/времени/потери деталей/неизменного оригинала. Рекомендация Lite не изменила Standard автоматически; Apply переключил Lite. Fast отдельно показывает AI512×384. Подтверждение подготовки и Cancel проверены. После повторного подтверждения и отказа от уведомлений настоящий GPU job завершился: Lite/Fast, scale2, model realesr-general-x4v3, elapsed4561ms,2048×1536. Before/After и восстановление результата после ухода/возврата работают. PNG3111205bytes, JPEG475663bytes и WebP2687682bytes сохранены через UI, каждый2048×1536. Это один debug-прогон, не release benchmark и не проверка качества на большом корпусе.

Тестовый большой источник1600×1200 создан увеличением лицензированной landscape fixture только для проверки размеров и интерфейса. Это не оценка восстановления деталей и не замена inference. Копия размещена в Pictures/PixoraQA; личные фото не используются.

## Оставшиеся сценарии

- Debug: первый выбор языка; независимые opt-ins/default-off; импорт большого фото, рекомендация/Apply/ручной режим/2x; точные исходные/рабочие/выходные размеры и текст подготовки; отмена; настоящий AI, сравнение и PNG/JPEG/WebP export.
- Native instrumentation: recommendation/JNI alpha, неизменность оригинала, подготовка1024, отдельный Fast512 и итоговый размер, cancel/background/recovery.
- Release: отдельная сборка release-mode с локальной тестовой подписью, установка и повтор ключевого сценария; хэш артефакта и commit в итоговом отчёте. Coverage/debug APK не подменяет release.
- Языки/тема: русский/английский/Hebrew RTL, крупный шрифт/прокрутка, сохранение выбора после перезапуска и восстановление прежних настроек устройства.
- Feedback debug delivery пройден после отдельного согласия пользователя на2 письма: оба получены, Reply-To присутствует только в письме с адресом; version/platform проверены в inbox. Firebase Analytics/Crashlytics проверяются отдельно и пока pending.

Статус физических gates: debug smoke passed, полная debug матрица и release pending. Подпись для магазина, store submission и GitHub Release вне Build App.

Первый запуск Pixora08Test на coverage APK выполнил3 теста, но2 завершились ошибкой cleanup: удаление ключей JSONObject во время итерации. Это исправлено копированием списка ключей перед удалением; исправленный test APK собран b32, установлен после разблокировки Samsung. Повтор выполнен на том же физическом устройстве: OK(3 tests),9.11s. Проверены настоящий recommendation JNI, alpha, SHA-256 оригинала и CPU pipeline с выбранным масштабом. Первый failed run не считается пройденной приёмкой.

Maestro debug: основной journey PASS,1m11s. Фактический сеанс Standard/Fast/4x, GPU, model realesrgan-x4plus,23226ms,4096×3072; PNG экспорт4096×3072. Проверены Apply, ручная смена режима, Fast/4x, Cancel и подтверждение подготовки, настоящий inference и Open/Share после сохранения. Flow использует видимый текст: live ID lookup в Maestro2.11 на этом устройстве расходился с post-failure hierarchy; это исправление automation selectors, не изменение приложения. Итоговый повтор после интеграции iOS/Android shared engine ещё нужен.

Maestro debug settings journey PASS,1m43s: Urdu и Hebrew RTL, Hebrew сохраняется после stop/launch, затем English/System восстановлены; Dark/System selected states и feedback privacy/optional email поля проверены без Send. Последняя версия flow явно оставляет notifications denied; native Settings показывает Notifications are off. Ни один дополнительный feedback не отправлялся.

## Установка для ручной приёмки после последнего ревью

Normal release APK b44 установлен на тот же USB Samsung SM-S916B в user0 через install-r: Success. dev.kigya.pixora0.8.0/code10, APK SHA-25640fe94c818944ab1ff0151ffa05aea890f157a62a13d014d77e3ba6a7f7828f1. Тестовая локальная подпись, без QA/coverage source sets. Существующие данные сохранены. По прямому указанию пользователя новые app runtime/UI/inference тесты не выполнялись; результат ожидает его ручного подтверждения. Автоматическая разблокировка/сброс данных не использовались. Временные font_scale0.9, USB keep-awake0, Analytics debug property и системная Samsung клавиатура возвращены к исходным значениям; task ADB reverse8081 удалён.
