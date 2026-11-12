# NeuroGateway

API-агрегатор языковых моделей: один OpenAI-совместимый контракт, несколько провайдеров, учёт токенов и баланс.

## Приложение

Копия Routeway и OpenRouter: OpenAI-совместимый шлюз `/v1`, каталог моделей, кабинет и админка. Бэкенд на Go (chi, pgx, sqlc), фронтенд на Next.js + TypeScript, Postgres и Redis.

```sh
make up    # Postgres :55442 и Redis :56389 в docker
make api   # Go-сервер :8090, миграции и сиды применяются сами
make web   # кабинет http://localhost:3100
```

Первый зарегистрированный пользователь (или адрес из `ADMIN_EMAILS`, по умолчанию `admin@local.test`) получает роль администратора, админка на `/admin`. Остальные настройки в [.env.example](.env.example).

| Часть | Где |
|---|---|
| Шлюз `/v1`: chat/completions (SSE), images, models, key, credits, generation, keys | `backend/internal/gateway`, `backend/internal/httpapi/v1.go` |
| Провайдеры: сейчас мок с задержкой и долей ошибок, фолбэк на следующий | `backend/internal/gateway/provider.go` |
| Баланс в микрорублях, тарифы, промокоды | `backend/internal/billing` |
| Оплата: интерфейс `payments.Provider`, сейчас фиктивная страница `/pay/{id}` | `backend/internal/payments` |
| Курс ЦБ: cbr.ru → cbr-xml-daily.ru → Redis → Postgres → резерв из настроек | `backend/internal/fx` |
| Схема и сиды (модели, тарифы) | `backend/migrations` |
| Кабинет, публичные страницы, админка, ru/en | `web/src` |

Ниже материалы курса, которые были в репозитории до приложения.

Текущее состояние: инженерные документы и прототип учета баланса в памяти. HTTP-сервер, интеграция PostgreSQL, реальные адаптеры и stage еще не реализованы. [Фактическое состояние и ограничения](docs/seminar-06/baseline.md).

Артефакты: [SQL-схема](schema/001_init.sql), [OpenAPI](schema/openapi.yaml), [каталог источников](data/sources.json), [JSON Schema usage](schema/usage-event.schema.json).

Для проверки достаточно Python 3.10+ и стандартной библиотеки. Из корня репозитория:

```sh
python3 -m unittest discover -v
python3 tools/check_risks.py
go test ./...
```

Пространство задач: `ID24_API`. Команда: Улитин Максим (тимлид), Ерофеев Илья, Маркус Филипп, Деревцов Андрей.

| Документ | Содержание |
|---|---|
| [Семинар 2](docs/seminar-02/README.md) | Подход к работе, бэклог, доска, Definition of Done |
| [Семинар 3](docs/seminar-03/README.md) | Контекст и данные проекта |
| [Семинар 4](docs/seminar-04/README.md) | Требования v1.0, приёмка, архитектурные требования, журнал изменений |
| [Семинар 5](docs/seminar-05/README.md) | Устав, WBS, дорожная карта, ответственность |
| [Семинар 6](docs/seminar-06/README.md) | 16 рисков, матрица, меры, владельцы, индикаторы и задачи |
| [Отчёт](docs/otchet.md) | Учёт баланса среза: проводки, резерв, пополнение, курс |
| [Отчёт, ноябрь](docs/otchet-noyabr.md) | Прайс, бюджеты, журнал, адаптеры на фикстурах |

Семинар 7 ожидает опубликованного задания: [страница в «Сфере»](https://fa.saas.sferaplatform.ru/knowledge/pages?id=334) на 15.10.2026 пустая. Его выполнение пока не подтверждено.

Исходные 19 коммитов команды перенесены с сохранением истории. Новые результаты фиксируются в этом GitHub-репозитории; статус и приемка задач — в «Сфере», пространство `ID24_API`.
