# Архитектура

Существующая база: Bare RN 0.87.1 / React19 / TS / Hermes; Android Kotlin TurboModule + foreground service + JNI/C++/ncnn. Полные изображения не передаются в JS. Веса встроены, источники и SHA-256 сохранены.

0.8.0: общие C++ primitives и recommendation policy; Objective-C++ iOS TurboModule, ncnn CPU и limited background. JS получает небольшие typed snapshots/URI и рекомендацию. Consent и native startup gate отделены от Remote Config.

Источники: основной PRD и согласованный план пользователя; детали интерфейсов фиксируются с реализацией.
