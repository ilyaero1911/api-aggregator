# Тестовая стратегия и допуск релиза

15.10.2026 · ID24_API-178. Авторская проверка выполнена по поручению Ильи, согласование всей командой не утверждается.

| Уровень | Объект / данные | Gate |
|---|---|---|
| Unit | Деньги, routing policy, normalization; boundary/negative fixtures | Не менее 80% statement coverage handwritten core + ветви финансовых инвариантов; generated code/main/benchmark исключены только из метрики, не из сборки |
| Integration | PG transactions/RLS, Redis failover, NATS ack/replay, CH projection, S3 ACL; testcontainers на отдельном CI runner | Повторы, race, cross-tenant, rollback и orphan hold не нарушают инварианты |
| Contract | Ajv JSON Schema 2020, Spectral OAS 3.1, generated Go/TS + official SDK HTTP | Ноль schema warnings, golden fixtures всех включённых adapters, stable error/stream shapes |
| E2E | Synthetic user → key → reserve → mock → usage → capture; PSP sandbox webhook replay | Пустой баланс не вызывает upstream; один generation — один capture; чужой tenant закрыт |
| Load | MVP/GA профиль из nfr.md, synthetic prompt, выделенный тестовый tenant | RPS/streams/overhead/error thresholds, 3 прогона + отчёт окружения |
| Chaos / recovery | Kill gateway после hold, PG before/after commit, NATS ack gap, CH down, Redis flush, provider timeout/SSE disconnect | Ноль потерянного usage, reconcile журнал, подтверждённый RPO/RTO restore |

## Среды и данные

Unit/PGlite/SDK — каждый PR, реальные платные ключи отсутствуют. Compose — локально и CI, seed идемпотентный и содержит только вымышленные записи/демо hash. Stage — отдельные аккаунты и secret scopes, без production выгрузок. PSP только sandbox; живые финансовые транзакции не входят в автотест. Prod — только synthetic probe без пользовательского prompt. Секреты в env/secret store, исключены из артефактов и командной строки.

Порядок CI: install frozen → generation drift → lint/typecheck → unit/race → schema/DB → official SDK → web build → compose health → PostgreSQL seed/rollback verification → артефакты отчётов. Testcontainers ещё не внедрён: compose/PGlite не называются testcontainers. Конкретные финансовые race/chaos тесты обязательны при реализации ledger, но не имитируются HTTP mock.

## Go / no-go

Release 0.5: US-04/05, fixture usage, 20 concurrent, p95≤80ms, неизменяемая сверка и stage demo по seminar-05. MVP/Beta не выпускаются, пока есть orphan hold, cross-tenant lookup, неограниченное отрицательное списание, lost usage, незакрытый high security issue, отсутствие restore drill, непройденный provider contract/capability gate или необходимость реального платежа без sandbox evidence. Beta дополнительно требует три юридически допущенных канала, работающий webhook ledger и rollback runbook; GA — pentest, HA и 99.9% SLO evidence.

Текущая проверка: Python 5 тестов, 16 schema cases, Go serialization/handler/race, 16 DB checks, official SDK chat/SSE/Responses и Next production build. Это проверка foundation. Mock покрывает 96.5% statements; devserver 52.9% из-за Run/socket startup, generated models и entrypoints снижают общую цифру. **Требование ≥80% handwritten financial core не закрыто:** финансовый Go core ещё не написан, известные Python billing дефекты перечислены в seminar-06/baseline.md и задачах 204/205. Не подменять качество процентом generated code.

При падении: сохранить commit, команду, sanitized logs и fixture; исправление получает regression test по наблюдаемому дефекту. Flaky тест не отключается ради зелёной сборки. Приёмка отдельно фиксирует выполненные проверки, ограничения и оставшиеся блокеры.
