# Архитектура реализации

`docs/PRD.md` — актуальный источник требований и поведения. Историческая спецификация сохранена в `docs/archive/PRD-1.2.md`. Исследование рынка не расширяет продукт. Изменения требований отражаются в PRD и памяти Serena `product/prd-mvp`.

## Владение состоянием

`SessionStore` — источник истины. Один AtomicFile JSON-журнал в app-private files; SharedPreferences для языка, формата и темы. `UpscaleModule` реализует Codegen TurboModule `NativeUpscaleSpec`. JS получает небольшие типизированные snapshots, URI превью и метаданные; полноразмерные пиксели и приватные пути в JS не передаются. Context/reducer отбрасывает snapshots с меньшим или равным sequence. Подписка устанавливается до чтения snapshot, возвращение Activity вызывает повторное согласование.

Импорт выполняется на отдельном executor. Потоково копируется выбранный URI с лимитом 50 MiB; содержимое определяет формат. APNG/animated WebP/GIF отвергаются; Bitmap bounds проверяются до декодирования. EXIF учитывает повороты и зеркальные варианты. Декодирование с inSampleSize ограничивает память, рабочий размер пропорционально ограничен 1024. Новый сеанс заменяет предыдущий только после успешного импорта. Создание рабочего файла для большого исходника требует действия подтверждения UI.

## Вычисление

Kotlin `ProcessingService` владеет задачей независимо от JS. Сервис запускается с видимой Activity по нажатию пользователя, foreground notification, mediaProcessing (API35+) / dataSync (API29–34), bounded wake lock. Один executor; отмена через атомарный JNI-флаг между тайлами. 30-минутный deadline запрашивает остановку; уже выполняющийся tile должен вернуться прежде, чем освобождаются буферы. Force-stop, reboot и убийство процесса не возобновляют задачу; незавершённый журнал на следующем старте становится INTERRUPTED.

`NativeEngine` загружает отдельную `libupscale.so`. CMake отдельно сохраняет RN default OnLoad/autolinking. ncnn статически линкуется с официальным Vulkan SDK; модели x4plus и general-x4v3 .param/.bin читаются через AssetManager. SHA-256 проверяется до запуска. Модель не грузится на пустом экране.

GPU выбирается после Vulkan availability и 8×8 self-test; контролируемая GPU-ошибка вызывает один CPU-перезапуск. CPU использует два потока. GPU tile128 / CPU64, padding 32 и crop по координатам; memory error — один повтор tile 32. Inference возвращает проверяемые коды, размеры и конечные числовые значения. RGB распрямляется из Android premultiplied alpha, alpha ресэмплируется отдельно, результат снова premultiplied. 2× получается из AI 4× с фильтрацией. В JS — только превью до 1536.

Прогресс учитывает тайлы, ограничен 4 событиями/сек и 1 уведомлением/сек. Inference не показывает окончательные 100%; запись результата имеет отдельный этап. Сервис освобождает модель/bitmap/wake lock после терминального состояния.

## Экспорт и хранение

Полный result.png хранится в текущем app-private сеансе. PNG сохраняет прозрачность; JPEG 95 композитится на белый фон. Bitmap export не переносит исходные EXIF/GPS. MediaStore записывает собственные новые файлы в Pictures/UpscaleImage с IS_PENDING до завершения. Экспорт одного формата идемпотентен, пока MediaStore URI существует. Sharesheet использует отдельный cache/share файл и FileProvider с read grant. Через 24 ч при следующем запуске временные share-файлы удаляются. Удаление сеанса не удаляет MediaStore.

Release manifest сохраняет INTERNET для явно отправляемого feedback и отключает backup. Нет токенов аккаунта, удалённых assets, boot receivers или модельных загрузчиков. Вычисления полностью локальные. Debug допускает Metro. Приватность и лицензии читаются локально.

## Структура

