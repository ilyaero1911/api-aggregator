# PostgreSQL: ERD, деньги, изоляция и миграции

ID24_API-26. Актуальные миграции: deploy/migrations/00001_foundation.sql и 00002_ledger_guards.sql и 00003_account_identity.sql. Старая schema/001_init.sql — исторический прототип, одновременно с новым набором не применяется.

[Полный ERD Mermaid](erd.mmd) и [машинный перечень таблиц](../../schema/foundation-tables.json) включают tenants и 26 tenant-scoped таблиц: users, identities, sessions, organizations, memberships, api_keys, key_limits, wallets, ledger_accounts, generations, ledger_transactions, ledger_entries, holds, payments, invoices, documents, providers, models, model_endpoints, prices, exchange_rates, promo_codes, redemptions, usage_events, audit_log, outbox.

## Инварианты

Tenant обязателен в PK/FK бизнес-сущностей, межтенантные ссылки запрещены составными ключами. RLS использует `app.tenant_id`, приложение обязано устанавливать его через SET LOCAL в транзакции. Superuser/владелец БД не является production ролью; тест проверяет обычную роль. Root tenants не публичная таблица. Глобальный каталог при необходимости публикуется в каждый tenant отдельной управляемой операцией.

1 RUB = 100 копеек = 100 000 000 микрокопеек. Денежные поля bigint, во внешнем JSON десятичная строка; float не используется. Баланс — сумма signed journal entries, а не изменяемое поле wallets. Hold — отдельное обязательство, доступность = баланс минус активные резервы. Цены версионированы, generation хранит snapshot/ссылку на версию; курсы и rounding должны фиксироваться до резерва.

Journal создаётся и заполняется одной DB транзакцией, содержит минимум две проводки с нулевой суммой одной валюты. Deferred constraint проверяет даже пустой journal, AFTER INSERT guard запрещает дозапись после создающей DB транзакции. Ledger и usage append-only; исправление делается обратной проводкой. UNIQUE business keys защищают idempotency/provider payment; индексы построены по tenant, FK и очередям pending. Остальные бизнес-таблицы поддерживают deleted_at, audit/ledger не подвергаются soft delete.

API-key/session secret хранится только hash, seed ключ исключительно тестовый. В usage/audit нет столбцов prompt/completion. Подробные payment/document payloads требуют минимизации и retention в реализации; сама схема не доказывает соблюдение политики данных.

## Процесс изменений

Формат Goose Up/Down, pinned goose версия указана в library-versions.json. Expand: добавить nullable колонку/новую таблицу; Migrate: backfill ограниченными пакетами, сверка и новый код dual-read; Contract: только после удаления старых читателей, отдельный релиз. Деструктивный Down разрешён только на пустой dev БД; production rollback — откат кода и forward repair/restore по runbook, не DROP финансовых данных.

Для локального стенда `make migrate seed`: helper применяет SQL Up в транзакции и ведёт ng_migrations. Production должен использовать выделенную migration identity и штатный goose, а не локальный helper. `make test-db` применяет весь набор на чистом PostgreSQL-compatible PGlite, проверяет 14 сценариев, откатывает Down и снова Up. [Фактический отчёт](../verification/migrations.json) указывает версию движка. Это не выдаётся за запуск Docker/PostgreSQL 18.

Проверены: tenant FK/RLS, repeat seed, сумма кошелька, запрещённая несбалансированная/пустая проводка, immutable/sealed ledger, блокировка недопущенного endpoint, отсутствие prompt полей, Up/Down/Up. Не доказаны: race на резервировании баланса, PG18 backup/PITR, производительность индексов на реальном объёме. Совместный разбор с Андреем ещё не состоялся.
