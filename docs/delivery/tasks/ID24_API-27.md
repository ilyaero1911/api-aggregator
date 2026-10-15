# ID24_API-27 — NFR

Дата15.10.2026 · Фаза F0. Подготовлено и авторски проверено от имени Ильи по его поручению. [Исходная карточка](https://fa.saas.sferaplatform.ru/tasks/task/ID24_API-27).

## Результат

Численные Beta/GA SLO, throughput/TTFT/RPO/RTO/billing criteria, profiles/load harness и Prometheus draft rules, отделён Release0.5.

[Основной артефакт](../../../docs/quality/nfr.md). Код/схемы в этом же commit/PR. Команды `make gen lint test build`, `make bench`, `docker compose config` и их фактический результат см. [общий отчёт](../2026-10-15.md). Исходные измерения benchmark и миграций закоммичены; в них указан реальный harness.

## Приёмка и ограничения

Instrumentation и нагрузка реального gateway/alerts CI нужны в E15-04/E03-09; текущий каркас не имеет achieved SLO.

Статус по критериям: **Тестирование**. Закрытие схемы/API не утверждает реализацию13 маршрутов. Остальные задачи не считаются полностью завершёнными до устранения указанного конкретного критерия. [Контрольный список общей поставки](../2026-10-15.md).
