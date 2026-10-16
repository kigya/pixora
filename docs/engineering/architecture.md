# Архитектура

Существующая база: Bare RN 0.87.1 / React19 / TS / Hermes; Android Kotlin TurboModule + foreground service + JNI/C++/ncnn. Полные изображения не передаются в JS. Веса встроены, источники и SHA-256 сохранены.

0.8.0: общие C++ primitives и recommendation policy; Objective-C++ iOS TurboModule, ncnn CPU и limited background. JS получает небольшие typed snapshots/URI и рекомендацию. Независимые Analytics/Crashlytics settings применяются нативно на startup и отделены от Remote Config. По последнему выбору пользователя fresh/legacy unresolved defaults включены с уведомлением; явные сохранённые значения не перезаписываются. Общий native/engine используется Android JNI и iOS CPU; обработка остаётся локальной.

Источники: основной PRD и согласованный план пользователя; детали интерфейсов фиксируются с реализацией.
