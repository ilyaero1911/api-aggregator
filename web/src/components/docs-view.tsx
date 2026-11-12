"use client";

import { useEffect, useState } from "react";
import { CodeBlock } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

type Param = [name: string, type: string, desc: string];
type Sec = { id: string; group: string; title: string; text: string[]; params?: Param[]; code?: { label: string; code: string }[]; table?: [string, string, string][] };

function sections(base: string, en: boolean): Sec[] {
  const L = (ru: string, e: string) => (en ? e : ru);
  return [
    {
      id: "how", group: L("Начало", "Getting started"), title: L("Как устроен шлюз", "How the gateway works"),
      text: [
        L("Один формат. Меняете base_url в любом OpenAI SDK, и всё работает: тот же /chat/completions и те же потоковые ответы.", "One format. Change base_url in any OpenAI SDK and it works: the same /chat/completions and the same streaming."),
        L("Запасные маршруты. Если провайдер упал или перегружен, запрос уходит к следующему. Порядок провайдеров и запасные модели можно задать самому.", "Backup routes. If a provider fails or is overloaded, the request goes to the next one. You can set the provider order and fallback models."),
        L("Цены в рублях. Цены провайдеров пересчитываются по курсу ЦБ каждый час. Списываем за фактические токены после каждого запроса.", "Ruble pricing. Provider prices are converted at the Bank of Russia rate every hour. You pay for actual tokens after each request."),
        L("Контроль расходов. У ключа есть лимит по дням, неделям или месяцам и ограничение запросов в минуту, а в истории видно каждый запрос.", "Spend control. Keys have daily, weekly or monthly limits and a requests-per-minute cap, and every request is in the history."),
      ],
    },
    {
      id: "quickstart", group: L("Начало", "Getting started"), title: L("Быстрый старт", "Quickstart"),
      text: [
        L("1. Зарегистрируйтесь и создайте API-ключ в разделе «API-ключи».", "1. Sign up and create an API key on the “API keys” page."),
        L("2. Пополните баланс или выберите тариф. Бесплатные модели работают сразу.", "2. Top up or pick a plan. Free models work right away."),
        L("3. Возьмите любой OpenAI SDK и поменяйте два параметра: адрес и ключ.", "3. Take any OpenAI SDK and change two settings: base URL and key."),
      ],
      code: [
        { label: "python", code: `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="ng-v1-…")\n\nresp = client.chat.completions.create(\n    model="deepseek/deepseek-v3.2",\n    messages=[{"role": "user", "content": "${L("Привет!", "Hello!")}"}],\n)\nprint(resp.choices[0].message.content)` },
        { label: "typescript", code: `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "${base}", apiKey: process.env.NG_API_KEY });\n\nconst resp = await client.chat.completions.create({\n  model: "deepseek/deepseek-v3.2",\n  messages: [{ role: "user", content: "${L("Привет!", "Hello!")}" }],\n});\nconsole.log(resp.choices[0].message.content);` },
        { label: "curl", code: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $NG_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "deepseek/deepseek-v3.2", "messages": [{"role": "user", "content": "${L("Привет!", "Hello!")}"}]}'` },
      ],
    },
    {
      id: "auth", group: L("Начало", "Getting started"), title: L("Авторизация", "Authentication"),
      text: [L("Ключ передаётся в заголовке Authorization. Ключи начинаются с ng-v1-. Не храните ключ во фронтенде: любой, кто его увидит, сможет тратить ваш баланс.", "Send the key in the Authorization header. Keys start with ng-v1-. Never ship a key to the browser: anyone who sees it can spend your balance.")],
      code: [{ label: "http", code: `Authorization: Bearer ng-v1-…\n\nBase URL: ${base}` }],
    },
    {
      id: "chat", group: L("Модели", "Models"), title: "POST /chat/completions",
      text: [L("Основной метод: отправляете сообщения, получаете ответ модели. Формат как у OpenAI. В usage дополнительно приходят cost (стоимость в рублях) и paid_by — чем оплачен запрос.", "The main method: send messages, get the model's reply. OpenAI format. usage additionally contains cost (in rubles) and paid_by.")],
      params: [
        ["model", "string", L("ID модели, например openai/gpt-5, или @preset/имя", "Model ID such as openai/gpt-5, or @preset/name")],
        ["messages", "array", L("Сообщения: role (system, user, assistant) и content", "Messages: role (system, user, assistant) and content")],
        ["stream", "boolean", L("Отдавать ответ по частям через SSE", "Stream the answer via SSE")],
        ["temperature", "number", L("0–2. Чем выше, тем разнообразнее ответ", "0–2. Higher means more varied output")],
        ["max_tokens", "integer", L("Максимум токенов в ответе", "Maximum tokens in the answer")],
        ["models", "array", L("Запасные модели, если первая недоступна", "Fallback models if the first is unavailable")],
        ["provider.order", "array", L("Порядок провайдеров", "Provider order")],
      ],
      code: [
        { label: "request", code: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $NG_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "openai/gpt-5",\n    "messages": [\n      {"role": "system", "content": "${L("Отвечай кратко", "Be brief")}"},\n      {"role": "user", "content": "${L("Что такое SSE?", "What is SSE?")}"}\n    ],\n    "temperature": 0.7,\n    "max_tokens": 512\n  }'` },
        { label: "response", code: `{\n  "id": "gen-…",\n  "object": "chat.completion",\n  "model": "openai/gpt-5",\n  "provider": "mock-primary",\n  "choices": [{\n    "index": 0,\n    "message": {"role": "assistant", "content": "…"},\n    "finish_reason": "stop"\n  }],\n  "usage": {\n    "prompt_tokens": 21, "completion_tokens": 86, "total_tokens": 107,\n    "cost": 0.0951, "currency": "RUB", "paid_by": "balance"\n  }\n}` },
      ],
    },
    {
      id: "stream", group: L("Модели", "Models"), title: L("Потоковые ответы", "Streaming"),
      text: [L("С \"stream\": true ответ приходит частями, как печатает модель. Последний кусок содержит finish_reason, usage и generation_id, затем строка data: [DONE].", "With \"stream\": true the answer arrives in chunks as the model types. The last chunk carries finish_reason, usage and generation_id, then data: [DONE].")],
      code: [{ label: "sse", code: `data: {"id":"gen-…","choices":[{"index":0,"delta":{"content":"${L("Привет", "Hello")}"}}]}\n\ndata: {"id":"gen-…","generation_id":"gen-…","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":40,"cost":0.0123,"currency":"RUB","paid_by":"balance"}}\n\ndata: [DONE]` }],
    },
    {
      id: "fallbacks", group: L("Модели", "Models"), title: L("Запасные модели и провайдеры", "Fallbacks and routing"),
      text: [L("Если модель или провайдер не отвечает, шлюз сам пробует следующий вариант. Порядок можно задать.", "If a model or provider fails, the gateway tries the next option. You can set the order.")],
      code: [{ label: "json", code: `{\n  "model": "anthropic/claude-sonnet-4.5",\n  "models": ["openai/gpt-5", "google/gemini-2.5-pro"],\n  "provider": { "order": ["mock-backup"], "allow_fallbacks": true },\n  "messages": [{"role": "user", "content": "…"}]\n}` }],
    },
    {
      id: "presets", group: L("Модели", "Models"), title: L("Пресеты", "Presets"),
      text: [L("Пресет хранит модель, системный промпт, параметры и запасные модели. Создаётся в кабинете, вызывается как модель @preset/имя.", "A preset stores a model, system prompt, parameters and fallbacks. Create it in the dashboard, call it as model @preset/name.")],
      code: [{ label: "json", code: `{"model": "@preset/support-bot", "messages": [{"role": "user", "content": "${L("Где мой заказ?", "Where is my order?")}"}]}` }],
    },
    {
      id: "images", group: L("Модели", "Models"), title: "POST /images/generations",
      text: [L("Генерация изображений. Цена указана за одно изображение.", "Image generation, priced per image.")],
      params: [["model", "string", L("Модель изображений", "Image model")], ["prompt", "string", L("Описание картинки", "What to draw")], ["n", "integer", "1–4"], ["size", "string", "1024x1024"]],
      code: [{ label: "curl", code: `curl ${base}/images/generations \\\n  -H "Authorization: Bearer $NG_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "black-forest-labs/flux-1.1-pro", "prompt": "${L("маяк в тумане", "lighthouse in fog")}", "n": 1}'` }],
    },
    {
      id: "models", group: L("Справочные", "Reference"), title: "GET /models",
      text: [L("Список моделей без ключа. Цены в pricing — в рублях за один токен (для изображений — за картинку).", "List of models, no key required. pricing is in rubles per token (per image for image models).")],
      code: [{ label: "curl", code: `curl ${base}/models` }],
    },
    {
      id: "account", group: L("Справочные", "Reference"), title: L("Ключ, баланс, запрос", "Key, balance, request"),
      text: [L("Служебные методы, чтобы проверить ключ, остаток денег и детали конкретного запроса.", "Utility methods to check the key, balance and a specific request.")],
      table: [["GET", "/key", L("Название ключа, расход, лимит и остаток", "Key label, usage, limit and remaining")], ["GET", "/credits", L("Баланс и общий расход", "Balance and total usage")], ["GET", "/generation?id=gen-…", L("Токены, стоимость и время запроса", "Tokens, cost and timing of a request")]],
      code: [{ label: "curl", code: `curl ${base}/key -H "Authorization: Bearer $NG_API_KEY"\ncurl ${base}/credits -H "Authorization: Bearer $NG_API_KEY"` }],
    },
    {
      id: "mgmt", group: L("Справочные", "Reference"), title: L("Управление ключами", "Key management"),
      text: [L("Нужен ключ управления (ng-mgmt-…). Так можно выдавать ключи своим клиентам и ограничивать их расходы.", "Requires a management key (ng-mgmt-…). Issue keys for your customers and cap their spend.")],
      params: [["name", "string", L("Название", "Label")], ["limit_rub", "number", L("Лимит расходов в рублях", "Spend limit in rubles")], ["limit_reset", "string", "never | daily | weekly | monthly"], ["rpm_limit", "integer", L("Запросов в минуту", "Requests per minute")], ["disabled", "boolean", L("Выключить ключ", "Disable the key")]],
      code: [{ label: "curl", code: `curl -X POST ${base}/keys \\\n  -H "Authorization: Bearer $NG_MGMT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "client-42", "limit_rub": 500, "limit_reset": "monthly", "rpm_limit": 60}'\n\ncurl ${base}/keys -H "Authorization: Bearer $NG_MGMT_KEY"\ncurl -X DELETE ${base}/keys/{id} -H "Authorization: Bearer $NG_MGMT_KEY"` }],
    },
    {
      id: "errors", group: L("Справочные", "Reference"), title: L("Ошибки", "Errors"),
      text: [L("Ошибки приходят в формате OpenAI: {\"error\": {\"code\", \"message\", \"type\"}}.", "Errors use the OpenAI shape: {\"error\": {\"code\", \"message\", \"type\"}}.")],
      table: [["400", "bad_json, messages_required", L("Неверный запрос", "Invalid request")], ["401", "invalid_api_key, key_disabled", L("Проблема с ключом", "Key problem")], ["402", "insufficient_balance, key_limit", L("Нет денег или исчерпан лимит ключа", "No balance or key limit reached")], ["404", "model_not_found", L("Нет такой модели", "Unknown model")], ["429", "rate_limited, free_limit", L("Слишком много запросов", "Too many requests")], ["502", "upstream_error", L("Все провайдеры недоступны", "All providers failed")]],
    },
  ];
}

