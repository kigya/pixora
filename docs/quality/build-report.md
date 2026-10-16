# Сборки 0.8.0

Последнее указание16.10.2026: пользователь сообщил об успешной самостоятельной проверке и остановил дальнейшие тесты приложения. Последние UI/defaults/shared-engine правки не тестировались; предыдущие PASS относятся к прежним исходникам. Выполняется только normal release сборка/установка для ручного подтверждения.

Текущий технический результат, ещё не финальная приёмка:

- Android debug APK dev.kigya.pixora.debug/code10 построен из интегрированного release-base с acceptance changes (Gradle b16 достиг packageDebug; общий запуск упал на затем исправленном React context в instrumentation). APK установлен на физический Samsung и прошёл первый реальный UI/inference/export сценарий. Финальная чистая assembleDebug после всех merge обязательна.
- Android coverage app + test APK: Gradle b19 `:app:assembleCoverage :app:assembleCoverageAndroidTest -Pcoverage -Pci` SUCCESS. Coverage-артефакт не является release QA.
- Полный Kotlin JVM набор: b39 `:app:testCoverageUnitTest :app:nativeJvmCoverage -Pcoverage -Pci` SUCCESS,106/106. Строгий Kotlin gate1039/1039lines и1096/1096branches пройден, source presence всех owned Kotlin проверено.
- iOS: unsigned generic-device Release собран Xcode26.6/iOS26.5 SDK; восемь simulator XCTest с настоящими моделями прошли. iOS branch ещё не merged, расширенные тесты/RTTI fix/Ruby upgrade требуют повторной интегрированной сборки.
- Android release APK/AAB после0.8 интеграции пока pending. Public CI использует -Pci без production credentials и uploads; локальный -PlocalTestSigning предназначен только для Samsung release-mode QA. Финальная подпись отдельным release workflow.

Pinned Node22/JDK21, RN0.87.1. Все Gradle запуски в рабочем процессе выполняются через Gradle MCP; команды выше описывают task arguments для повторения. Общие gate scripts в репозитории совпадают с CI. Финальные build paths/SHA-256/commit и ссылки на текущий main CI будут записаны после последнего стабильного прогона. Исторические0.6/0.7 замеры не являются доказательством0.8.

Node22: чистый `npm ci` повторён с опубликованным RN Community CLI20.2.0 (все три CLI-пакета согласованы в manifest/lock). Прежний20.3.0 не доступен в официальном npm registry (tarball404), поэтому pin исправлен без изменения RN0.87.1/React19.2.3. TypeScript PASS; ESLint0errors/88warnings; повторный Jest166/166 PASS,100% всех четырёх owned JS metrics. Первый повтор после чистой установки получил один5sec timeout при параллельной нагрузке, повтор без изменения тестов прошёл.

Диагностические QA варианты: b36 assembleDiagnosticsDebug SUCCESS (b34 отдельно собрал assembleDiagnostics; общий b34 остановился на неверной debug Firebase registration path, исправлено). Diagnostics имеет debuggable=false и release runtime, DiagnosticsDebug наследует debug. b38 generate/uploadCrashlyticsSymbolFileDiagnostics и DiagnosticsDebug SUCCESS для соответствующих native libraries. Это подтверждает загрузку символов, а не получение crash report. Обычные APK/AAB с -PfirebaseDiagnostics блокируются отдельным guard; финальные normal release builds выполняются без этого свойства.

Негативная проверка guard: b40 `assembleRelease -PfirebaseDiagnostics -Pci --dry-run` намеренно отклонён до исполнения задач с сообщением «firebaseDiagnostics may only package diagnostics variants». Поэтому QA JS entrypoint не может попасть в обычный APK/AAB при ошибочном совмещении свойств.

Диагностическая сборка b43 завершилась SUCCESS (13m49s), APK и symbols обоих вариантов построены после исправления CMake ABI. Последующие runtime-проверки остановлены по указанию пользователя. Эти диагностические APK не являются финальной устанавливаемой сборкой. Normal release APK/AAB b44 строятся без firebaseDiagnostics/coverage.

Normal release b44 SUCCESS: assembleRelease + bundleRelease, 1m39s, 0tests. Исходное приложение соответствует integration8bdb816 (PR9+PR10); последующие изменения только tooling/docs. APK artifacts/Pixora-0.8.0-samsung-review.apk, SHA-25640fe94c818944ab1ff0151ffa05aea890f157a62a13d014d77e3ba6a7f7828f1,181001228bytes. AAB artifacts/Pixora-0.8.0-samsung-review.aab, SHA-256d500946e984e75a36e009735b97a15568dc3df715fe4a5c9e720ee8405861698,193594012bytes. Package dev.kigya.pixora,0.8.0/code10,min29,target36. Локальная тестовая подпись; это не финальный store artifact. Runtime проверки этих последних правок не выполнялись.

Упакованная иконка запуска: aapt resources сопоставил drawable/ic_splash_animated с res/30.xml и animator/splash_logo_pulse с res/fB.xml. xmltree подтверждает animated-vector target logo и три objectAnimator scaleX/scaleY/rotation по600ms. Это инспекция APK-ресурсов, а не runtime-проверка анимации на устройстве.
