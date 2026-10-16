# Правила разработки

Skills установлены локально в `.agents/skills`, исходные commit SHA — в `sources.json`. Они доступны следующим агентам через инструкции `AGENTS.md`. Сеть для чтения правил не нужна.

| Источник | Применение |
|---|---|
| Callstack react-native-best-practices | Измерить → изменить → повторно измерить; Hermes, ресурсы, native bridge |
| Callstack react-navigation | Существующий dynamic native stack React Navigation7, safe areas |
| Callstack react-native-testing | RNTL14: await render/actions, пользовательские запросы и доступные роли |
| Vercel react-native-skills | Минимальное состояние, transform/opacity, нативная навигация, структура UI |

Проект bare React Native Android, Expo отсутствует. Expo Image/config plugins, iOS-only styling, web libraries, TV, monorepo и серверные deployment-правила не применяются. Общие рекомендации не требуют добавлять Expo/Nativewind/FlashList/state library в небольшой существующий продукт. Измеренный выигрыш важнее механического следования рецепту. PRD и инструкции пользователя имеют приоритет.

Структура: App только компонует providers/navigation; screens показывают состояния; application владеет подписками и пользовательскими операциями; domain содержит чистые расчёты; ui — единые компоненты/локализация; specs — Codegen contract. Kotlin service владеет lifetime/wake lock/notification, ImageProcessor — одной обработкой и буферами, C++ — inference.

Подписаться перед snapshot, игнорировать старые sequence, удалить listeners/timers при unmount. Удерживать блокировку повторного действия в ref до React commit. Не хранить производные значения в отдельном state. Не передавать пиксели/веса через JS. Новые runtime dependencies обосновывать; секреты и developer-only tooling не включать в APK.
