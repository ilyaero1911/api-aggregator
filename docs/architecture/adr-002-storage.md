# ADR-002: OLTP + проекции, JetStream и transactional outbox

15.10.2026 · ID24_API-23 · Техническое решение, командное согласование ожидается.

| Хранилище | Истина / назначение | Что не допускается |
|---|---|---|
| PostgreSQL | Tenant, users, keys, платежи, неизменяемый double-entry ledger, holds, цены и outbox | Денежная истина в Redis или ClickHouse |
| Redis | Кэш hash ключей, rate limits, короткие проекции hold | Потеря Redis меняет доступный баланс |
| ClickHouse | Usage и агрегаты с eventual consistency | Использование для авторизации или проводок |
| NATS JetStream | Долговечные usage/domain events, durable pull consumers | Подмена Core NATS: у него другая гарантия доставки |
| S3 / локальный MinIO | Счета, акты, выгрузки с закрытыми ACL | Prompt по умолчанию; публичный bucket |

[Официальная документация JetStream](https://docs.nats.io/concepts/jetstream) описывает доставку at-least-once и повтор при отсутствии ack. Следовательно, обработчики обязаны выдерживать дубликаты. Никакой общей exactly-once гарантии между PG, брокером и CH не заявляется.

## Outbox и порядок

1. Capture и outbox(event_id, tenant_id, aggregate_id, payload) записываются одной PG транзакцией.
2. Relay читает с `FOR UPDATE SKIP LOCKED`, публикует с event_id и ждёт server ack. Отмечает published после ack. Падение между ack и отметкой даёт дубликат.
3. Consumer сохраняет event_id в durable inbox/уникальный ключ перед эффектом. Ack после коммита. CH использует дедупликацию по event_id; финансовый эффект выполняется только PG транзакцией.
4. Порядок по одному wallet/generation задаётся aggregate sequence и последовательной обработкой его partition. Порядок разных tenant не нужен. Пропуск sequence отправляется на reconcile.
5. Backoff 1/5/30/120 секунд, затем до 10 попыток. После MaxDeliver — явный DLQ stream + alert + ручной replay с тем же event_id. Сам по себе advisory JetStream не переносит payload в DLQ: это ответственность relay/оператора.

Это протокол будущего worker; нынешний worker содержит healthz, поэтому нельзя считать отсутствие потерь уже доказанным.

## Альтернативы

Kafka/Redpanda полезны для больших долговременных log потоков, partitions и широкой аналитической экосистемы; требуют отдельного sizing/операционных навыков. JetStream выбран для небольшого числа сервисов MVP и durable очередей. Пересмотр при нагрузке, retention или consumer fanout, которые подтверждённо не укладываются в бюджет. Redis Streams не выбираем как вторую денежную истину и отдельный кластер доставки.

## Проверка и отказы

Compose содержит PG/Redis/CH/NATS/MinIO. Версии и image digests в deploy/image-lock.json, MinIO собирается из официального release source. При NATS down — outbox backlog; при PG down — fail closed платным вызовам; при CH down — replay; при Redis down — безопасная деградация; при S3 down — недоступна выдача документов. Нужны реальные kill/restart и restore прогоны по тестовой стратегии; schema-тесты не заменяют их.