export function DocsView({ base }: { base: string }) {
  const { lang, t } = useI18n();
  const secs = sections(base, lang === "en");
  const [active, setActive] = useState(secs[0].id);
  useEffect(() => {
    const obs = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    document.querySelectorAll(".dsec").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [lang]);
  const groups = Array.from(new Set(secs.map((s) => s.group)));
  return (
    <div className="wrap docs2">
      <nav className="docs2-nav">
        {groups.map((g) => (
          <div key={g} className="stack" style={{ ["--gap" as string]: "2px" }}>
            <div className="label" style={{ marginBottom: 6 }}>{g}</div>
            {secs.filter((s) => s.group === g).map((s) => (
              <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "true" : undefined}>{s.title}</a>
            ))}
          </div>
        ))}
      </nav>
      <div className="docs2-body">
        <header className="docs2-head">
          <h1 className="h1" style={{ fontSize: 40 }}>{t.docs.title}</h1>
          <p className="muted">{t.docs.lead}</p>
          <div className="row-wrap small mono"><span className="tag">Base URL</span><code>{base}</code></div>
        </header>
        {secs.map((s) => (
          <section key={s.id} id={s.id} className="dsec">
            <div className="dsec-text">
              <h2 className="h2">{s.title}</h2>
              {s.text.map((p) => <p key={p}>{p}</p>)}
              {s.params && (
                <dl className="params">
                  {s.params.map(([n, ty, d]) => (
                    <div key={n}><dt><code>{n}</code> <span className="faint mono small">{ty}</span></dt><dd>{d}</dd></div>
                  ))}
                </dl>
              )}
              {s.table && (
                <table className="table"><tbody>{s.table.map((r) => <tr key={r[1]}><td className="mono" style={{ width: 60 }}>{r[0]}</td><td className="mono small">{r[1]}</td><td className="muted small">{r[2]}</td></tr>)}</tbody></table>
              )}
            </div>
            <div className="dsec-code">{s.code && <CodeBlock tabs={s.code} />}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
