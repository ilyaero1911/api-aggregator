# Требования v1.0

Спецификация NeuroGateway для Release 0.5: функции, качество, данные, приёмка, архитектурные ограничения и журнал.

- [Сценарии и функциональные требования](01-scenarii-i-fr.md)
- [NFR и требования к данным](02-nfr-i-dannye.md)
- [Истории и критерии приёмки](03-istorii-i-priemka.md)
- [Приоритеты, ASR, изменения](04-prioritety-asr-izmeneniya.md)
- Контракт метода: [../../schema/openapi.yaml](../../schema/openapi.yaml)
- Схема usage: [../../schema/usage-event.schema.json](../../schema/usage-event.schema.json)
- Проверка US-04, US-05 и запрета текста промпта: `PYTHONPATH=. python3 -m unittest tests.test_slice`
