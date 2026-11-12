import { CodeBlock } from "@/components/ui";
import { getDict } from "@/lib/i18n/server";
import { loadConfig } from "@/lib/server-data";

export const metadata = { title: "Документация" };

type Sec = { id: string; title: [string, string]; text: [string, string]; code?: string; table?: [string, string, string][] };

export default async function Docs() {
  const { t, lang } = await getDict();
  const { api_base_url: base } = await loadConfig();
  const L = lang === "en" ? 1 : 0;
  const secs: Sec[] = [
    { id: "auth", title: ["Авторизация", "Authentication"],
      text: ["Передавайте ключ в заголовке Authorization. Ключ создаётся в кабинете на странице «API-ключи». Базовый адрес API:", "Pass the key in the Authorization header. Create keys on the “API keys” page. Base URL:"],
      code: `Authorization: Bearer ng-v1-…\nBase URL: ${base}` },
    { id: "chat", title: ["Чат: /chat/completions", "Chat: /chat/completions"],
      text: ["Формат запроса и ответа совпадает с OpenAI. В ответе usage дополнительно содержит cost (в рублях) и paid_by — чем оплачен запрос: balance, plan или free.", "Request and response match OpenAI. usage additionally contains cost (in rubles) and paid_by: balance, plan or free."],
      code: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $NG_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "openai/gpt-5",\n    "messages": [\n      {"role": "system", "content": "Отвечай кратко"},\n      {"role": "user", "content": "Что такое SSE?"}\n    ],\n    "temperature": 0.7,\n    "max_tokens": 512\n  }'` },
    { id: "stream", title: ["Потоковые ответы", "Streaming"],
      text: ["С \"stream\": true ответ приходит событиями Server-Sent Events. Последний чанк содержит finish_reason, usage и generation_id, затем приходит data: [DONE].", "With \"stream\": true the response arrives as Server-Sent Events. The last chunk carries finish_reason, usage and generation_id, followed by data: [DONE]."],
      code: `data: {"id":"gen-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Привет"}}]}\n\ndata: {"id":"gen-…","generation_id":"gen-…","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":40,"cost":0.0123,"currency":"RUB","paid_by":"balance"}}\n\ndata: [DONE]` },
    { id: "fallbacks", title: ["Запасные модели и провайдеры", "Fallbacks and provider routing"],
      text: ["Поле models задаёт запасные модели: если первая недоступна, запрос уходит на следующую. Поле provider.order задаёт порядок провайдеров, provider.allow_fallbacks: false запрещает переход на другого провайдера.", "The models field lists fallback models tried in order. provider.order sets provider order; provider.allow_fallbacks: false disables switching providers."],
      code: `{\n  "model": "anthropic/claude-sonnet-4.5",\n  "models": ["openai/gpt-5", "google/gemini-2.5-pro"],\n  "provider": { "order": ["mock-backup"], "allow_fallbacks": true },\n  "messages": [{"role": "user", "content": "…"}]\n}` },
    { id: "presets", title: ["Пресеты", "Presets"],
      text: ["Пресет хранит модель, системный промпт, параметры и запасные модели. Вызывайте его как модель @preset/имя или через поле preset.", "A preset stores a model, system prompt, parameters and fallbacks. Call it as model @preset/name or via the preset field."],
      code: `{"model": "@preset/support-bot", "messages": [{"role": "user", "content": "Где мой заказ?"}]}` },
    { id: "images", title: ["Изображения: /images/generations", "Images: /images/generations"],
      text: ["Генерация изображений в формате OpenAI. n — от 1 до 4. Стоимость считается за каждое изображение.", "OpenAI-style image generation. n is 1 to 4, billed per image."],
      code: `curl ${base}/images/generations \\\n  -H "Authorization: Bearer $NG_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "black-forest-labs/flux-1.1-pro", "prompt": "маяк в тумане", "n": 1}'` },
    { id: "models", title: ["Список моделей: /models", "Models: /models"],
      text: ["Публичный метод без ключа. Цены в pricing — в рублях за один токен (за изображение для image).", "Public, no key needed. pricing is in rubles per token (per image for image models)."],
      code: `curl ${base}/models` },
    { id: "account", title: ["Ключ, баланс, генерация", "Key, credits, generation"],
      text: ["Служебные методы для проверки ключа, остатка и деталей конкретного запроса.", "Utility methods to inspect the key, balance and a specific request."],
      table: [["GET", "/key", lang === "en" ? "Key label, usage, limit and remaining" : "Название ключа, расход, лимит и остаток"], ["GET", "/credits", lang === "en" ? "Balance and total usage, RUB" : "Баланс и общий расход, ₽"], ["GET", "/generation?id=gen-…", lang === "en" ? "Tokens, cost, latency of a request" : "Токены, стоимость и время запроса"]] },
    { id: "mgmt", title: ["Управление ключами: /keys", "Key management: /keys"],
      text: ["Работает только с ключом управления (ng-mgmt-…). Позволяет выпускать ключи для клиентов и ограничивать их расходы.", "Requires a management key (ng-mgmt-…). Issue keys for your customers and cap their spend."],
      code: `# создать ключ с лимитом 500 ₽ в месяц\ncurl -X POST ${base}/keys \\\n  -H "Authorization: Bearer $NG_MGMT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "client-42", "limit_rub": 500, "limit_reset": "monthly", "rpm_limit": 60}'\n\ncurl ${base}/keys -H "Authorization: Bearer $NG_MGMT_KEY"\ncurl -X PATCH ${base}/keys/{id} -H "Authorization: Bearer $NG_MGMT_KEY" -d '{"name": "client-42", "disabled": true}'\ncurl -X DELETE ${base}/keys/{id} -H "Authorization: Bearer $NG_MGMT_KEY"` },
    { id: "errors", title: ["Ошибки и лимиты", "Errors and limits"],
      text: ["Ошибки возвращаются в формате OpenAI: {\"error\": {\"code\", \"message\", \"type\"}}.", "Errors follow the OpenAI shape: {\"error\": {\"code\", \"message\", \"type\"}}."],
      table: [["400", "bad_json, messages_required", lang === "en" ? "Invalid request" : "Неверный запрос"], ["401", "invalid_api_key, key_disabled, key_expired", lang === "en" ? "Key problem" : "Проблема с ключом"], ["402", "insufficient_balance, key_limit", lang === "en" ? "Out of balance or key limit" : "Нет денег или исчерпан лимит ключа"], ["404", "model_not_found, preset_not_found", lang === "en" ? "Unknown model or preset" : "Нет такой модели или пресета"], ["429", "rate_limited, concurrency_limit, free_limit", lang === "en" ? "Too many requests" : "Слишком много запросов"], ["502", "upstream_error", lang === "en" ? "All providers failed" : "Все провайдеры недоступны"]] },
  ];

  return (
    <div className="wrap docs">
      <nav className="docs-nav">
        <div className="label">{t.docs.title}</div>
        {secs.map((s, i) => <a key={s.id} href={`#${s.id}`}><span className="mono faint">{String(i + 1).padStart(2, "0")}</span> {s.title[L]}</a>)}
      </nav>
      <article className="docs-body">
        <header className="page-head"><div><h1 className="h1">{t.docs.title}</h1><p className="muted" style={{ marginTop: 8 }}>{t.docs.lead}</p></div></header>
        {secs.map((s, i) => (
          <section key={s.id} id={s.id} className="docs-sec">
            <div className="label">{String(i + 1).padStart(2, "0")}</div>
            <h2 className="h2">{s.title[L]}</h2>
            <p className="muted">{s.text[L]}</p>
            {s.code && <CodeBlock lang={s.code.startsWith("curl") || s.code.startsWith("#") ? "shell" : "json"} code={s.code} />}
            {s.table && (
              <table className="table"><tbody>{s.table.map((r) => <tr key={r[1]}><td className="mono" style={{ width: 70 }}>{r[0]}</td><td className="mono">{r[1]}</td><td className="muted">{r[2]}</td></tr>)}</tbody></table>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
