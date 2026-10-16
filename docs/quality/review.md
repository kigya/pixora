# Независимое ревью

## Импорт базы0.7.2 — 16.10.2026

Read-only independent reviewer inspected496 staged files, model provenance/hashes and public inventory. No private keys, service-account credentials, physical device serials, keystores, private notes or raw release artifacts found. Public Firebase client configuration is classified separately from secrets. All10 model files matched manifest hashes. Provided examples are authorized by owner and not claimed as model outputs.

Finding: README linked ignored historical evidence/APKs. Fixed before import: public README now explicitly marks baseline0.7.2 and 0.8.0 pending and uses current public docs. This review permits source import, not release readiness. No builds/device tests were run by reviewer.

Requirements review: FEAT801–806 have explicit user origins, acceptance scenarios and a labeled noncritical recommendation hypothesis. Architecture is documented; implementation-specific updates follow code. All runtime/security/coverage acceptance remains pending.

Acceptance feedback review: optional email exposed a shared anonymous rate-limit key; fixed by applying address throttling only when an address exists, retaining ID dedup and the global daily50 cap. Send failure no longer increments the app quota. Independent re-review confirmed the fix and two regression tests (9 backend tests pass). Python tooling OSV dispositions are isolated to the scanner-only lock invocation; app locks use separate configuration.

iOS source review of native adapter/session/images/consent/feedback and shared-engine extraction found no remaining concrete source blocker in reviewed paths. Earlier shared-JS findings were from the outdated iOS branch baseline and were retracted after inspecting integrated root. This read-only review did not run builds/device tests; measured native coverage and physical acceptance remain separate mandatory gates.

Независимое review acceptance tooling: CLI20.2.0 manifest/lock согласованы; строгий coverage runner не снижает denominator, scanner-only OSV dispositions не применяются к app locks, host JNI fixtures явно отделены от inference. Выявлена зависимость CI от ещё не интегрированных iOS lockfiles/build scripts; интеграция iOS обязательна до runnable CI/main merge.

Последнее read-only review ручных правок: source blockers не найдено в Home Apply-dismiss, центрированных Feedback/Settings headers, informational notice, последовательных switch writes, default-ON reconciliation и animated-vector splash. iOS24h share cleanup замечание исправлено; root CMake/shared-engine/recommendation registration и новый default-ON повторно просмотрены, source blockers не найдены. После последнего указания пользователя тесты не запускались; это source review, не runtime PASS.

Независимое review автоматической приёмки: Android readiness+deadline, destroy/recreate и guard отчётов coverage не имеют найденных source blockers; отсутствующие owned sources/нулевые denominators остаются ошибкой. JS/native тесты проверяют поведение, thresholds не ослаблены. Замечание: iOS clock до attachment учитывал создание overlay; исправляется переносом timestamp после addSubview и тестом порядка attachment. Это source review; финальная re-review и стабильные XCTest/build результаты фиксируются отдельно. NavigationContainer в component tests замокан, поэтому wiring PASS не выдаётся за проверку реальной гонки навигации.

Финальное read-only re-review: closure cleanup Android корректно хранит зарегистрированную View/listener пару, removes/clears при destroy и успешном draw; тест проверяет отсутствие блокирующего observer после destroy. iOS timestamp теперь непосредственно после addSubview, а новый тест проверяет attachment на каждом чтении clock. No remaining source blockers found. Измеряемая точка iOS —attachment, не независимое измерение первого rendered frame; физическая проверка отложена.
