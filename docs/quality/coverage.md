# Покрытие собственного кода 0.8.0

После ручного ревью пользователь остановил дальнейшие тесты (ADR-812). Следующие цифры относятся к состоянию до последних UI/defaults и root shared-engine изменений; они не являются текущим coverage PASS.

## Ранее измеренные результаты

Интегрированный Jest/RNTL14: финальный повтор —166/166 tests,14/14 suites PASS. `coverage-summary.json`: statements842/842, branches633/633, functions279/279, lines780/780 —100% каждой метрики. Type-only declarations с нулём исполняемых statements не добавляют вымышленный знаменатель. Пороги и источники не снижались.

Kotlin JaCoCo: b39 —106/106 PASS; 1039/1039 lines,1096/1096 branches. Строгий line/branch gate и source-presence gate пройдены. В знаменателе все `android/app/src/main/java/**/*.kt`; исключены только generated BuildConfig/R, без исключений собственных файлов. JNI test-only host library проверяет передачу параметров и владение ресурсами на границе; она не подменяет физический inference.

Физическая Samsung debug-проверка 0.8: `Pixora08Test` —3/3 instrumentation tests PASS. Два Maestro debug flow PASS: рекомендация → подготовка → upscale/save и настройки → RTL/theme → feedback privacy. Это подтверждает только описанные debug-сценарии; публикацию и финальную приёмку не подтверждает. Подробные логи и снимки остаются в приватном `.p-build-app/local/evidence/samsung/`.

Изолированные C++ тесты рекомендации ранее показали classifier110/110 lines,64/64 branches и JNI bridge48/48 lines,32/32 branches. Это тестовые fixtures и JNI boundary tests, не оценка точности на пользовательской выборке. После интеграции общего `native/engine` и Android shim текущий native-core harness/coverage ещё нужно заново выполнить в корневом checkout; этот интегрированный native gate пока pending.

iOS: сохранённый LLVM worktree snapshot —513/514 строк,760/764 ветвей; строгие100% не достигнуты. В последнем завершённом42-case прогоне один OS-boundary case имел ошибки, затем исправленный case отдельно прошёл. Полный43-case повтор прерван до результата. Последние default-ON/share-cleanup изменения и root интеграция не тестировались. Подробнее agent-reports/ios-port.md.

## Текущие блокеры приёмки

- Перезапустить и сохранить строгую C++ coverage/source-presence проверку после root-интеграции shared engine, recommendation classifier/JNI и Android shim.
- Получить итоговые iOS build, XCTest и собственные lines/branches coverage для всех принадлежащих проекту источников; vendor/Pods не входят в знаменатель.
- Классификатор остаётся эвристической гипотезой: искусственные тестовые изображения проверяют защитные свойства, но репрезентативная лицензированная и вручную размеченная выборка false-positive качества не подтверждена.
- Итоговая приёмка 0.8 остаётся открытой, несмотря на прошедшие JS, Kotlin и перечисленные Samsung debug-проверки.

## Повторение и граница доказательств

- JS: `npm test -- --runInBand --coverage`, затем `python3 scripts/check-js-coverage.py`.
- Kotlin: Gradle `:app:testCoverageUnitTest :app:nativeJvmCoverage -Pcoverage -Pci`; затем strict Kotlin/source-presence check.
- C++: scripts/test-native-core.sh, test-recommendation-core.sh, test-recommendation-jni.sh.
- iOS: scripts/test-ios.sh экспортирует coverage/ios/coverage.json.
- `npm run coverage:check` объединяет те же строгие gates, что CI: все четыре JS метрики, Kotlin line/branch и все native LLVM reports с присутствием owned источников. Отсутствующий/нулевой/неполный отчёт — failure.

Отчёты coverage/ и .p-build-app/local/evidence приватные и игнорируются. Итоговые числители, знаменатели и commit нужно обновить после последней стабильной полной проверки. Unit coverage не является E2E coverage и не доказывает отсутствие ошибок. Итоговый native gate пока не пройден.

Следующая приёмка: пользователь вручную проверяет установленный normal release APK. Непройденные строгие gates не объявлены passed и thresholds не изменены.