- `App.tsx`: композиция провайдеров и навигации.
- `src/application/`: сеанс, настройки, синхронная блокировка операций, обработка ошибок и запуск.
- `src/screens/`: рабочий экран и настройки.
- `src/navigation/`: типизированный стек и оформление переходов.
- `src/specs/NativeUpscale.ts`: Codegen контракт.
- `src/domain/session.ts`: согласование snapshots, геометрия, язык.
- `src/ui/`: темы, доступные компоненты, диалоги, сравнение и адаптивный макет.
- `src/locales/`: десять словарей и реестр языков — общий источник для JS и Android.
- `android/app/src/main/java/dev/kigya/pixora/`: Android функции, журнал, сервис, TurboModule.
- `android/app/src/main/cpp/engine/upscale.cpp`: JNI, ncnn, модель, отмена и метрики.
- `android/app/src/main/cpp/engine/pixels.cpp`: геометрия тайлов, RGB/alpha и сборка результата.
- `android/app/src/main/assets/`: встроенные модель/хеши/notices.
- `android/app/src/androidTest/`: настоящие device tests, без runtime test-backdoor.
- `scripts/`: проверка зависимостей, локальная подпись/сборка.

## Интерфейс 0.2 и нативные этапы

ThemeProvider поддерживает system/light/dark; нативная Activity использует согласованный DayNight. DialogProvider заменяет стандартные подтверждения, учитывает безопасную область и крупный шрифт. Workbench выбирает одну или две колонки; WindowManager сообщает разделяющий сгиб. Горизонтальный жест сравнения не перехватывает вертикальную прокрутку.

Уведомления необязательны и запрашиваются только отдельным действием. Их отсутствие не запрещает foreground service Android. Разрешённые уведомления дают видимый прогресс и действие отмены. Сервис передаёт реальные этапы подготовки, проверки устройства, загрузки модели, обработки частей, сборки и записи; процент относится к завершённым частям.

LLVM OpenMP из закреплённого ncnn SDK имеет риск аварии при ленивой инициализации topology одновременно с переводом Activity в фон на POCO C71. JNI_OnLoad задаёт отключённую привязку потоков и плоскую топологию, затем вызывает omp_get_num_places для завершения этой короткой инициализации до запуска сервисной задачи. Веса и GPU при этом не загружаются. Требование запуска пользователем из видимой Activity сохраняется. Регрессионный тест немедленно отправляет Activity в фон после запуска сервиса.


## Локализация 0.3

