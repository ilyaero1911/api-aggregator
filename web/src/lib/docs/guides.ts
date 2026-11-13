import type { Group } from "./types";

export const GATEWAY: Group = {
  title: "Как это работает",
  pages: [
    {
      slug: "how-it-works", title: "Как устроен шлюз", desc: "Путь запроса от вашего кода до модели и обратно.",
      blocks: [
        ["p", "Шлюз стоит между вашим приложением и провайдерами моделей. Он принимает запрос в формате OpenAI, проверяет ключ и баланс, выбирает провайдера, передаёт запрос, считает токены и списывает стоимость."],
        ["steps", [
          ["Проверка", "Ключ активен, у аккаунта есть деньги или токены тарифа, не превышены лимиты."],
          ["Выбор модели", "Берётся модель из поля `model`, пресет или первая доступная из списка `models`."],
          ["Выбор провайдера", "У одной модели может быть несколько провайдеров. Шлюз идёт по приоритету или по вашему порядку `provider.order`."],
          ["Ответ и учёт", "Ответ отдаётся как есть, токены считаются, стоимость в рублях списывается с баланса и попадает в историю."],
        ]],
        ["h2", "Если провайдер недоступен"],
        ["p", "Шлюз автоматически пробует следующего провайдера той же модели. Если у модели не осталось живых провайдеров, а в запросе есть `models`, переходит к следующей модели. Вы получаете ошибку только когда недоступно всё."],
        ["h2", "Что мы храним"],
        ["p", "Модель, провайдера, число токенов, стоимость, время ответа и статус. Текст запросов не хранится, если вы не включили это в настройках."],
      ],
    },
  ],
};

