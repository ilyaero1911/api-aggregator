import type { Group, Tab } from "./types";

const AUTH = `-H "Authorization: Bearer $STRELKA_API_KEY"`;
const MGMT = `-H "Authorization: Bearer $STRELKA_MGMT_KEY"`;

const KEY_FIELDS: [string, string, boolean, string][] = [
  ["name", "string", true, "Название ключа, 1–80 символов"],
  ["limit_rub", "number", false, "Лимит расходов в рублях. Без поля — без лимита"],
  ["limit_reset", "string", false, "`never`, `daily`, `weekly` или `monthly`"],
  ["rpm_limit", "integer", false, "Максимум запросов в минуту"],
  ["expires_at", "string", false, "Дата окончания в формате ISO 8601"],
  ["disabled", "boolean", false, "`true` — ключ временно выключен"],
];

const REFERENCE: Group = {
  title: "Модели",
  pages: [
    {
      slug: "overview", title: "Обзор API", desc: "Адрес, авторизация, формат запросов и ответов.",
      blocks: [
        ["p", "API принимает и отдаёт JSON, кодировка UTF-8. Формат совместим с OpenAI."],
        ["table", ["", ""], [["Базовый адрес", "`{BASE}`"], ["Авторизация", "`Authorization: Bearer st-v1-…`"], ["Ошибки", "`{\"error\": {\"code\", \"message\", \"type\"}}`"], ["Деньги", "Рубли, в `usage.cost`"]]],
        ["h2", "Методы"],
        ["table", ["Метод", "Путь", "Описание"], [
          ["POST", "[/chat/completions](/docs/api/chat)", "Ответ модели на сообщения"],
          ["POST", "[/images/generations](/docs/api/images)", "Генерация картинок"],
          ["GET", "[/models](/docs/api/models)", "Список моделей и цены"],
          ["GET", "[/key](/docs/api/key)", "Информация о ключе"],
          ["GET", "[/credits](/docs/api/credits)", "Баланс аккаунта"],
          ["GET", "[/generation](/docs/api/generation)", "Детали конкретного запроса"],
          ["GET · POST · PATCH · DELETE", "[/keys](/docs/api/keys-list)", "Управление ключами"],
        ]],
      ],
    },
    {
      slug: "chat", title: "Чат", desc: "Ответ модели на список сообщений.",
      blocks: [
        ["endpoint", "POST", "/chat/completions"],
        ["h2", "Тело запроса"],
        ["params", [
          ["model", "string", true, "ID модели (`openai/gpt-5`) или пресет (`@preset/имя`)"],
          ["messages", "array", true, "Сообщения: `role` (`system`, `user`, `assistant`, `tool`) и `content` — строка или массив частей"],
          ["stream", "boolean", false, "Отдавать ответ потоком SSE"],
          ["temperature", "number", false, "От 0 до 2. Ниже — точнее, выше — разнообразнее"],
          ["top_p", "number", false, "Альтернатива temperature"],
          ["max_tokens", "integer", false, "Максимум токенов в ответе"],
          ["stop", "string | string[]", false, "Остановить генерацию на этих строках"],
          ["tools", "array", false, "Функции, которые может вызвать модель"],
          ["response_format", "object", false, "JSON-ответ или JSON по схеме"],
          ["models", "string[]", false, "Запасные модели"],
          ["provider", "object", false, "`order` — порядок провайдеров, `allow_fallbacks` — разрешить переход"],
          ["preset", "string", false, "Имя пресета, если не указано в `model`"],
          ["cache", "boolean", false, "`false` — не брать ответ из кэша"],
          ["user", "string", false, "Ваш ID пользователя для своей аналитики"],
        ]],
        ["h2", "Пример"],
        ["code", [{ label: "curl", code: `curl {BASE}/chat/completions \\\n  ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "openai/gpt-5",\n    "messages": [\n      {"role": "system", "content": "Отвечай кратко"},\n      {"role": "user", "content": "Что такое SSE?"}\n    ],\n    "temperature": 0.7,\n    "max_tokens": 512\n  }'` }, { label: "Ответ", code: `{\n  "id": "gen-3f2a…",\n  "object": "chat.completion",\n  "created": 1794500000,\n  "model": "openai/gpt-5",\n  "provider": "mock-primary",\n  "choices": [{\n    "index": 0,\n    "message": {"role": "assistant", "content": "SSE — это способ…"},\n    "finish_reason": "stop"\n  }],\n  "usage": {\n    "prompt_tokens": 21,\n    "completion_tokens": 86,\n    "total_tokens": 107,\n    "cost": 0.0951,\n    "currency": "RUB",\n    "paid_by": "balance",\n    "cached": false\n  }\n}` }]],
        ["h2", "Поля ответа"],
        ["params", [["id", "string", true, "ID генерации, по нему можно запросить детали"], ["model", "string", true, "Модель, которая ответила (с учётом запасных)"], ["provider", "string", true, "Провайдер, который обработал запрос"], ["choices[].finish_reason", "string", true, "`stop` — закончила сама, `length` — упёрлась в `max_tokens`"], ["usage.cost", "number", true, "Стоимость в рублях"], ["usage.paid_by", "string", true, "`balance`, `plan` или `free`"], ["usage.cached", "boolean", true, "Ответ взят из кэша"]]],
      ],
    },
    {
      slug: "images", title: "Картинки", desc: "Генерация изображений по описанию.",
      blocks: [
        ["endpoint", "POST", "/images/generations"],
        ["params", [["model", "string", true, "Модель изображений, например `black-forest-labs/flux-1.1-pro`"], ["prompt", "string", true, "Описание картинки"], ["n", "integer", false, "Сколько картинок, от 1 до 4"], ["size", "string", false, "`1024x1024`, `1024x1536` или `1536x1024`"]]],
        ["code", [{ label: "curl", code: `curl {BASE}/images/generations \\\n  ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "black-forest-labs/flux-1.1-pro", "prompt": "маяк на скале в тумане, гравюра", "n": 1}'` }, { label: "Ответ", code: `{\n  "id": "gen-…",\n  "model": "black-forest-labs/flux-1.1-pro",\n  "data": [{"url": "data:image/png;base64,…"}],\n  "usage": {"cost": 3.98, "currency": "RUB", "paid_by": "balance"}\n}` }]],
        ["note", "Цена считается за каждую картинку и не зависит от длины описания."],
      ],
    },
    {
      slug: "models", title: "Список моделей", desc: "Все модели, их возможности и цены.",
      blocks: [
        ["endpoint", "GET", "/models"],
        ["p", "Открытый метод, ключ не нужен."],
        ["code", [{ label: "curl", code: "curl {BASE}/models" }, { label: "Ответ", code: `{\n  "object": "list",\n  "data": [{\n    "id": "anthropic/claude-sonnet-4.5",\n    "name": "Claude Sonnet 4.5",\n    "owned_by": "Anthropic",\n    "context_length": 200000,\n    "architecture": {"modality": "text", "input_modalities": ["text", "image"]},\n    "pricing": {"prompt": "0.000299", "completion": "0.001494", "currency": "RUB"},\n    "supported_parameters": ["max_tokens", "temperature", "tools", "reasoning"]\n  }]\n}` }]],
        ["p", "`pricing.prompt` и `pricing.completion` — рублей за один токен вопроса и ответа."],
      ],
    },
  ],
};