src/locales/*.json — единственный источник всех собственных строк (включая ошибки и уведомления); registry.json задаёт порядок, автоназвания, направление и флаг. JS imports JSON напрямую. Gradle verifyLocalization проверяет ключи, формы объектов, placeholder names и встроенные SVG hashes; syncLocalization копирует тот же набор в generated assets/locales перед preBuild. Kotlin Localizer читает язык из прежних settings preferences, сопоставляет полный BCP-47 тег и кеширует словари. ProcessingService строит уведомление на каждом штатном обновлении по выбранному языку; ID processing и разрешение не меняются.

LocaleContext управляет компонентами RTL и locale number formatting. I18nManager.forceRTL не используется: смена арабского не требует reboot/reload и не перезапускает job. Сравнение сохраняет физический LTR canvas, а технические числовые строки используют Unicode LTR isolates. InformationProvider открывает одно окно справки на трёх экранах. LanguagePicker имеет responsive Modal и SVG-флаги из src/ui/flags.ts; их raw sources/provenance/license — assets/flags.

notificationDismissedSession в preferences и dismissNotificationHint(sessionId) сохраняют отклонение необязательных действий карточки только для текущего сеанса. updateSettings(language,format,theme) сохраняет прежнюю сигнатуру и прежние значения system/ru/en; данные сеанса и экспорта не мигрируются и не удаляются при обновлении APK.

## Разделение ответственности 0.4

`AppProvider` подписывается на события перед чтением snapshot и согласует sequence. `useOperation` блокирует повторный запуск синхронным ref, до следующего React render. Home и Settings управляют действиями через этот общий контракт; бизнес-вычисления остаются нативными. Компоненты не получают массивы пикселей.

`UpscaleModule` отвечает за платформенные операции. `JsonBridge` преобразует только метаданные; `BundledModels` проверяет контрольные суммы и кеширует результат проверки. `SessionStore` сначала атомарно записывает новое состояние, затем публикует его и удаляет предыдущие управляемые файлы. Ошибка записи не заменяет текущий сеанс в памяти. Повторный picker не очищает Promise первого запроса.

`ProcessingService` владеет жизненным циклом. `ImageProcessor` отдельно управляет подготовкой, выбором backend, конечным результатом и освобождением bitmap. `ProcessingBackend` и `WorkFiles` позволяют проверять контролируемые отказы без подмены AI в приложении: production-реализации вызывают JNI и Android Bitmap. После нехватки памяти допускается один tile 32; после GPU-ошибки — один CPU fallback, в том числе если до неё уже уменьшили тайл.

«Детали» использует x4plus, «Быстро» — general-x4v3. Прежний `startJob` сохраняет режим quality; новый `startJobWithMode` фиксирует mode/modelId при запуске. Старый журнал получает quality. Одна загруженная ncnn-сеть обслуживает GPU self-test и inference, затем освобождается. Scratch-буферы переиспользуются между тайлами. Alpha остаётся независимым от модели.

Тесты имеют три уровня: TypeScript/RNTL для UI и application; Robolectric для Android логики с управляемыми отказами; instrumentation для настоящих системных интеграций и CPU/GPU inference. Host C++ fault-тесты компилируют production-алгоритмы и JNI с контролируемыми зависимостями. Они дополняют device-проверки, а не подтверждают качество модели. Инструментированная сборка покрытия не используется для benchmark.

`withClosed` закрывает файловые потоки и cursors при успехе и отказе; ошибка закрытия не скрывает первичную ошибку записи. Частичный файл удаляется, bitmap освобождается в finally. Если запись журнала не удалась во время остановки задачи, `updateProcessingState` публикует терминальное состояние в памяти, чтобы отказ диска не удерживал сервис и wake lock. После завершения процесса восстановление опирается на последний успешно записанный журнал.

Activity синхронизирует контраст системной панели навигации с темой; `ThemePolicy` используется и приложением, и настройкой, и Activity. `UpscaleModule.invalidate` удаляет собственные session/window/activity listeners. В тестах контролируются отказ системного провайдера, отсутствие Activity, запрет foreground service, ошибки codec/диска, timeout и поздняя отмена. Эти зависимости не заменяют production engine и не входят в APK.

## 0.5: профили, хранение и feedback

ProcessingProfiles задаёт пять стабильных ID; четыре AI-варианта маршрутизируются JNI processProfile к соответствующей ncnn модели, pixelScale сохраняет точные блоки без AI. Общие отмена, alpha, фон, журнал и экспорт сохраняют владельца в Kotlin. Превью вычисляет aspect fit по фактической ширине и доступной высоте; сравнение имеет единые границы для обеих сторон.

RetentionPolicy применяется при старте процесса после восстановления SessionStore. Лимит относится к retained данным, а не текущим промежуточным файлам. Настройки сохраняются SharedPreferences; изменение не удаляет открытый результат или активную задачу.

FeedbackClient — единственный production HTTP-клиент. Native executor отправляет только введённые пользователем текст/email/звёзды, version и requestId. HTTPS endpoint ограничен Google Apps Script; redirect GET только script.googleusercontent.com; fixed-size bounded response проверяет ok и ID. Сеть не участвует в модели, picker или экспорте. Endpoint приходит из локального android/feedback.properties, аккаунтные credentials отсутствуют в APK. Обработчик в support/apps-script отправляет письмо владельцу; ошибки не теряют текст формы.

AppProvider проверяет notification status вместе со snapshot/settings при AppState active. Разрешение и канал оцениваются вместе; Android требует service-уведомление, но не POST_NOTIFICATIONS для запуска foreground service. Счётчик подсказок ограничен тремя. claimReviewPrompt допускает максимум два показа после трёх разных сохранённых задач и интервала 30 дней; личные звёзды не фильтруют переход в Play.

Feedback HTTP использует отдельный native executor. Ожидание почтового сервиса не занимает очередь команд импорта/сеанса/отмены. invalidate освобождает обе очереди; уже принятый запрос завершается в пределах сетевых timeout. Unit-тест блокирует очередь feedback и подтверждает, что cancelJob/getCurrentSession завершаются независимо.


## 0.6 contracts

startJobWithProfile freezes profileId, speed and scale. Legacy calls preserve previous model mapping; schema 1 migrates to 2. ProcessingProfiles centralizes model IDs; PresetFinisher handles luminance mask/blending after final dimensions. TimeEstimator owns local histories and native snapshots; JS only presents ranges. MotionPolicy supplies power/thermal restrictions; Reanimated owns foreground transform/opacity and respects Reduce Motion. See PRD for preset matrix and compatibility rules.