export const GUIDES: Group = {
  title: "Руководства",
  pages: [
    {
      slug: "streaming", title: "Потоковые ответы", desc: "Показывать ответ по мере того, как модель его пишет.",
      blocks: [
        ["p", "Добавьте `\"stream\": true`, и ответ придёт кусочками через Server-Sent Events. Пользователь видит текст сразу, а не ждёт весь ответ."],
        ["code", [{ label: "Python", code: `stream = client.chat.completions.create(\n    model="anthropic/claude-sonnet-4.5",\n    messages=[{"role": "user", "content": "Расскажи историю про маяк"}],\n    stream=True,\n)\nfor chunk in stream:\n    print(chunk.choices[0].delta.content or "", end="", flush=True)` }, { label: "TypeScript", code: `const stream = await client.chat.completions.create({\n  model: "anthropic/claude-sonnet-4.5",\n  messages: [{ role: "user", content: "Расскажи историю про маяк" }],\n  stream: true,\n});\nfor await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");` }]],
        ["h2", "Формат потока"],
        ["code", [{ label: "SSE", code: `data: {"id":"gen-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}\n\ndata: {"id":"gen-…","choices":[{"index":0,"delta":{"content":"Жил-был"}}]}\n\ndata: {"id":"gen-…","generation_id":"gen-…","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":14,"completion_tokens":212,"cost":0.0412,"currency":"RUB","paid_by":"balance"}}\n\ndata: [DONE]` }]],
        ["note", "Стоимость и токены приходят в последнем куске потока, перед `[DONE]`."],
        ["h2", "Отмена"],
        ["p", "Если закрыть соединение, генерация остановится. Вы заплатите только за уже написанные токены."],
      ],
    },
    {
      slug: "tool-calling", title: "Вызов инструментов", desc: "Модель сама решает, когда вызвать вашу функцию.",
      blocks: [
        ["p", "Опишите функции в поле `tools`. Модель может ответить не текстом, а просьбой вызвать функцию с аргументами. Вы выполняете функцию и возвращаете результат следующим сообщением."],
        ["code", [{ label: "Python", code: `tools = [{\n    "type": "function",\n    "function": {\n        "name": "get_weather",\n        "description": "Погода в городе",\n        "parameters": {\n            "type": "object",\n            "properties": {"city": {"type": "string"}},\n            "required": ["city"],\n        },\n    },\n}]\n\nresp = client.chat.completions.create(\n    model="openai/gpt-5",\n    messages=[{"role": "user", "content": "Какая погода в Казани?"}],\n    tools=tools,\n)\ncall = resp.choices[0].message.tool_calls[0]\nprint(call.function.name, call.function.arguments)  # get_weather {"city": "Казань"}` }]],
        ["h2", "Вернуть результат"],
        ["code", [{ label: "Python", code: `messages += [\n    resp.choices[0].message,\n    {"role": "tool", "tool_call_id": call.id, "content": '{"temp": 3, "sky": "облачно"}'},\n]\nfinal = client.chat.completions.create(model="openai/gpt-5", messages=messages, tools=tools)\nprint(final.choices[0].message.content)` }]],
        ["tip", "Инструменты поддерживают модели с пометкой «Инструменты» в каталоге."],
      ],
    },
    {
      slug: "structured-outputs", title: "Структурированный ответ", desc: "Получить строгий JSON вместо свободного текста.",
      blocks: [
        ["p", "Чтобы разобрать ответ программой, попросите модель вернуть JSON по схеме через `response_format`."],
        ["code", [{ label: "Python", code: `resp = client.chat.completions.create(\n    model="openai/gpt-5-mini",\n    messages=[{"role": "user", "content": "Чайник 1,7 л, стекло, 2200 Вт. Сделай карточку товара."}],\n    response_format={\n        "type": "json_schema",\n        "json_schema": {\n            "name": "product",\n            "schema": {\n                "type": "object",\n                "properties": {\n                    "title": {"type": "string"},\n                    "description": {"type": "string"},\n                    "tags": {"type": "array", "items": {"type": "string"}},\n                },\n                "required": ["title", "description", "tags"],\n            },\n        },\n    },\n)\nimport json\nproduct = json.loads(resp.choices[0].message.content)` }]],
        ["note", "Если модель не поддерживает схему, задайте формат в системной инструкции и укажите пример — большинство моделей его соблюдает."],
      ],
    },
    {
      slug: "reasoning", title: "Рассуждения", desc: "Модели, которые думают перед ответом.",
      blocks: [
        ["p", "Модели с отметкой «Рассуждения» сначала разбирают задачу и только потом отвечают. Они точнее в математике, логике и коде, но отвечают дольше и тратят больше токенов."],
        ["table", ["Когда брать", "Когда не нужно"], [["Многошаговые задачи, расчёты, сложный код", "Короткие ответы, перевод, простые тексты"]]],
        ["code", [{ label: "Python", code: `resp = client.chat.completions.create(\n    model="deepseek/deepseek-r1",\n    messages=[{"role": "user", "content": "Сколько будет вклад 100 000 ₽ под 12% годовых через 3 года с ежемесячной капитализацией?"}],\n)` }]],
        ["tip", "Ограничивайте длину ответа через `max_tokens`, чтобы рассуждения не съели бюджет."],
      ],
    },
    {
      slug: "multimodal", title: "Картинки на входе", desc: "Отправить изображение вместе с вопросом.",
      blocks: [
        ["p", "Модели с отметкой «Зрение» понимают картинки. Передайте их в `content` как массив частей: текст и ссылка или base64."],
        ["code", [{ label: "Python", code: `resp = client.chat.completions.create(\n    model="google/gemini-2.5-flash",\n    messages=[{\n        "role": "user",\n        "content": [\n            {"type": "text", "text": "Что на фото и сколько это может стоить?"},\n            {"type": "image_url", "image_url": {"url": "https://example.com/sofa.jpg"}},\n        ],\n    }],\n)` }]],
        ["h2", "Генерация картинок"],
        ["p", "Чтобы нарисовать картинку, используйте [POST /images/generations](/docs/api/images)."],
      ],
    },
    {
      slug: "fallbacks", title: "Запасные модели и провайдеры", desc: "Чтобы запрос не падал, когда модель недоступна.",
      blocks: [
        ["p", "Поле `models` — список запасных моделей по порядку. Поле `provider` управляет выбором провайдера одной модели."],
        ["code", [{ label: "JSON", code: `{\n  "model": "anthropic/claude-sonnet-4.5",\n  "models": ["openai/gpt-5", "google/gemini-2.5-pro"],\n  "provider": {\n    "order": ["mock-backup", "mock-primary"],\n    "allow_fallbacks": true\n  },\n  "messages": [{"role": "user", "content": "…"}]\n}` }]],
        ["params", [["models", "string[]", false, "Запасные модели. Используются по порядку, если основная недоступна"], ["provider.order", "string[]", false, "Порядок провайдеров для модели"], ["provider.allow_fallbacks", "boolean", false, "`false` — не переходить к другому провайдеру"]]],
        ["p", "В ответе поле `model` покажет, какая модель ответила на самом деле, а `provider` — какой провайдер."],
      ],
    },
    {
      slug: "caching", title: "Кэш одинаковых запросов", desc: "Повтор того же вопроса — мгновенно и за 10% цены.",
      blocks: [
        ["p", "Если тот же запрос — с теми же моделями, сообщениями и параметрами — уже отправлялся в течение часа, шлюз не вызывает модель, а отдаёт сохранённый ответ. Это быстрее и стоит 10% обычной цены."],
        ["p", "В ответе `usage.cached` будет `true`, а в истории запросов появится отметка «кэш»."],
        ["h2", "Как выключить"],
        ["ul", ["Для всего аккаунта — в «Настройках».", "Для одного запроса — поле `\"cache\": false`.", "Заголовком `X-Cache: off`."]],
        ["warn", "Если нужны разные ответы на один и тот же вопрос (например, генерация вариантов), выключите кэш для этих запросов."],
      ],
    },
    {
      slug: "presets", title: "Пресеты", desc: "Модель, инструкция и параметры под коротким именем.",
      blocks: [
        ["p", "Пресет хранит модель, системную инструкцию, температуру, длину ответа и запасные модели. Создаётся в кабинете, вызывается как модель `@preset/имя`."],
        ["code", [{ label: "Python", code: `resp = client.chat.completions.create(\n    model="@preset/support-bot",\n    messages=[{"role": "user", "content": "Где мой заказ?"}],\n)` }]],
        ["p", "Меняйте модель или инструкцию в кабинете — код при этом трогать не нужно."],
      ],
    },
  ],
};

