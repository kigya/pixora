# Продуктовые и технические метрики

Статус 0.8.0: приведённые ниже метрики определены по существующим Android/iOS native allowlists и событиям текущего кода. Это способы агрегировать события после получения Analytics-согласия, а не уже полученные результаты. Значения, цели, спрос и выручка не измерены этим документом.

## Сбор и ограничения данных

- Analytics и Crashlytics — независимые добровольные переключатели, оба выключены до актуального выбора согласия версии 2. События Analytics записываются только при включённом Analytics. Отказ от Crashlytics не включает и не выключает Analytics.
- Remote Config остаётся независим от диагностического согласия: локальные defaults/cache и fetch могут работать отдельно. Событие `remote_config_updated`, если оно отправляется в Analytics, подчиняется Analytics-согласию и не является условием работы Remote Config.
- Native telemetry boundary принимает лишь текущие allowlisted event names и общие allowlisted fields, сохраняет только конечные числа или короткие строки с ограниченным набором символов. Изображения, image URI, file/path, имя файла, email, сообщение поддержки и содержимое изображения не являются допустимыми параметрами. Поле `rating` осталось в Android allowlist для совместимости, но интерфейс не запрашивает личные звёзды.
- Android и iOS allowlists не полностью совпадают. На iOS в текущем исходнике нет `job_backend_changed`, `review_prompt_requested`, `review_rating_selected`, `play_redirect_finished`, а также полей `previous_backend` и `rating`. Перед сравнением платформ проверять фактические схемы их native boundary; не интерпретировать отсутствие iOS события как нулевое использование.
- Рекомендация и классификация изображений не отправляются в телеметрию. Нет события типа изображения/рекомендации, результата эвристики или принятия рекомендованного профиля. `profile_selected` показывает только явный выбор режима пользователем; `preparation_decision` относится к диалогу уменьшения большой копии.

## Существующие события

События перечислены в native allowlist (`android/app/src/main/java/dev/kigya/pixora/Telemetry.kt` и `ios/Native/PixoraUpscale.mm`). Наличие имени в allowlist не означает, что каждый сценарий в каждой платформе уже генерирует его или что данные доставлены в Firebase.

| Имя | Смысл и разрешённые в producer-потоке данные | Продуктовый вопрос |
|---|---|---|
| `screen_view`, `screen_engagement` | Название/класс экрана; длительность только focused foreground time. Автоматический screen reporting выключен в Android manifest и iOS Info.plist; JS отслеживает Home/Settings/Feedback. | Какие основные экраны открываются и сколько активного времени на них проводят? Не считать background time и не суммировать повторный автоматический screen view. |
| `ui_action` | Короткий код действия (например, открыть settings/help/privacy/licenses или очистить данные). | Пользуются ли опциональной справкой и системными настройками? |
| `image_import_started`, `image_import_finished` | Источник picker и статус success/cancelled/error, иногда код ошибки. Нет имени/формата пути или URI. | Завершается ли выбор и импорт без ошибки? |
| `profile_picker_opened`, `profile_preview_interacted`, `profile_selected` | Текущий/выбранный публичный `profile_id`, `previous_profile`, тип действия preview. | Какие пресеты просматривают и выбирают? Это не оценка качества и не доказательство полезности рекомендаций. |
| `processing_options_changed`, `preparation_decision` | Код настройки режима/масштаба/скорости и confirmed/declined для подготовки. | Какие режимы/масштабы настраивают; нужна ли подготовка до начала? |
| `job_started`, `job_finished`, `job_backend_changed` | Публичные профиль, скорость, масштаб, backend, фаза/код ошибки, размерный bucket и длительность, где реализация это поддерживает. `attempt_token` используется только как контекст конкретной задачи/дедупликации. | Сколько задач завершается успешно/ошибкой/отменой/прерыванием; как часто Android переключает GPU→CPU; как длительность зависит от конфигурации? |
| `result_viewed`, `comparison_used` | Контекст задачи и действие сравнения `before`/`after`/`compare`/`divider`. | Сколько завершённых результатов просматривают и сравнивают? |
| `export_finished`, `share_opened` | Формат и результат действия (success/error/already_saved). | Удаётся ли сохранить/поделиться результатом и какие форматы используют? |
| `review_prompt_requested`, `review_prompt_shown`, `review_submitted`, `review_dismissed`, `play_redirect_finished` | Только технический итог запроса/показа/перехода, если SDK/платформа предоставляет его. Вызов системного review API не доказывает, что диалог реально показан или что отзыв оставлен. | Проходит ли UX-переход до системного API? Не вычислять по нему публичный рейтинг. |
| `feedback_opened`, `feedback_send_finished` | Статус send и разрешённый контекст экрана. Не email, сообщение, idempotency token или содержание письма. | Сколько пользователей открывает форму и заканчивает отправку? Не анализировать содержимое отзывов через Analytics. |
| `settings_changed` | Тип настройки и короткое новое значение для языка/темы/формата/cache-limit/согласия. | Какие настройки меняют? Согласия анализировать только агрегированно и с учётом добровольности. |
| `remote_config_updated` | Источник, статус применения, число включённых режимов. Значения параметров и текст Remote Config не публикуются как события. | Сработало ли обновление доступности режимов? Отдельно от согласия на диагностику. |

