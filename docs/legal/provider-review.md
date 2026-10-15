# Каналы поставки: реестр допуска и пакет юридического разбора

15.10.2026 · ID24_API-13. [Машинный реестр](provider-registry.json):10 внешних каналов pending/disabled, локальный synthetic mock разрешён исключительно для тестов. Это не юридическое заключение и не утверждение, что любой канал разрешён/запрещён вообще. В SQL activation gate не даёт включить endpoint с legal_status≠approved.

## Вопросы по каналам

| Канал | Что должен установить договор/юрист |
|---|---|
| Основной внешний поставщик | Допустимость приложения для end users отдельно от перепродажи account/API key, территория и contracting entity |
| Anthropic direct | Commercial terms, end-user access, supported regions, DPA и модельные политики |
| Gemini direct | Paid/free разные условия данных, территории, downstream rights |
| Azure / Foundry | Кто продавец модели, соглашение организации, model-specific terms, доступный регион/deployment |
| AWS Bedrock | Provider/model EULA дополнительно к AWS, entitlement региона, reseller rights |
| Vertex AI | Google Cloud contract, model garden publisher terms, data residency каждой функции |
| Reseller | Цепочка прав именно на API-агрегацию, upstream authorisation и ответственность, не только обещание сайта |
| Yandex | Оферта для организации, модели, end users, personal data и выбранные регионы |
| GigaChat | Тариф юрлица/договор, downstream use, права на ключ, обработка данных |
| Self-hosted | Лицензия каждого веса/кода отдельно, commercial redistribution/use restrictions, модельный паспорт |

Проверенные [Условия основного поставщика](https://openai.com/policies/services-agreement/) различают интеграцию в приложения и ограничения перепродажи доступа/передачи ключей. Из одного этого нельзя вывести разрешение данного бизнеса или географии. [Anthropic commercial terms](https://www.anthropic.com/legal/commercial-terms) и [Gemini additional terms](https://ai.google.dev/gemini-api/terms) также требуют оценки конкретного субъекта, продукта и региона. [Bedrock FAQ](https://aws.amazon.com/bedrock/faqs/) и [Azure overview](https://learn.microsoft.com/en-us/azure/ai-services/openai/overview) описывают каналы, но обзор не заменяет подписанный договор. Все ссылки в реестре — исходные материалы для разбора, не свидетельство заключённой сделки.

## Решение по структуре — пока pending

RU организация для control plane/платежей — проектная гипотеза, не созданное юрлицо. Возможный иностранный contracting entity требует отдельной правомерной оценки ownership, налогов и допустимости поставщика. Иностранный VPN/сервер не делает запрещённую поставку разрешённой; обход ограничений не проектируется. До согласованной структуры — только mock без реальных данных/ключей.

## Карточка допуска (на каждого поставщика и модель)

Субъект и реквизиты → версия terms/date → legal opinion (автор/дата/ссылка) → signed order/contract reference → разрешённая модель/регион/end users → data/DPA/retention → billing/limits/refund → security/capabilities fixtures → ответственные → expiry/review date. Значения pending не пропускают gate. Реестр ограничений хранит модель/region allowlist и причину отказа; недостаточно общего enabled=true.

До public Beta обязательны минимум3 подписанных допустимых канала и заключение по каждому; сейчас подписанных0, утверждённых заключений0. Нельзя заменить это публичной офертой, SQLseed или mock. Документы не подписывались, согласие с ToS не нажималось, контрагенты не контактировались. Для завершения нужны уполномоченный представитель организации и юрист с конкретным заключением/договорами.