export const ACCOUNT: Group = {
  title: "Аккаунт",
  pages: [
    {
      slug: "balance", title: "Баланс и расходы", desc: "Где смотреть траты и как ими управлять.",
      blocks: [
        ["ul", ["**Обзор** — траты, запросы и токены за день, неделю или месяц.", "**История запросов** — каждый запрос с моделью, токенами, стоимостью и временем, выгрузка в CSV и JSON.", "**Баланс и тарифы** — пополнение, подписка, история операций."]],
        ["h2", "Через API"],
        ["code", [{ label: "curl", code: `curl {BASE}/credits -H "Authorization: Bearer $STRELKA_API_KEY"\n# {"data": {"balance": 412.37, "total_usage": 87.63, "currency": "RUB"}}` }]],
        ["tip", "Включите уведомление о низком балансе в разделе «Баланс и тарифы»."],
      ],
    },
    {
      slug: "api-keys", title: "Управление ключами", desc: "Создать, ограничить, выключить и отозвать ключ.",
      blocks: [
        ["p", "Ключи создаются в кабинете или программно, ключом управления. Второе удобно, если вы выдаёте доступ своим клиентам."],
        ["code", [{ label: "Создать", code: `curl -X POST {BASE}/keys \\\n  -H "Authorization: Bearer $STRELKA_MGMT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "client-42", "limit_rub": 500, "limit_reset": "monthly", "rpm_limit": 60}'` }, { label: "Список", code: `curl {BASE}/keys -H "Authorization: Bearer $STRELKA_MGMT_KEY"` }, { label: "Отозвать", code: `curl -X DELETE {BASE}/keys/{id} -H "Authorization: Bearer $STRELKA_MGMT_KEY"` }]],
        ["p", "Полное описание полей — в [справочнике API](/docs/api/keys-create)."],
      ],
    },
    {
      slug: "teams", title: "Команды", desc: "Общий баланс и бюджеты для коллег.",
      blocks: [
        ["steps", [["Пригласите участника", "В разделе «Команда» укажите почту, роль и месячный бюджет. Приглашение появится у человека в кабинете, а ещё можно отправить ссылку."], ["Участник принимает", "После этого он может создавать командные ключи."], ["Расходы — с вашего баланса", "Запросы по командным ключам списываются с баланса владельца, пока не кончится бюджет участника."]]],
        ["p", "Если убрать участника из команды, его командные ключи сразу перестают работать."],
      ],
    },
    {
      slug: "invoices", title: "Оплата для юрлиц", desc: "Счёт на реквизиты компании.",
      blocks: [
        ["ol", ["В разделе «Баланс и тарифы» нажмите «Счёт для юрлица».", "Укажите название, ИНН, КПП и сумму.", "Скачайте счёт в PDF и оплатите с расчётного счёта, указав номер счёта в назначении платежа.", "Деньги поступят на баланс после зачисления на наш счёт, обычно за 1–2 рабочих дня."]],
        ["note", "Закрывающие документы можно запросить через поддержку."],
      ],
    },
  ],
};
