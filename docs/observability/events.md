# Матрица событий

Статус: Android и iOS имеют нативные allowlists событий/параметров. Они являются фильтром передачи, а не доказательством доставки. Реальные product metrics и ограничения подсчёта описаны в [metrics.md](../product/metrics.md). Ниже фиксируются только имена и данные, уже присутствующие в реализации 0.8. Новые события или параметры этим документом не добавляются.

## Общие правила

- Analytics и Crashlytics запрашиваются отдельно и по умолчанию выключены. События Analytics разрешены только после сохранённого явного согласия версии 2 с включённой аналитикой. Старый `noticeSeen` — только флаг прежнего показа, не согласие.
- Remote Config не зависит от диагностического согласия и может применять локальные defaults/cache и получать config независимо. `remote_config_updated` — аналитическое событие и само по себе подчиняется Analytics opt-in.
- Android отключает Firebase automatic screen reporting и advertizing ID collection в manifest. iOS Info.plist отключает automatic screen reporting. Ручной `screen_view`/`screen_engagement` идёт из JS только для Home/Settings/Feedback при фокусе; время считается только в active foreground интервале.
- Матрица описывает custom events из app producers. Firebase SDK может иметь собственные автоматически собранные app/lifecycle signals после согласия; полный outbound event stream и SDK auto-collection нужно проверять конфигурацией Firebase и ingestion evidence, не выводить только из `Telemetry.event` allowlist.
- Android `Telemetry.kt` и iOS native boundary фильтруют имя события и набор ключей. Строки ограничены длиной и допустимым символами набором, числа должны быть конечными. Это глобальный allowlist полей, а не отдельная schema-проверка на каждом event.
- Не передавать изображения, preview/source URI, названия файлов, рабочие пути, текст feedback, адрес ответа, crash breadcrumbs с содержимым пользователя или постоянные пользовательские идентификаторы. `attempt_token` — контекст конкретной обработки для связки терминального события, не аккаунт/профиль пользователя.
- Не использовать содержимое Firebase automatic signals для расширения продуктовой телеметрии без отдельного одобрения и проверки disclosure.

## Android allowlist и producer matrix

