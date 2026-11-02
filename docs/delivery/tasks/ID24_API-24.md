# ID24_API-24 — Canonical LLM schema

Дата15.10.2026 · Фаза F0. Подготовлено и авторски проверено от имени Ильи по его поручению. [Исходная карточка](https://fa.saas.sferaplatform.ru/tasks/task/ID24_API-24).

## Результат

Go-структуры + JSON Schema: roles/parts/parameters/usage/finish;16 schema cases,3 Go serialization cases; mapping5 API families и422 policy.

[Основной артефакт](../../../docs/architecture/provider-field-mapping.md). Код/схемы в этом же commit/PR. Команды `make gen lint test build`, `make bench`, `docker compose config` и их фактический результат см. [общий отчёт](../2026-10-15.md). Исходные измерения benchmark и миграций закоммичены; в них указан реальный harness.

## Приёмка и ограничения

Принято от имени Ильи по его прямому поручению выполнить ожидаемые проверки самостоятельно. [Протокол делегированной проверки](../review-2026-10-15.md) объясняет замену ревью и проверенные вопросы. Чужие голоса/участие во встречах не утверждаются.

Статус: **Выполнено** (для ADR002 дополнительно требуется зелёный container CI). Это приёмка foundation артефакта: наличие схемы/стратегии не выдаётся за реальную маршрутизацию,конкурентный paid benchmark,договор или достигнутый product SLO. Финансовый Go runtime и известные defects Python остаются задачами следующего этапа.
