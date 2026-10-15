# ID24_API-26 — ERD и миграции

Дата15.10.2026 · Фаза F0. Подготовлено и авторски проверено от имени Ильи по его поручению. [Исходная карточка](https://fa.saas.sferaplatform.ru/tasks/task/ID24_API-26).

## Результат

27 таблиц, composite tenant FK/RLS, integer money/immutable balanced sealed ledger,3 Goose migrations, idempotent seed,16 PostgreSQL-engine checks Up/Down/Up.

[Основной артефакт](../../../docs/architecture/data-model.md). Код/схемы в этом же commit/PR. Команды `make gen lint test build`, `make bench`, `docker compose config` и их фактический результат см. [общий отчёт](../2026-10-15.md). Исходные измерения benchmark и миграций закоммичены; в них указан реальный harness.

## Приёмка и ограничения

Совместный разбор схемы с Андреем не состоялся; финансовый concurrency/backup drill не доказаны этими schema tests.

Статус по критериям: **Тестирование**. Закрытие схемы/API не утверждает реализацию13 маршрутов. Остальные задачи не считаются полностью завершёнными до устранения указанного конкретного критерия. [Контрольный список общей поставки](../2026-10-15.md).