| Event name | Текущие producer-параметры | Trigger / вопрос | Consent / TEST-ID |
|---|---|---|---|
| `screen_view` | `screen_name`, `screen_class`, короткий разрешённый event context | Focused экран открылся или вернулся в active; какие экраны открываются? | Analytics opt-in; `useTrackedScreen`; FEAT/TEST-804. |
| `screen_engagement` | `screen_name`, `engagement_ms`, разрешённый context | Экраны покидают/уходят из active; сколько foreground времени? | Analytics opt-in; blur/background/unmount; FEAT/TEST-804. |
| `ui_action` | `action` | Коды help/settings/privacy/licenses/очистки; какие вспомогательные действия используются? | Analytics opt-in; native allowlist + UI tests; TEST-804. |
| `image_import_started` | `source` | Native picker вызван; импорт начат? | Analytics opt-in; native telemetry tests; TEST-804. |
| `image_import_finished` | `source`, `status`, возможно `error_code` | Picker завершён: success/cancelled/error; импорт работает? | Analytics opt-in; native tests; TEST-804. Событие может отсутствовать при process/OEM termination. |
| `profile_picker_opened` | `profile_id` | Пользователь открыл список пресетов; какие режимы рассматривают? | Analytics opt-in; UI producer/Jest; TEST-801. |
| `profile_preview_interacted` | `profile_id`, `action` | Интеракция с примером режима; какие preview просматривают? | Analytics opt-in; UI producer/Jest; TEST-801. |
| `profile_selected` | `profile_id`, `previous_profile` | Пользователь явно выбрал preset; как распределены выборы? | Analytics opt-in; TEST-801; без inference о рекомендации/качестве. |
| `processing_options_changed` | `profile_id`, `speed`, `scale` и UI-контекст, если есть | Настройки обработки изменились; какие параметры выбирают? | Analytics opt-in; разрешённые поля; TEST-801/802. |
| `preparation_decision` | `profile_id`, `scale`, `status` (`confirmed`/`declined`) | Подготовка большой копии подтверждена/отклонена; нужен ли диалог? | Analytics opt-in; TEST-802; отдельное от recommendation. |
| `job_started` | `attempt_token`, `profile_id`, `speed`, `scale`, `backend`, `size_bucket`, `model_version`, `phase` | Явная native обработка началась | Analytics opt-in; `jobContext`, native tests; TEST-804. |
| `job_backend_changed` | Контекст задачи, `previous_backend`, `error_code` | Android GPU fallback на CPU | Analytics opt-in; Android only. |
| `job_finished` | Контекст задачи, `status`, `duration_ms`, `error_code` | Терминальное состояние success/error/cancelled/interrupted/time_limit | Analytics opt-in; один раз на `attempt_token`, native tests; TEST-804. |
| `result_viewed` | Контекст завершённой задачи | Результат показан; сколько задач достигли результата? | Analytics opt-in; JS Home producer/Jest. |
| `comparison_used` | Контекст задачи, `action` (`before`/`after`/`compare`/`divider`) | Пользователь сравнивал результат | Analytics opt-in; UI producer/Jest. |
| `export_finished` | Контекст задачи, `format`, `status`, возможно `error_code` | Экспорт завершён или уже сохранён | Analytics opt-in; native tests. |
| `share_opened` | Контекст задачи, `format`, `status` | System share sheet успешно открыт | Analytics opt-in; native tests. |
| `review_prompt_requested` | Контекст задачи | Native Play review flow запрошен после подходящего успешного действия | Analytics opt-in; не означает, что Play показал prompt. |
| `review_rating_selected` | В Android allowlist есть `rating` | Историческое имя/ключ остаётся совместимым | Не является актуальным UI flow: звёзды не спрашиваются и не фильтруют системный review. |
| `review_submitted`, `review_dismissed`, `play_redirect_finished` | Только технический статус/route, если конкретный producer его передаёт | Возможный итог review transition | Наличие в allowlist не означает, что Play раскрывает фактическую отправку отзыва. |
| `feedback_opened` | Разрешённый screen/context | Открылась форма поддержки | Analytics opt-in; без email/message. |
| `feedback_send_finished` | `status` (`success`/`error`), безопасный контекст | Отправка формы завершена | Analytics opt-in; текст, reply email и request ID исключены. |
| `settings_changed` | `setting`, `value` | Язык/тема/формат/cache limit/telemetry selection изменились | Analytics opt-in; значения короткие и allowlisted. Не трактовать как user identity. |
| `remote_config_updated` | `source`, `status`, `enabled_count` | Availability snapshot применён или обновлён | Fetch/apply не требует согласия; отправка данного event требует Analytics opt-in. |

Глобальный Android field allowlist: `screen_name`, `screen_class`, `action`, `source`, `status`, `profile_id`, `previous_profile`, `speed`, `scale`, `backend`, `previous_backend`, `size_bucket`, `model_version`, `phase`, `error_code`, `attempt_token`, `format`, `rating`, `route`, `setting`, `value`, `duration_ms`, `engagement_ms`, `enabled_count`. На практике параметр дополнительно должен появиться в конкретном producer event, чтобы попасть в событие.

## Platform parity и доказательства

iOS native allowlist в `PixoraUpscale.mm` пока отличается: не принимает `job_backend_changed`, `review_prompt_requested`, `review_rating_selected`, `play_redirect_finished`, `previous_backend` и `rating`. Поэтому отчётность по review request и Android GPU fallback платформенно различается. Перед сравнением событий обновлять parity только вместе с продуктовым решением и тестами; не заполнять пропуски новыми событиями автоматически.

Кодовые проверки: `android/app/src/test/java/dev/kigya/pixora/TelemetryTest.kt` и JS Jest suites. Они проверяют local boundary/producer behavior, не доставку до Firebase. Реальный DebugView/ingestion, consent upgrade/revoke и Crashlytics runtime должны отмечаться только по актуальному build/device evidence; исторический QA другого релиза не является доказательством для 0.8.
