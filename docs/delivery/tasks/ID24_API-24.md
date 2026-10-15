# ID24_API-24 — Canonical LLM schema

Дата15.10.2026 · Фаза F0. Подготовлено и авторски проверено от имени Ильи по его поручению. [Исходная карточка](https://fa.saas.sferaplatform.ru/tasks/task/ID24_API-24).

## Результат

Go-структуры + JSON Schema: roles/parts/parameters/usage/finish;16 schema cases,3 Go serialization cases; mapping5 API families и422 policy.

[Основной артефакт](../../../docs/architecture/provider-field-mapping.md). Код/схемы в этом же commit/PR. Команды `make gen lint test build`, `make bench`, `docker compose config` и их фактический результат см. [общий отчёт](../2026-10-15.md). Исходные измерения benchmark и миграций закоммичены; в них указан реальный harness.

## Приёмка и ограничения

Адаптеры ещё не реализованы; выбранные vendor capability требуют fixture до включения, это не препятствует приёмке схемы.

Статус по критериям: **Закрыто**. Закрытие схемы/API не утверждает реализацию13 маршрутов. Остальные задачи не считаются полностью завершёнными до устранения указанного конкретного критерия. [Контрольный список общей поставки](../2026-10-15.md).
