# Совместимость и платформы

Статус 0.8.0: исходный код и build-конфигурации обеих платформ существуют; итоговая приёмка релиза ещё продолжается. Версия React Native и Android minima подтверждаются текущим checkout. iOS deployment target взят из iOS worktree проекта; ни один минимум сам по себе не доказывает совместимость на физическом устройстве.

## Зафиксированные build targets

| Платформа | Минимум / target | Техническая основа | Статус проверки |
|---|---|---|---|
| Android | `minSdkVersion 29` (Android 10); compile/target SDK 36; ABI `arm64-v8a`; нативная проверка общей RAM ≥3.5 GiB (приблизительно класс устройств 4 GB) | `android/build.gradle`, `android/app/build.gradle`, `UpscaleModule.kt`. Debug/release version 0.8.0, code 10. Release R8/minification и resource shrinking выключены по решению 0.8. | Физическая приёмка назначена на Samsung SM-S916B, Android 16/API 36. Устройство установлено, но по текущему [device report](../quality/device-report.md) UI-проверки ожидают разблокировки; debug/release gates остаются pending. |
| iOS | Deployment target 15.1; приложение дополнительно проверяет физическую память устройства ≥3.5 GiB. Inference выполняется на CPU. | В текущем iOS implementation worktree `ios/Pixora.xcodeproj` задаёт `IPHONEOS_DEPLOYMENT_TARGET = 15.1`; `PixoraUpscale.mm` проверяет `NSProcessInfo.physicalMemory` и использует CPU backend. | Physical iPhone/iPad validation не подтверждена. Наличие проекта/симуляторной или компиляторной проверки не доказывает длительный inference, экспорт и фон на реальном устройстве. |

Минимум Android задан `minSdkVersion`, а app-level gate отдельно требует 64-битный ARM и порог памяти. iOS project target задаёт нижнюю версию ОС; явная runtime memory gate в коде использует порог 3.5 GiB, а отдельной проверки модели устройства/ARM ABI в этом коде нет. Порог памяти является инженерным guardrail, не обещанием производительности или совместимости на всём рынке устройств.

## Общий стек

- Bare React Native 0.87.1, React 19.2.3, TypeScript 6.x, Hermes; Node.js не ниже 22.11, JDK 21 для зафиксированного Android toolchain.
- Android: compile/target SDK 36, NDK 27.1.12297006, CMake 3.22.1, Kotlin native module, JNI/C++ и ncnn. Веса поставляются локально; inference не отправляет изображения в сеть.
- iOS: Objective-C++ native module, общие C++/ncnn assets с CPU inference. Нативная фоновая работа ограничена iOS background execution; expiration прерывает текущий job, UI позволяет запустить обработку заново.
- Общие зависимости включают React Navigation 7, Reanimated 4, Gesture Handler 3, Safe Area Context, Screens и SVG. Не добавлять Expo или web-only замену.

## Различия поведения ОС

| Возможность | Android | iOS |
|---|---|---|
| Выбор изображения | системный photo/document picker; единственный файл; приложение получает копию во внутреннее рабочее хранилище | `PHPickerViewController`; единственный файл; выбранный файл копируется в private app storage |
| Длительная обработка | foreground service; API 35+ использует media processing service type, старые версии — data sync type; уведомление поддерживает прогресс и отмену | ограниченная background task; при expiration обработка прерывается и запускается заново вручную; completion notification не является постоянным progress/cancel service |
| Выбор локали | manual locale хранится отдельно от системного; для `system` используется язык системы | iOS native locale sync применяет выбранный язык или возвращает системный список языков |
| Диагностика | Analytics и Crashlytics имеют независимые opt-in, по умолчанию выключены; SDK preferences сверяются до FirebaseApp init; Remote Config отдельно | независимые переключатели аналитики и Crashlytics; remote config не является согласием на диагностику |

Системные требования к изображениям, форматам и памяти приведены в [основном PRD](../PRD.md). Ошибки UI используют нейтральные к платформе строки: фактическое ограничение ОС/памяти описано выше и не кодируется в тексте Android-only.

## Проверено и пока неизвестно

- Автоматические проверки и source coverage не заменяют физическое устройство. Текущий физический gate — Samsung SM-S916B (пользователь заменил прежнюю Xiaomi); реальный сценарий debug и отдельный release install должны быть подтверждены каждый по своему отчёту.
- Нет подтверждения физического iPhone/iPad, iOS background expiration в реальной системе, термального поведения на продолжительной серии, всех Android API 29–35, OEM-specific battery controls, реального foldable/hinge и полного tablet landscape.
- Build target iOS 15.1 означает заявленный deployment minimum проекта, но не является результатом теста на iOS 15.1 hardware. RAM threshold также требует настоящего runtime/device validation.
- Android 16/API 36 — среда целевого Samsung gate, не доказательство покрытия всех API 36 устройств. Не extrapolate benchmark или успешную сборку на отсутствующие устройства.

Актуальный status выполнения и blockers поддерживает root в [device report](../quality/device-report.md); этот документ не меняет acceptance result.
