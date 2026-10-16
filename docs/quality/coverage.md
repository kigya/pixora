# Покрытие собственного кода0.8.0

Действующее указание ADR-814: автоматические проверки разрешены; новая установка и UI на Samsung отложены. Ниже свежие измерения текущих исходников, а не перенесённые PASS0.7/раннего0.8.

## JavaScript/TypeScript — PASS

Node22.23.2, Jest/RNTL14:14/14suites,168/168tests. Statements869/869, branches632/632, functions275/275, lines807/807 —100% каждой метрики. Инструментируются все owned src, включая неимпортированные файлы; type-only declarations не получают вымышленных исполняемых строк. TypeScript PASS; ESLint0errors/88warnings. Тесты покрывают Apply-dismiss, notice Continue, быстрые переключения с serial writes, stale failure/latest rollback и finishStartup после navigation ready/initial failure.

## Kotlin — PASS

b50:110/110tests PASS;1062/1062lines,1107/1110branches. Строгий gate отклонил неполное покрытие. Для реального first opt-out добавлен uncached Crashlytics sink case. Lifecycle cleanup хранит единую closure, владеющую зарегистрированной парой View/listener, вместо двух независимо nullable полей с недостижимыми комбинациями. Независимое review подтвердило ownership и отсутствие исключения источников. Итоговый полный b51:111/111tests PASS,1062/1062lines1106/1106branches —100%. Полный source-presence gate и scripts/check-coverage.py для всех слоёв PASS. Уменьшение числа ветвей1110→1106 относительно частично покрытого состояния отражает упрощение lifetime ownership в production, без исключения файлов или изменения порогов.

Все `android/app/src/main/java/**/*.kt` входят в source-presence gate; исключены только generated BuildConfig/R. Host JNI fixture проверяет boundary и владение ресурсами, не выдаётся за настоящий inference.

## C++ и Objective-C++ — PASS

Root native-core207/207lines236/236branches; classifier110/110lines64/64branches; recommendationJNI48/48lines32/32branches. Все owned native/engine, native/recommendation, Android JNIshim/recommendation_jni присутствуют в reports. Исправленный harness канонизирует пути и удаляет старый report до запуска. ncnn/JNI fixtures отделены от реального AI.

Свежий iOS simulator XCTest52/52 PASS. Owned iOS607/607lines794/794branches198/198functions. Включены все четыре executable implementation files, включая AppDelegate; исключений трудных UI/native файлов нет. Tests выполняют реальные bundled модели/все8presets, codecs, seams, отмену/фон/recovery и OS expiration, defaults/opt-outs, share cleanup, startup readiness/deadline/Reduce Motion. Clock1500ms начинается после attachment overlay; отдельный тест отклоняет прежний порядок. Предыдущий51-case run имел607/607lines793/794branches и не был принят как100%; добавлен корректный EMPTY journal recovery case.

Изолированное iOS workspace содержит тот же source snapshot: source-manifest и raw coverage сохранены в ignored artifacts/ios. Нормализация меняет только source paths worktree→root после exact SHA-256 сравнения; counters/files/denominators не менялись. Strict aggregate source-presence gate для C++/ObjC++ PASS.

## Повторение и ограничения

`npm test -- --runInBand --coverage`, `python3 scripts/check-js-coverage.py`; Gradle `:app:testCoverageUnitTest :app:nativeJvmCoverage -Pcoverage -Pci`; scripts/test-native-core.sh, test-recommendation-core.sh, test-recommendation-jni.sh; scripts/test-ios.sh. `npm run coverage:check` объединяет текущие отчёты и проверяет присутствие всех owned источников. Нулевые/отсутствующие/неполные denominators —failure. Пороги и owned-source exclusions не ослаблены.

Coverage/ и raw device/source evidence игнорируются Git. Unit coverage не является E2E, не оценивает качество рекомендаций на репрезентативном корпусе и не подтверждает физический Samsung/iPhone. Ранее описанные Samsung debug instrumentation/Maestro PASS относятся к своему исходному состоянию; финальная physical matrix отложена пользователем.