const ACCOUNT_API: Group = {
  title: "Аккаунт",
  pages: [
    {
      slug: "key", title: "Информация о ключе", desc: "Расход и лимит текущего ключа.",
      blocks: [
        ["endpoint", "GET", "/key"],
        ["code", [{ label: "curl", code: `curl {BASE}/key ${AUTH}` }, { label: "Ответ", code: `{\n  "data": {\n    "label": "prod-backend",\n    "usage": 128.4,\n    "period_usage": 12.1,\n    "limit": 500,\n    "limit_remaining": 487.9,\n    "limit_reset": "monthly",\n    "rate_limit_rpm": 60,\n    "is_free_tier": false,\n    "currency": "RUB"\n  }\n}` }]],
      ],
    },
    {
      slug: "credits", title: "Баланс", desc: "Остаток денег на аккаунте.",
      blocks: [
        ["endpoint", "GET", "/credits"],
        ["code", [{ label: "curl", code: `curl {BASE}/credits ${AUTH}` }, { label: "Ответ", code: `{"data": {"balance": 412.37, "total_usage": 87.63, "currency": "RUB"}}` }]],
      ],
    },
    {
      slug: "generation", title: "Детали запроса", desc: "Токены, стоимость и время конкретного запроса.",
      blocks: [
        ["endpoint", "GET", "/generation?id={id}"],
        ["params", [["id", "string", true, "ID из ответа, например `gen-3f2a…`"]]],
        ["code", [{ label: "curl", code: `curl "{BASE}/generation?id=gen-3f2a…" ${AUTH}` }, { label: "Ответ", code: `{\n  "data": {\n    "id": "gen-3f2a…",\n    "model": "openai/gpt-5",\n    "provider": "mock-primary",\n    "tokens_prompt": 21,\n    "tokens_completion": 86,\n    "total_cost": 0.0951,\n    "latency": 812,\n    "ttft": 240,\n    "streamed": true,\n    "finish_reason": "stop"\n  }\n}` }]],
      ],
    },
  ],
};

