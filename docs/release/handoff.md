# Передача на релиз

Статус: НЕ ГОТОВО. Этот шаблон не является подтверждением готовности.

## Версия и идентичность

Version, commit, package IDs, repository/main PR/CI URL, minSdk/iOS minimum и feature registry.

## Доказательства

Unit/component/native/E2E результаты и 100% coverage; точные исключения; независимое ревью; security findings; Android/iOS release builds и hash; Xiaomi debug/release test текущего artifact. Указывать failed/blocked/не проверено честно.

## Продукт и интеграции

30 языков/RTL/system selection, UI/performance, Analytics/Crashlytics/Remote Config/consent, privacy/data safety, feedback delivery/Reply-To и review policy. Ссылки на матрицы/документы.

## Блокеры и граница следующего скилла

Все незавершённые условия и signing/publishing prerequisites. P Build App не подписывает окончательный релиз, не создаёт GitHub Release и не публикует магазины. Release skill повторно проверяет Xiaomi, если окончательная подписанная сборка отличается, и отдельно подтверждает публикацию/безопасную резервную копию ключей. Секреты в handoff не включать.
