# Сборки0.8.0

Действующее указание ADR-814: автоматические проверки и исправления разрешены. Новая установка и UI на Samsung отложены. Сборка/подпись не являются runtime приёмкой или публикацией.

## Финальный Android release-mode — PASS

Gradle MCP b52: `:app:assembleRelease :app:bundleRelease -Pci -PlocalTestSigning`, SUCCESS2m15s. Обычный release, R8/resource shrinking off, без firebaseDiagnostics/coverage. Локальная тестовая подпись для проверки, не финальная store signing. aapt: dev.kigya.pixora0.8.0/code10,min29,target36. Пакет debug отдельный .debug.

- APK `artifacts/Pixora-0.8.0-automatic-acceptance.apk`:181001837bytes, SHA-256 `67f77d759358edcaa9c36e3f4f8ed8398b1df8a8a46295b15601e5b29ac1343f`.
- AAB `artifacts/Pixora-0.8.0-automatic-acceptance.aab`:193596864bytes, SHA-256 `50ff8e941123337cf578fdb5d7f581c3251127337a2e8456d5d570790a1f685d`.

НЕ установлены по указанию пользователя. Изменения перед этой сборкой: Android cleanup closure для зарегистрированной View/listener пары и полные автоматические проверки. b51 Kotlin111/111 и strict aggregate coverage/source-presence PASS. Raw logs/metadata —ignored local evidence. Все Gradle операции выполнялись через Gradle MCP.

## Финальный iOS generic-device Release — PASS

`IOS_DERIVED_DATA_PATH=artifacts/ios/DeviceDerivedData bash scripts/build-ios.sh`: exit0. Xcode26.6/iOS26.5 SDK; LC_BUILD_VERSION platformIOS, arm64,min15.1. dev.kigya.pixora0.8.0(10). Артефакты `artifacts/ios/DeviceRelease/Pixora.app` и Pixora.app.dSYM. Binary SHA-256 `3f3afec8d838e25ac93a1eb6bd4d54cc7eae7afc9926a0cff1910438b42bc628`. codesign подтверждает полное отсутствие подписи; test-hook/fishhook/__llvm_profile symbols отсутствуют.

Сборка выполнена после стабильного52/52XCTest и607/607lines794/794branches. ROOT source manifest повторно сверён по bytes после Release. Raw log, metadata и coverage mapping сохранены в ignored artifacts/ios; agent-reports/ios-port.md содержит пределы. Unsigned generic-device build не доказывает физический iPhone/Store install или Firebase ingestion.

## Toolchain и воспроизводимость

Bare RN0.87.1/React19.2.3, Node22.23.2/JDK21, lockfiles. CLI20.2.0 опубликован в npm; недоступный20.3.0 был исправлен до финальных проверок. Bundled модели и hashes подтверждены. iOS pinned dependencies/locks: scripts/setup-ios.py, ios/Podfile.lock, scripts/ios-project/Package.resolved. CI использует -Pci без production credentials; final signing/GitHub Release/stores отдельным workflow.

Gradle MCP process не находил bare node в b45/b46. Локальные абсолютные command-path overrides5dependency scripts и init script исправили окружение без изменения версий/логики; после всех Gradle запусков файлы восстановлены до исходных SHA-256. Global files не создавались. CI получает Node через setup-node и не зависит от этих локальных overrides.

## История и граница физического доказательства

b44 normal release был установлен для ручного review; пользователь принял остальные функции. APK SHA-256 `40fe94c818944ab1ff0151ffa05aea890f157a62a13d014d77e3ba6a7f7828f1`. После требования splash1500 b47 normal release собран без установки: APK SHA `84cd89de20fcec578b4212d7729b54a4142b18d2b052e6d40d619396b44a23af`. Текущий b52 включает lifecycle cleanup и не получает старые физические PASS по наследству.

QA-only diagnostic variants ранее собраны b43, symbols uploaded; normal variants защищены guard от firebaseDiagnostics (намеренный b40 отказ). Предыдущие diagnostics/coverage APK не подменяют текущий normal release. Исторические0.6/0.7benchmarks не доказывают производительность0.8. Все актуальные физические ограничения описаны в device-report.md.

## Корректирующая 0.8.1 / code 11 — Android PASS

b55 normal assembleRelease/bundleRelease: SUCCESS, 3m22s, без firebaseDiagnostics/coverage, R8 off, локальная тестовая подпись. aapt подтвердил dev.kigya.pixora, 0.8.1/code11, min29/target36.

- APK `artifacts/Pixora-0.8.1-automatic-acceptance.apk`: 181001837 bytes; SHA-256 `6687c8239a27858b0a5d7f43ae51c290c08cc7ddd43db6322a2ce1b317219123`.
- AAB `artifacts/Pixora-0.8.1-automatic-acceptance.aab`: 193596874 bytes; SHA-256 `333b177dab37ee91adb75c347a3fdc409eb527232666c299e076240ba542dddd`.

Новые артефакты НЕ установлены. b54: 111/111 unit tests, 1062/1062 lines и 1106/1106 branches, source-presence PASS. b53 остановился до тестов из-за локального npx lookup; исправление locked CLI command в settings.gradle прошло ревью и b54/b55. После всех Gradle запусков пять временных dependency command-path overrides восстановлены до исходных hashes.

Main CI 0.8.0 failed из-за JDK action/lockfile, несмотря на локальные 0.8.0 builds; исправления и новые доказательства 0.8.1 не стирают тот результат. iOS final 0.8.1 proof фиксируется после version fallback alignment.

## Финальный iOS 0.8.1 / build 11 — PASS

После alignment обоих native version fallbacks повторены 52/52 XCTest со строгими 607/607 lines и 794/794 branches, затем serial unsigned generic-device Release: exit0. Bundle dev.kigya.pixora 0.8.1(11), arm64, min15.1, platformIOS/SDK26.5. Binary SHA-256 `ed77cfd255a61d66b2eee8a2719f8202c9e9dac5a15ce2d50bddb40fd1c3ad19`.

Фактические app/dSYM: `artifacts/ios/DeviceRelease-0.8.1/`. Versioned metadata/log: device-release-0.8.1-metadata.json и device-release-0.8.1.log. codesign подтверждает отсутствие подписи; test-hook/fishhook/__llvm_profile symbols отсутствуют. Все 37 source/config hashes повторно совпали с ROOT после сборки. Первичный interrupted build и прежние 0.8.0 доказательства сохранены отдельно; они не подменяют этот PASS. Физического iPhone/Samsung теста из этого результата не следует.