const KEYS_API: Group = {
  title: "Управление ключами",
  pages: [
    { slug: "keys-list", title: "Список ключей", desc: "Все активные API-ключи аккаунта.", blocks: [["endpoint", "GET", "/keys"], ["note", "Нужен ключ управления `st-mgmt-…`."], ["code", [{ label: "curl", code: `curl {BASE}/keys ${MGMT}` }]]] },
    { slug: "keys-create", title: "Создать ключ", desc: "Новый API-ключ с лимитами.", blocks: [["endpoint", "POST", "/keys"], ["params", KEY_FIELDS], ["code", [{ label: "curl", code: `curl -X POST {BASE}/keys ${MGMT} \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "client-42", "limit_rub": 500, "limit_reset": "monthly"}'` }, { label: "Ответ", code: `{\n  "id": "8b1e…",\n  "name": "client-42",\n  "prefix": "st-v1-Ab12Cd…9xYz",\n  "secret": "st-v1-…",\n  "limit_micro": 500000000,\n  "limit_reset": "monthly"\n}` }]], ["warn", "Поле `secret` приходит только в ответе на создание. Сохраните его сразу."]] },
    { slug: "keys-update", title: "Изменить ключ", desc: "Поменять название, лимиты или выключить.", blocks: [["endpoint", "PATCH", "/keys/{id}"], ["params", KEY_FIELDS], ["code", [{ label: "curl", code: `curl -X PATCH {BASE}/keys/{id} ${MGMT} \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "client-42", "disabled": true}'` }]]] },
    { slug: "keys-delete", title: "Отозвать ключ", desc: "Ключ перестаёт работать сразу.", blocks: [["endpoint", "DELETE", "/keys/{id}"], ["code", [{ label: "curl", code: `curl -X DELETE {BASE}/keys/{id} ${MGMT}` }]]] },
  ],
};

export const API_TAB: Tab = { id: "api", title: "Справочник API", groups: [REFERENCE, ACCOUNT_API, KEYS_API] };

const PY_SDK = `from openai import OpenAI\nclient = OpenAI(base_url="{BASE}", api_key=os.environ["STRELKA_API_KEY"])`;

