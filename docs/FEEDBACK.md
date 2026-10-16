# Подключение автоматического feedback

Экран отправляет только email, сообщение, необязательную личную оценку (сейчас интерфейс её не запрашивает), версию приложения, нормализованную платформу (`android` или `ios`) и случайный ID запроса. Старые клиенты без поля `platform` принимаются как Android. Не отправляются изображения, URI, рабочие файлы, логи и идентификатор устройства. AI работает без интернета; сеть нужна только для явно отправляемого feedback. Получатель: kirillborichevskiy@gmail.com. Почта для ответа необязательна; Reply-To задаётся только при её наличии и проверке. Отправка формы не зависит от согласия на Analytics/Crashlytics.

## Настройка бесплатного Google Apps Script

1. В своём Google-аккаунте откройте https://script.google.com/ и создайте проект.
2. Вставьте `support/apps-script/Code.gs`. При необходимости покажите manifest и вставьте `appsscript.json`.
3. Deploy → New deployment → Web app. Execute as: Me; Who has access: Anyone. Подтвердите право отправки почты из собственного аккаунта. Никакие токены/пароли не добавляются в APK.
4. Скопируйте URL вида `https://script.google.com/macros/s/…/exec`.
5. Передайте URL агенту либо создайте локальный `android/feedback.properties` со строкой `endpoint=URL`. Пересоберите release APK прежним ключом. URL публичный, не секрет.
6. Из установленного приложения отправьте свой тестовый вопрос. Проверьте получение письма и Reply-To. Не считать сетевую доставку проверенной до этого шага.

Без URL отправка честно обозначена как недоступная; приложение не показывает фиктивное «Отправлено». Текст формы остаётся при ошибке. Отмена не отправляет письмо. Почта/сообщение не сохраняются в рабочем журнале.

Обработчик фиксирует получателя, включает platform и версию в письмо, валидирует размер и поля, ограничивает повторные письма с одного адреса десятью минутами и общий объём 50 писем/сутки, проверяет оставшуюся бесплатную квоту. ID запроса позволяет повторить запрос без второго письма в пределах шести часов. Публичный обработчик может получать злоупотребления; эти ограничения уменьшают расход квоты, но не являются аутентификацией пользователя. При превышении квот отправка прекращается, платный тариф не включается. [Квоты Google](https://developers.google.com/apps-script/guides/services/quotas).

Личные звёзды не являются оценкой Google Play и не публикуются автоматически. По согласованию пользователя переход в магазин доступен при любой оценке. До публикации ссылка явно помечена тестовой, с подтверждением, и не предлагает оценивать чужую программу как Pixora. [Правила отзывов](https://support.google.com/googleplay/android-developer/answer/9898684).

## Проверка подключения 09.10.2026

Пользователь предоставил Web App URL; он записан в локальный android/feedback.properties. Тестовый POST вернул HTTP200, ok=true и соответствующий ID. Полученное письмо найдено в Gmail владельца: Upselora 0.5.0 — feedback (4/5), сообщение и почта для ответа переданы правильно. ID и ответ обработчика: artifacts/validation-05/feedback-delivery.json. Отправка из установленной Android-формы на Xiaomi также выполнена: тестовое письмо получено в Gmail, email для ответа kirillborichevskiy+upselora-test@gmail.com, личная оценка не задана. Данные формы не заменяются моками; результат в xiaomi-feedback-ui.log.


Для 0.6 исходник Code.gs использует Pixora. Уже развёрнутый обработчик продолжает доставлять письма через прежний endpoint, но содержит старую тему Upselora. В Apps Script замените исходник, затем Deploy → Manage deployments → Edit → New version → Deploy; URL прежнего deployment сохраняется.

## Installed-app QA0.8

After explicit user consent for exactly two test messages, the installed Samsung debug app sent one synthetic message with a reply address and one without. Both were received in the fixed support inbox on2026-10-16 with platform=android/version=0.8.0; Gmail Show details confirmed Reply-To present only for the addressed submission. Neither contained media or personal message content. Existing Apps Script deployment was updated to version2 from reviewed GitHub PR7, keeping URL/access/execution identity. Private message IDs and screenshots remain ignored local evidence. This confirms Android debug feedback delivery; it does not confirm Firebase Analytics/Crashlytics delivery or iOS physical delivery.
