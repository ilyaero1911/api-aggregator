# NeuroGateway

Учебный API-агрегатор LLM: единый контракт, выбор допустимого поставщика, учёт usage и проверяемый баланс. Публичный репозиторий проекта, пространство «Сферы» ID24_API.

На 15.10.2026: monorepo Go/Next.js, public/internal OpenAPI3.1, generated Go/TS, канонические JSON Schema, 27 таблиц PostgreSQL с RLS/ledger guards, локальный mock chat/SSE/Responses, Compose для11 сервисов, PRD/ADR/NFR и тестовая стратегия. Gateway/API/billing-worker пока **foundation каркасы**: `/healthz` отвечает, бизнес-методы501. Реальные adapters/auth/payments/интеграция DB в HTTP ещё не реализованы. Старый Python ledger остаётся прототипом в памяти с известными ограничениями.

## Быстрый запуск

Требуются Docker Engine с Compose v2.24+ и не менее8GB доступной RAM/достаточно места для образов. Из чистого checkout:

```sh
make up
```

Команда собирает сервисы (первый раз загружает dependencies и официальный MinIO source), ждёт health, применяет миграции и idempotent synthetic seed. Никаких production ключей, реальных платежей и внешних LLM не нужно. Только loopback ports. Web http://127.0.0.1:3000, mock http://127.0.0.1:8089/v1, gateway health http://127.0.0.1:8080/healthz, API8081, worker8082, Mailpit8025, MinIO console9001. Локальные публичные dummy credentials описаны в .env.example; стенд нельзя публиковать в Интернет. Health не доказывает бизнес-readiness.

```sh
curl http://127.0.0.1:8089/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"mock/chat","messages":[{"role":"user","content":"hello"}]}'
make down
```

Down сохраняет volumes. Удалять volumes с данными эта инструкция не предлагает. Если нет Docker Engine — `docker compose config` проверяет только конфигурацию; локальные unit/contract/migration тесты ниже не требуют Docker. Фактический статус контейнерного прогона публикуется в CI/отчёте, не выводится из существования YAML.

## Разработка и проверки

Go1.27.2, Node24, pnpm11.25.0, Python3.10+. `npm install --global pnpm@11.25.0`, затем:

```sh
make install
make gen
make lint test build
make run SERVICE=mock-provider
make bench
make hooks
```

Make gen строит OAS/JSON Schema и генерирует Go модели, TS типы public/control plane. SDK wrappers в packages/sdk/src и apps/web/src/internal-client.ts. Make test: Go race,16 проверок миграций PGlite, compatible SDK HTTP и16 schema cases,5 исходных Python тестов. Make build собирает все Go services и Next production. Бенчмарк Go/Node открывает1000 SSE×3прогона, raw measurements в docs/architecture/benchmarks; это не product SLO.

Проблемы запуска: конфликт порта → освободить указанный loopback порт/переопределить compose override; недостаток памяти CH/build → увеличить Docker resource limits; первый MinIO build долгий → официальный upstream распространяется из source, версия закреплена; stale node_modules → pnpm install --frozen-lockfile с правильной версиейpnpm. TypeScript5.9.3 намеренно зафиксирован для compiler API генератора. На Windows запускать make/Python/Go из WSL2 с Docker integration; такой onboarding всей команды ещё не подтверждён.

## Навигация

| Материал | Ссылка |
|---|---|
| Отчёт по17 задачам до18.10 | [Foundation delivery](docs/delivery/2026-10-15.md) |
| PRD, конкурентная матрица, регламент, F0–F4 | [Продукт](docs/product/prd.md) |
| C4, ADR001–003, ERD, API mapping | [Архитектура](docs/architecture/README.md) |
| NFR и тестовая стратегия | [Качество](docs/quality/nfr.md) |
| Бренд и регистрационные gate | [Бренд](docs/brand/README.md) |
|10 внешних каналов, все disabled до договора | [Legal registry](docs/legal/provider-review.md) |
| Семинары2–6 | [2](docs/seminar-02/README.md), [3](docs/seminar-03/README.md), [4](docs/seminar-04/README.md), [5](docs/seminar-05/README.md), [6](docs/seminar-06/README.md) |

Семинар7 ожидает задания: [страница «Сферы»334](https://fa.saas.sferaplatform.ru/knowledge/pages?id=334) была пустой при проверке15.10.2026. Не объявляется выполненным.

Исходные19 коммитов команды сохранены. Документы seminar-02…06 — историческая baseline, новые материалы описывают delivery15.10. Статусы/приёмка остаются в «Сфере». Команда: Улитин Максим, Ерофеев Илья, Маркус Филипп, Деревцов Андрей. Порученная Ильёй проверка не изображает голос/подпись другого участника.

Подтверждённый полный стенд: [CI](https://github.com/ilyaero1911/api-aggregator/actions/runs/38750382978) · [машинный отчёт](docs/verification/ci-foundation.json).
