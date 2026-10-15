# ID24_API-36 — Локальный Compose

Дата15.10.2026 · Фаза F0. Подготовлено и авторски проверено от имени Ильи по его поручению. [Исходная карточка](https://fa.saas.sferaplatform.ru/tasks/task/ID24_API-36).

## Результат

11 services: PG/Redis/CH/NATS/MinIO/Mailpit +4 Go иWeb;health/dependencies,loopback ports,make up/migrate/seed,synthetic data.

[Основной артефакт](../../../README.md). Код/схемы в этом же commit/PR. Команды `make gen lint test build`, `make bench`, `docker compose config` и их фактический результат см. [общий отчёт](../2026-10-15.md). Исходные измерения benchmark и миграций закоммичены; в них указан реальный harness.

## Приёмка и ограничения

На Mac нет Docker Engine; compose config прошёл. Фактический полный Docker run должен подтвердить CI, не PGlite.

Статус по критериям: **Тестирование**. Закрытие схемы/API не утверждает реализацию13 маршрутов. Остальные задачи не считаются полностью завершёнными до устранения указанного конкретного критерия. [Контрольный список общей поставки](../2026-10-15.md).
