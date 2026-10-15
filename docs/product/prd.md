# PRD NeuroGateway v1.1

15.10.2026 · ID24_API-7. Рабочая спецификация, базируется на seminar-03/04; расширенный продукт не отменяет узкий Release 0.5. Командное утверждение и интервью не проводились этим изменением.

## Проблема и пользователи

Интегратору нужен один типизированный контракт для LLM, прозрачный контроль расходов и возможность выбирать допустимых поставщиков. Оплата в RUB и OpenAI compatibility уже существуют у конкурентов и сами по себе не уникальны. Ключевой проверяемый фокус — финансовая точность и предсказуемые capability errors; спрос пока гипотеза.

| Персона | JTBD | Критерий ценности |
|---|---|---|
| Solo разработчик | За 5 минут получить первый ответ через существующий SDK | Пример baseURL, ключ, баланс, понятная ошибка |
| Startup CTO | Ограничить расходы ключа/команды и пережить отказ поставщика | Бюджет, audit, разрешённый fallback |
| Интегратор | Использовать API в нескольких клиентах | Версии контрактов и capability catalog |
| Data engineer | Делать embeddings/rerank и сверять usage по проектам | Export, token classes, generation ID |
| n8n / no-code пользователь | Подключить workflow без собственного backend | Готовая инструкция credential/baseURL, безопасные ошибки |

Общие JTBD: оплатить в RUB поддержанным способом; поставить бюджет ключа; скачать закрывающие документы организации. Они появятся только после PSP/договоров, не симулируются названием интерфейса.

## Scope по MoSCoW

| Возможность | MVP | Beta | GA | Проверка |
|---|---|---|---|---|
| Chat non-stream + SSE, keys, model catalog | Must | Must | Must | SDK tests + auth/RLS E2E |
| Три провайдерных adapter, initially mock/local | Must (реальные только после gate) | Must 3 допущенных канала | Must HA | contract fixtures + agreement registry |
| Stub balance / hold/capture usage ledger | Must | Must real payments | Must audit | exact reconciliation/idempotency |
| ЛК ключи/баланс/история | Must минимальный | Must | Must | e2e synthetic user |
| RUB эквайринг, webhook, возвраты | Won't | Must | Must | PSP sandbox repeat signature/refund |
| Routing fallback и key budgets | Should | Must | Must | before-first-token retry + budget race |
| Счета, акты, юрлица/ЭДО | Won't | Should | Must | finance/legal acceptance |
| Embeddings / rerank | Should | Must для выбранных endpoints | Must | schema + reference vectors |
| Responses / Messages subsets | Could | Should | Must capability matrix | отдельные SDK conformance |
| Images/audio и files | Won't | Could | Should | media limits + cost tests |
| BYOK / presets / chat UI | Won't | Could | Should | security/product review |
| Multi-region HA / pentest | Won't | Should drill | Must | failure/restore/pentest evidence |

Не входят в Release 0.5: полный streaming, реальные платежи, все 13 API методов, полная совместимость всех параметров, production HA. У него отдельный DoD seminar-05. Внешний endpoint не включается до legal/region/capability допуска. Загрузка неизвестного URL через gateway требует SSRF allowlist и ограничения размера.

## Метрики и определения

Цели для первых 30 дней закрытой Beta, базовая линия пока отсутствует:

| Метрика | Цель | Как считать |
|---|---|---|
| Activation time | p50 <5 минут | first successful SDK response − signup_completed; исключения/ошибки тоже видны |
| Activation rate | ≥60% за 24 ч | активированные / новые валидные регистрации |
| First top-up conversion | ≥20% за 7 дней | реальные settled первые пополнения / активированные; без тестовых и возвратов |
| North Star | ≥100 000 000 оплаченных токенов за 30 дней | сумма валидного billed usage, class breakdown; refund вычесть, без mock |
| Revenue (контроль) | ≥10 000 RUB за 30 дней | settled captures минус refunds; не путать с пополнением кошелька |
| D30 retention | ≥20% | доля activated cohort с billed request в окне дней28–32 |
| Доступность | Beta99.5%, GA99.9% | определения и ошибки поставщиков в NFR |

100 млн токенов и 10 тыс. RUB — гипотезы продукта, не финансовый прогноз/тариф. Задача8 по unit economics вне текущего scope, до тарификации нужна её проверка. События signup_completed, key_created, inference_succeeded, payment_settled, capture_committed содержат tenant/cohort/request IDs, без prompt. Один event_id, дедупликация, timezone UTC, dashboard ежедневно.

Нефункциональные требования: [NFR](../quality/nfr.md), безопасность и data flow [C4](../architecture/README.md), данные [ERD](../architecture/data-model.md). Acceptance: US-04 один capture и replay, US-05 нулевой баланс не вызывает upstream; cross-tenant 403/404, unknown capability422, timeout освобождает/reconciles hold. Имеющиеся Python тесты покрывают только два happy-path среза; отрицательные сценарии остаются обязательными.

Изменения 15.10: уточнены 5 персон, фазовый scope и измеримые цели; уточнение не признаёт внешние услуги оплаченными/подписанными. [Конкуренты](competitors.md) дают 5 продуктовых гипотез, [roadmap](roadmap.md) задаёт gates. Согласование: Илья — делегированная подготовка/авторская проверка; Максим, Маркус, Андрей — не получено этим PR.
