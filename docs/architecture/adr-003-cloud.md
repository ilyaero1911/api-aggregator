# ADR-003: облако и бюджет — пакет для решения

15.10.2026 · ID24_API-31. Статус: условная рекомендация, облачный аккаунт организации не открыт, бюджет Максимом не утверждён. Не является заказом услуг.

| Критерий | Yandex Cloud | Selectel | VK Cloud |
|---|---|---|---|
| Managed Kubernetes | Есть в каталоге | Есть в каталоге | Нужна подтверждённая актуальная спецификация |
| Managed PostgreSQL | Есть | Есть | Не подтверждено в этой проверке |
| Redis-compatible | Valkey в актуальном каталоге, compatibility тест нужен | Managed Redis | Не подтверждено |
| ClickHouse | Managed ClickHouse | Managed ClickHouse указан в актуальном каталоге | Не подтверждено |
| S3 | Object Storage | S3 | Не подтверждено |
| Регион/зоны | RU регион выбрать в quote | RU площадки выбрать в quote | Требуется quote |
| SLA/компенсация | Условия конкретных сервисов в договоре, не общая рекламная цифра | То же | Документы не удалось открыть |
| Цена одинаковой конфигурации | Выгрузка калькулятора ещё нужна | Quote/конфигуратор ещё нужен | Quote ещё нужен |

Проверенные первичные источники: [Yandex прайс/калькулятор](https://yandex.cloud/ru/prices), [Selectel Kubernetes и каталог БД/S3](https://selectel.ru/services/cloud/kubernetes/). [VK Cloud](https://cloud.vk.com/) и документация были недоступны инструменту; неизвестное не превращено в отсутствие сервиса. Выбор по неполной таблице не объявляется окончательным. Предварительный кандидат Yandex Cloud за совмещённый managed stack, Selectel — полноценная альтернатива; VK требует источников/quote. Обновить сравнение при появлении коммерческих предложений на одинаковую конфигурацию.

## Проект сети

Control plane и идентифицирующие/денежные данные в выбранном RU регионе. DB/cache/broker private subnets без публичного IP. Internet ingress только HTTPS LB/WAF→gateway/web; egress NAT с allowlist допущенных endpoints. Ops через WireGuard/IPsec bastion с MFA/short-lived identities, межсервисный mTLS, secrets manager. Data plane в другом регионе создаётся только после явной юридической оценки потока prompt и allowlist; VPN не меняет юрисдикцию и не используется для обхода ограничений поставщика. Terraform/Helm каталоги пока шаблонные, production сеть не развернута.

## Плановый бюджет

[cloud-budget.csv](cloud-budget.csv) и `python3 tools/cloud_budget.py` — сценарная модель в RUB/месяц. Числа **внутренние лимитные допущения**, не подтверждённые тарифы Yandex/Selectel/VK. Показаны compute, PG/cache/CH, storage/backups, egress/security, наблюдаемость и резерв25%. Они не включают inference, зарплаты, домены и PSP комиссии; НДС/налоговый режим нужно подтвердить в quote, в модели суммы считаются all-in для планирования без права заказа.

MVP: 2 app instances, single-zone dev PG, без HA обещаний. Beta: 3 app, multi-zone PG/backup, выделенная CH. GA: минимум 3-zone app/PG и резерв на failover/observability; sizing должен выдержать тест 2000RPS/20k SSE. Увеличение бюджета только по измерениям, не по условной таблице.

Для финального DoD нужны: юридическое лицо/плательщик; quote всех трёх кандидатов с датой/VAT/region/SLA; утверждённый Максимом лимит; org account с billing/доступами; тест приватной сети/restore. Эти факты не получены и не подменены seed/README.