export const INTEGRATIONS_TAB: Tab = {
  id: "integrations", title: "Интеграции",
  groups: [
    {
      title: "SDK",
      pages: [
        { slug: "overview", title: "Обзор интеграций", desc: "Где можно использовать Strelka.", blocks: [["p", "Любая библиотека или программа, которая умеет работать с OpenAI, работает и со Strelka: нужно указать наш адрес и ключ."], ["cards", [["OpenAI Python", "Официальный SDK", "/docs/integrations/python"], ["OpenAI Node", "Для JavaScript и TypeScript", "/docs/integrations/node"], ["LangChain", "Цепочки и агенты", "/docs/integrations/langchain"], ["Vercel AI SDK", "Чаты в Next.js", "/docs/integrations/vercel"], ["Редакторы кода", "Continue, Cline и другие", "/docs/integrations/ide"], ["n8n", "Автоматизации без кода", "/docs/integrations/n8n"]]]] },
        { slug: "python", title: "OpenAI Python", desc: "Официальный SDK OpenAI для Python.", blocks: [["code", [{ label: "Установка", code: "pip install openai" }, { label: "Код", code: `import os\n${PY_SDK}\n\nresp = client.chat.completions.create(\n    model="qwen/qwen3-coder",\n    messages=[{"role": "user", "content": "Напиши функцию сортировки на Go"}],\n)\nprint(resp.choices[0].message.content)` }]], ["tip", "Асинхронный клиент `AsyncOpenAI` настраивается так же."]] },
        { slug: "node", title: "OpenAI Node", desc: "SDK для JavaScript и TypeScript.", blocks: [["code", [{ label: "Установка", code: "npm install openai" }, { label: "Код", code: `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "{BASE}", apiKey: process.env.STRELKA_API_KEY });\nconst r = await client.chat.completions.create({ model: "openai/gpt-5-mini", messages: [{ role: "user", content: "Привет" }] });` }]]] },
        { slug: "langchain", title: "LangChain", desc: "Цепочки, агенты и RAG.", blocks: [["code", [{ label: "Установка", code: "pip install langchain-openai" }, { label: "Код", code: `import os\nfrom langchain_openai import ChatOpenAI\n\nllm = ChatOpenAI(\n    model="anthropic/claude-sonnet-4.5",\n    base_url="{BASE}",\n    api_key=os.environ["STRELKA_API_KEY"],\n)\nprint(llm.invoke("Кратко объясни RAG").content)` }]]] },
        { slug: "vercel", title: "Vercel AI SDK", desc: "Потоковые чаты в Next.js.", blocks: [["code", [{ label: "Установка", code: "npm install ai @ai-sdk/openai" }, { label: "Код", code: `import { createOpenAI } from "@ai-sdk/openai";\nimport { streamText } from "ai";\n\nconst strelka = createOpenAI({ baseURL: "{BASE}", apiKey: process.env.STRELKA_API_KEY });\n\nexport async function POST(req: Request) {\n  const { messages } = await req.json();\n  const result = streamText({ model: strelka("google/gemini-2.5-flash"), messages });\n  return result.toDataStreamResponse();\n}` }]]] },
      ],
    },
    {
      title: "Инструменты",
      pages: [
        { slug: "ide", title: "Редакторы кода", desc: "Continue, Cline и другие ассистенты в IDE.", blocks: [["p", "В настройках ассистента выберите провайдера «OpenAI compatible» и укажите:"], ["table", ["Поле", "Значение"], [["Base URL", "`{BASE}`"], ["API key", "ваш ключ `st-v1-…`"], ["Model", "например `qwen/qwen3-coder` или `anthropic/claude-sonnet-4.5`"]]], ["tip", "Для автодополнения берите быстрые и недорогие модели, для чата — модели с рассуждениями."]] },
        { slug: "n8n", title: "n8n", desc: "Автоматизации без кода.", blocks: [["steps", [["Создайте учётные данные OpenAI", "В n8n откройте Credentials → OpenAI и вставьте ключ `st-v1-…`."], ["Укажите адрес", "В поле Base URL впишите `{BASE}`."], ["Выберите модель", "В узле OpenAI Chat Model укажите ID модели из нашего каталога."]]]] },
      ],
    },
  ],
};