Android в коде разрешает события: `screen_view`, `screen_engagement`, `ui_action`, `image_import_started`, `image_import_finished`, `profile_picker_opened`, `profile_preview_interacted`, `profile_selected`, `processing_options_changed`, `preparation_decision`, `job_started`, `job_backend_changed`, `job_finished`, `result_viewed`, `comparison_used`, `export_finished`, `share_opened`, `review_prompt_requested`, `review_rating_selected`, `review_submitted`, `review_dismissed`, `play_redirect_finished`, `feedback_opened`, `feedback_send_finished`, `settings_changed`, `remote_config_updated`. `review_rating_selected` оставлен только в allowlist и не соответствует текущему нейтральному flow; не считать его рабочей метрикой.

## Производные метрики

Все формулы рассчитываются только из разрешённых событий с Analytics-согласием. Период и разрез должны указываться в отчёте. Не применять общий пользовательский denominator, если событие не позволяет его надёжно построить.

| Метрика | Определение | Ограничение интерпретации |
|---|---|---|
| Успешный импорт | `image_import_finished(status=success)` / все terminal import results со статусом success/error/cancelled | Не включает выбор, для которого native не отправил terminal event; не равно числу активных пользователей. |
| Успех AI-задачи | `job_finished(status=success)` / `job_finished` со всеми terminal status, по `attempt_token` | Принудительно остановленная ОС задача может не отправить событие; сравнивать только известные platform/event paths. |
| Длительность успешной задачи | Медиана `duration_ms` у `job_finished(status=success)`; отдельно по доступным profile/speed/scale/size bucket | Это native elapsed time, не скорость на универсальном устройстве и не оценка воспринимаемого качества. Размерный bucket имеется не во всех платформенных payloads. |
| Распределение выбранных профилей | Доли `profile_selected` по `profile_id`; по возможности отделять текущий выбор от предыдущего | Не содержит рекомендации и не показывает, помогла ли рекомендация. |
| Успех экспорта | `export_finished(status=success)` / все export terminal statuses, по format | `already_saved` — повторный запрос к существующему файлу, а не новая запись. |
| Сравнение результата | Число `comparison_used` по action на фоне `result_viewed` | События показывают действие, а не удовлетворённость или визуальную точность. |
| Взаимодействие с поддержкой | число `feedback_send_finished(status=success/error)` и `feedback_opened` | Не собирать/сегментировать по тексту, адресу ответа или содержимому почты. |
| Время экрана | сумма/медиана `screen_engagement.engagement_ms` по `screen_name` | Только foreground/focused интервал. Прерывания процесса могут обрезать интервал. |

MAU/retention, market demand, user-level journey, качество увеличения, конверсия в выручку и финансовые показатели не определены этими событиями. Не выводить их из количества событий. Не задавать target без отдельного решения и проверяемого источника.

## Проверки и статус

Схема разрешённых Android-полей/событий проверяется в `android/app/src/test/java/dev/kigya/pixora/TelemetryTest.kt`; JS вызовы покрываются существующими Jest suites. Эти тесты подтверждают локальную обработку кода, не Firebase ingestion. В актуальном 0.8 handoff реальная доставка событий, Crashlytics QA, upgrade/revoke на установленном APK и cross-platform event parity должны подтверждаться отдельными quality/observability evidence; исторические результаты 0.7 не переносить автоматически.
