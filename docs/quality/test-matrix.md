# Матрица проверок 0.8.0

Последнее указание16.10.2026: пользователь сообщил об успешной самостоятельной проверке и остановил дальнейшие тесты приложения. Последние UI/defaults/shared-engine правки не тестировались; предыдущие PASS относятся к прежним исходникам. Выполняется только normal release сборка/установка для ручного подтверждения.

Матрица связывает критерии PRD с исполняемыми проверками. Наличие теста не означает PASS: итоговые результаты и ревизии фиксируются в coverage.md, build-report.md и device-report.md.

## TEST-801 — рекомендация (FEAT-801)

- `__tests__/recommendations.test.tsx`: рекомендации после импорта, Apply, сохранение ручного режима и масштаба, обновление availability, неподдерживаемые режимы, отказ анализа, устаревший асинхронный ответ при замене/удалении фото.
- `tests/native/recommendation_test.cpp`: текстура/контуры/пиксельная сетка, неоднозначные входы, малые размеры, alpha, экстремальные размеры. Это контролируемые fixtures, не оценка точности на рынке.
- `tests/native/recommendation_jni_test.cpp`: JNI bitmap lock/unlock, исключения, время жизни ресурсов и непрозрачный композит.
- `android/.../Pixora08Test.kt`: реальный JNI по приватной копии лицензированного фото, проверка идентичности текущего изображения, отключённые профили, RGB под нулевой alpha.
- Samsung debug evidence: `Pixora08Test` —3/3 instrumentation tests PASS, включая настоящий JNI, прозрачные скрытые RGB и сохранение оригинала/выбранного масштаба. Maestro flow «recommendation, preparation, upscale, save» PASS; component tests проверяют Apply только по нажатию, сохранение ручного режима/масштаба и гонки. Подробные локальные логи приватны. Точность классификатора на размеченной выборке не установлена.

## TEST-802 — подготовка копии (FEAT-802)

- Component tests: фактические исходные/рабочие/выходные размеры, 2x/4x, портрет/альбом, Fast cap512, подтверждение и отмена.
- `ImageFilesTest`, `CodecFailureTest`, `OwnedBoundariesTest`: downsample с orientation, неизменность оригинала, alpha, рабочие файлы, ошибки декодирования/записи.
- `Pixora08Test.preparationPreservesOriginalAndCpuPipelineWritesSelectedScale`: SHA-256 оригинала до/после, рабочая копия1024×768, Fast AI512×384 и настоящий результат2048×1536 при выбранном2x.
- Samsung debug evidence: `Pixora08Test.preparationPreservesOriginalAndCpuPipelineWritesSelectedScale` прошёл; Maestro debug flow с рекомендацией, подготовкой, upscale и сохранением прошёл. Component tests проверяют фактические размеры, Fast cap512, подтверждение и отмену. Это подтверждает только выполненный debug-сценарий; release-проверка и полная приёмка остаются pending.

## TEST-001 / TEST-803 — офлайн обработка и iOS (FEAT-001/803)

- `ProcessorTest`, `ServiceLifecycleTest`, `StoreAndLocalizationTest`, `ModuleUnitTest`: состояния, прогресс, отмена, восстановление, ошибка/таймаут/нехватка памяти, выбор backend, сохранение/экспорт.
- `tests/native/{pixels,adapter}_test.cpp`: собственный C++ движок, границы tiles, alpha, cleanup, исключения и отмена; подмена ncnn в unit harness отделена от реального inference.
- Android instrumentation `NativePipelineTest`, `QualityReviewTest`, `ModuleContractTest`, `Pixora08Test`: реальные bundled модели и bridge. Не передавать аргумент реальной отправки feedback без отдельного согласия.
- iOS XCTest: целевые сценарии включают все восемь presets/пять моделей, фактический inference, tiled/whole delta, PNG/JPEG/WebP, подготовку, отмену/INTERRUPTED и retry. Итоговая интегрированная iOS сборка/XCTest/coverage сейчас pending; simulator XCTest не подтверждает физический iPhone.
- Samsung debug: два Maestro flow и три `Pixora08Test` instrumentation tests прошли для зафиксированных сценариев рекомендации/подготовки/upscale/save и настроек/RTL/theme/feedback privacy. Полная матрица сценариев, release install и итоговый артефакт/хэш — pending; результаты отражаются в device-report.md.

## TEST-804 — согласия, feedback и review (FEAT-804)

- `TelemetryTest`, `ApplicationStartupTest`, `FirebaseBoundaryTest`: default-off, legacy notice≠consent, независимые флаги, обе Measurement overrides до eager Firebase init, отказ хранилища, разрешённые поля, RC независимо от opt-in.
- `ModuleUnitTest`: review только после результата/сохранений и cooldown, отказ durable write не вызывает prompt; нет проверки рейтинга перед store.
- `FeedbackClientTest`, `support/apps-script/feedback.test.cjs`: email optional, rating/message/UUID/размеры, platform enum с legacy default Android, отказ конфигурации/сети, редиректы, server dedup/quota, version/platform в письме.
- Реальная доставка Analytics/Crashlytics/feedback требует отдельного доказательства; unit mock, HTTP200 и сборка не подтверждают получение. Реальная тестовая отправка feedback — только после явного согласия пользователя.

## TEST-805 — языки и адаптивность (FEAT-805)

- `scripts/verify-locales.py`: 34 схемы/placeholder/flag hashes; `StoreAndLocalizationTest` и component tests: pt→pt-BR, первый выбор, сохранение и native locale sync.
- `WindowLayoutTest`, `ActivityLifecycleTest`, layout/dialog tests: safe area, fold/resize, восстановление Activity, light/dark/system, scrolling/large text.
- Samsung: выбранный язык после перезапуска, русский/английский, Hebrew RTL, крупный системный шрифт и возврат прежнего размера. Схема переводов не заменяет проверку носителями.

## TEST-806 — GitHub и выпускная проверка (FEAT-806)

Task PRs с независимым review → release/0.8.0; после локальной приёмки один squash в main. CI запускается только по push main. Проверить тот же SHA, все jobs и CodeQL alerts; сохранить ссылки. Строгие измеренные 100% для JS statements/functions/lines/branches и собственного Kotlin/C++/ObjC++ lines/branches, проверка присутствия всех собственных исходников. Security: secrets, workflow, dependency advisories, mobile static scan и независимое review.

Секреты, private serial, сырой logcat, пользовательские изображения и локальные подписи не входят в публичные доказательства. Финальная подпись/store/GitHub Release выполняются отдельным release workflow.
