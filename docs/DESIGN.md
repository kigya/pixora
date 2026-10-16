# Дизайн реализации

Дата проверки: 07.10.2026. Использованы только публично доступные страницы. Код интерфейса, SVG-иконки и декоративная карточка написаны для React Native; сторонние TSX, графика и web-runtime не перенесены.

| Бесплатный источник | Использованный паттерн |
|---|---|
| [21st.dev](https://21st.dev/) | Акцентная карточка, мягкий декоративный градиент и крупное основное действие |
| [shadcn Button](https://ui.shadcn.com/docs/components/base/button) | Иерархия primary/secondary и disabled-состояния |
| [Aceternity Compare](https://ui.aceternity.com/components/compare) | Два изображения в одинаковых границах с draggable разделителем |
| [Origin → coss ui](https://coss.com/ui) | Простые сгруппированные настройки и сегментированный выбор |

Compare дополнен доступными кнопками «До / Сравнение / После», поэтому drag не обязателен. Используются View/Text/Pressable/Image/PanResponder/SVG, без DOM и WebView. Один стек вместо desktop-sidebar. PRD-токены: тёмный фон, фиолетовое действие, cyan только для декора; касания минимум48dp, системный шрифт масштабируется. Статический градиент не конкурирует с inference.

Закрытые экраны Mobbin/Refero, платные шаблоны и MCP не использовались и не заявляются просмотренными. Остальные перечисленные в PRD каталоги — допустимые дополнительные источники, не обязательные зависимости. Runtime-лицензии включены в локальный экран приложения; визуальные паттерны реализованы оригинальным кодом.

Обновление 0.2 (08.10.2026): самостоятельное название Upselora: AI Photo Upscaler, оригинальный знак изображения и двух стрелок увеличения в Android vector/adaptive/monochrome. Не используется копия бренда конкурента. Темы system/light/dark, палитры в src/ui/theme.tsx; собственные Modal-диалоги используют те же токены. Короткая анимация нажатия Reanimated с ReduceMotion.System. Превью и управление в двух колонках от 840dp, один столбец при большом шрифте, безопасная область для сгиба. Уведомления предлагаются необязательно в обработке. Пояснения описывают реальные этапы и бесплатную локальную обработку.

AndroidX WindowManager 1.5.1 выбран по [официальному списку версий](https://developer.android.com/jetpack/androidx/releases/window). Русские тексты следуют принципам простого языка; приложение не заявляет формальное соответствие русских строк ASD-STE100.


Обновление 0.3 (08.10.2026):
- [shadcn Alert](https://ui.shadcn.com/docs/components/base/alert): композиция иконки, заголовка, описания и необязательного действия. [Preline Alerts](https://preline.co/docs/components/alerts.html): нейтральная рамка и тематическая поверхность. Реализованы оригинальным React Native кодом, без web-зависимостей.
- Убраны повторные преимущества; справка из трёх смысловых секций с одной кнопкой. Одна информационная карточка фона, фиолетовая иконка, обычный текст в обеих темах.
- Языковой picker: нижняя прокручиваемая панель на телефоне, центрированное окно до 480 dp в широком окне. Названия языков всегда на собственном языке; флаги декоративные. Арабские строки и навигация RTL; область сравнения и числа остаются LTR.
- Twemoji country flags by Twitter, Inc. and contributors, maintained by jdecked, [CC BY 4.0](https://github.com/jdecked/twemoji/blob/main/LICENSE-GRAPHICS). Оригинальные SVG paths без изменений; уменьшены только размеры отображения. Фиксированный commit и SHA-256 в assets/flags/manifest.json. Полный текст лицензии и атрибуция встроены в LEGAL.txt; сети для флагов не требуется.

## 0.5: контекст и профили

Вместо AI-лейбла — короткое приглашение выбрать изображение для улучшения деталей. Превью имеет собственные пропорции, без чёрных полей. Радиопрофили используют нейтральные карточки, реальные пары до/после и одну подпись назначения; иерархия и выбор продолжают паттерны [shadcn](https://ui.shadcn.com/docs/components/radio-group) и [Preline](https://preline.co/docs/components/cards.html), реализованы нативно. Feedback использует обычные поля, понятное описание отправляемых данных, необязательные звёзды и один основной action. Не перенесены чужие изображения/код из Upscayl. Фотографии примеров: Hannes Röst, CC BY-SA 3.0; иллюстрация и pixel art созданы в проекте, CC0; точные атрибуции в assets/profiles/LICENSE.md и встроенном LEGAL.txt.


## Pixora 0.6

Preset picker uses original symbolic SVG landscapes, line art and pixel blocks instead of demonstration outputs. No external sample images are bundled in the picker. Source links live in PRESETS.md. Processing overlay uses app purple/cyan tokens, three-second transform-only scan and static frame fallback; no third-party animation graphics or copied product code.

### Processing overlay: Android updates

Reanimated 4.7.1 uses `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` for transform/opacity. This avoids a ShadowTree layout commit on every scan frame. The decorative overlay has `pointerEvents="none"` and contains no controls; animated touch hit-testing does not apply to it. Source: [Reanimated performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/) and [feature flags](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/). The change passed the Android 11 ARM64 emulator and Xiaomi Android 15 UI tests. The scan is an explicitly bounded 80 dp SVG inside an unflattened clipped view. A three-run Lite comparison measured −0.72% median pipeline time with the animation; this is normal measurement variation, within the +5% budget.

## 0.7 — композиция обработки и интерактивные примеры

[shadcn Progress](https://ui.shadcn.com/docs/components/base/progress) задаёт связь реального значения и подписи. В Pixora показатель представлен кольцом, двумя временными карточками и отдельным backend-бейджем. [Preline Stepper](https://preline.co/docs/components/stepper.html) — источник последовательности трёх стадий с иконками. Состояния берутся из нативного pipeline; количество тайлов не дублируется текстом.

[Aceternity Compare](https://ui.aceternity.com/components/compare) — композиционный источник разделителя примеров. Реализация собственная, React Native/RNGH/Reanimated, без веб-зависимостей. Пользователь предоставил пары из Downloads; исходники и хеши записаны в `assets/presets/manifest.json`. Подпись «Пример обработки» не обещает совпадение с результатом встроенной модели. Сравнение отделено от выбора режима.

Слайдер хранения имеет дорожку, пять отметок, подпись выбранного значения и непрерывный UI-жест. Сохранение происходит после отпускания, переход к отметке — 180 мс; RTL зеркально меняет направление, Reduce Motion использует системную настройку Reanimated. Матрица визуальной проверки текущего выпуска находится в VALIDATION-0.7.md.
