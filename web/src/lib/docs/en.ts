import type { Block } from "./types";

/**
 * Английская версия документации. Ключ — путь страницы. ["same", i] берёт блок i из русской версии
 * (код, адреса методов), чтобы не дублировать примеры.
 */
export type EnBlock = Block | ["same", number];
export type EnPage = { title: string; desc: string; blocks: EnBlock[] };

export const EN_TABS: Record<string, string> = { docs: "Documentation", api: "API reference", integrations: "Integrations" };
export const EN_GROUPS: Record<string, string> = {
  "Начало работы": "Getting started", "Как это работает": "How it works", "Руководства": "Guides", "Аккаунт": "Account",
  "Модели": "Models", "Управление ключами": "Key management", "SDK": "SDK", "Инструменты": "Tools",
};

export const EN: Record<string, EnPage> = {
  "start/introduction": {
    title: "Introduction", desc: "What Strelka is and how to start in five minutes.",
    blocks: [
      ["p", "Strelka is one API for language models: Claude, GPT, Gemini, DeepSeek, Qwen, Llama, Grok and more. Connect once, pay from one balance, and the gateway picks a provider and switches to a backup when the primary one fails."],
      ["p", "The API is fully compatible with OpenAI. If you already have OpenAI SDK code, change the base URL and the key."],
      ["h2", "Base URL"], ["same", 3], ["h2", "Example request"], ["same", 5],
      ["h2", "Where to start"],
      ["cards", [["Quickstart", "Key, first request and answer in five minutes", "/docs/start/quickstart"], ["Authentication", "How to send and protect the key", "/docs/start/authentication"], ["Models", "How to pick a model and see its price", "/docs/start/models"], ["Billing", "Balance, plans, per-token charges", "/docs/start/billing"]]],
      ["h2", "Guides"],
      ["cards", [["Streaming", "Show the answer as it is written", "/docs/guides/streaming"], ["Tool calling", "Let the model call your functions", "/docs/guides/tool-calling"], ["Structured outputs", "Strict JSON by schema", "/docs/guides/structured-outputs"], ["Fallbacks", "What happens when a model is down", "/docs/guides/fallbacks"], ["Caching", "Repeat requests for 10% of the price", "/docs/guides/caching"], ["Presets", "Model and prompt under a short name", "/docs/guides/presets"]]],
    ],
  },
  "start/quickstart": {
    title: "Quickstart", desc: "From sign-up to the first model answer.",
    blocks: [
      ["steps", [["Sign up", "Create an account. You get a starter bonus and free models work right away."], ["Create a key", "Open “API keys” in the dashboard and click “Create key”. Copy the secret: it is shown once."], ["Top up or pick a plan", "Paid models charge the balance per use. A plan gives tokens for models marked “in plan”."], ["Send a request", "Use any OpenAI SDK with our base URL and your key."]]],
      ["h2", "Python"], ["same", 2], ["h2", "JavaScript / TypeScript"], ["same", 4],
      ["h2", "What comes back"],
      ["p", "The response matches OpenAI. `usage` also has `cost` — the price in rubles, `paid_by` — `balance`, `plan` or `free`, and `cached` — whether the answer came from the cache."],
      ["tip", "You can try models without code in the dashboard: “Chat with models”."],
    ],
  },
  "start/authentication": {
    title: "Authentication", desc: "How to send the key and keep it safe.",
    blocks: [
      ["p", "Every `/v1` request is signed with an API key in the `Authorization` header."], ["same", 1],
      ["h2", "Key types"],
      ["table", ["Key", "Prefix", "Purpose"], [["API key", "`st-v1-`", "Model requests: chat, images, key and balance info"], ["Management key", "`st-mgmt-`", "Create, update and revoke API keys via `/v1/keys`. Cannot call models"]]],
      ["h2", "Key limits"],
      ["ul", ["**Spend limit** in rubles, reset daily, weekly or monthly.", "**Requests per minute** — protection from runaway loops.", "**Expiry date** — the key stops working on that date.", "**Team key** charges the team owner's balance."]],
      ["h2", "Security"],
      ["warn", "Never put the key into website or mobile app code: anyone who sees it can spend your balance. Call the API from your server only."],
      ["ul", ["Keep the key in an environment variable such as `STRELKA_API_KEY`.", "Use a separate key per project with a limit.", "If a key leaks, revoke it in the dashboard — it stops working immediately."]],
    ],
  },
  "start/models": {
    title: "Models", desc: "Choosing a model, its price and capabilities.",
    blocks: [
      ["p", "Set the model in `model` as `author/name`, e.g. `anthropic/claude-sonnet-4.5`. The full list with prices is in the [catalog](/models)."],
      ["h2", "How to choose"],
      ["table", ["Task", "Use"], [["Simple answers, classification, drafts", "Budget models: `deepseek/deepseek-v3.2`, `openai/gpt-5-mini`, `google/gemini-2.5-flash`"], ["Code and agents", "`anthropic/claude-sonnet-4.5`, `qwen/qwen3-coder`"], ["Hard reasoning and maths", "`openai/gpt-5`, `deepseek/deepseek-r1`, `google/gemini-2.5-pro`"], ["Long documents", "1M+ context: `google/gemini-2.5-pro`, `openai/gpt-4.1`"], ["Free experiments", "Models with `:free`, e.g. `deepseek/deepseek-v3.2:free`"]]],
      ["h2", "List models via API"], ["same", 4],
      ["p", "Public, no key required. `pricing` is in rubles per token."],
      ["h2", "Capabilities"],
      ["ul", ["**Vision** — understands images in messages.", "**Tools** — can call your functions.", "**Reasoning** — thinks before answering, better at hard tasks.", "**In plan** — paid with subscription tokens."]],
    ],
  },
  "start/billing": {
    title: "Billing", desc: "Balance, plans, tokens and the dollar rate.",
    blocks: [
      ["p", "Everything is billed in rubles. Providers price models in dollars per million tokens; we convert at the Bank of Russia rate, refreshed hourly, and add a fixed markup."],
      ["h2", "What a token is"],
      ["p", "A token is a small piece of text; in English 100 words are about 130 tokens. “Price per million tokens” works like a price per kilogram: you pay only for what you used. See the calculator on the [pricing page](/pricing#how)."],
      ["h2", "How charging works"],
      ["ol", ["Before a request the gateway checks the balance is positive and the key limit is not reached.", "The model answers and the gateway counts prompt and answer tokens.", "The cost is taken from the balance and recorded in the request history."]],
      ["table", ["Paid by", "When"], [["`free`", "Free model within the daily limit"], ["`plan`", "Model is in your plan and plan tokens remain"], ["`balance`", "Everything else"]]],
      ["h2", "Plans"], ["p", "A subscription gives tokens for models marked “in plan”, more free requests per day and more concurrent requests. Other models are billed from the balance."],
      ["h2", "Top-ups"], ["ul", ["By card — in “Billing”.", "For companies — by invoice: enter company details, download the invoice and pay from the company account.", "Promo codes add money to the balance."]],
      ["note", "If the last request took the balance slightly below zero, the next one returns 402 until you top up."],
    ],
  },
  "start/rate-limits": {
    title: "Rate limits", desc: "How many requests you can send and what to do on 429.",
    blocks: [
      ["table", ["Limit", "Value", "How to change"], [["Concurrent requests", "4 without a plan, 1 for free models, 4–16 on plans", "Pick a plan"], ["Free models", "50 requests/day without a plan, more on plans", "Plan"], ["Key requests per minute", "Unlimited unless set", "Key settings"], ["Public endpoints without a key", "60–120 per minute per IP", "—"]]],
      ["h2", "When exceeded"], ["p", "The gateway returns `429` with `rate_limited`, `concurrency_limit` or `free_limit`. Wait and retry."], ["same", 3],
    ],
  },
  "start/errors": {
    title: "Errors", desc: "Error codes and what to do.",
    blocks: [
      ["p", "Errors follow the OpenAI format, so SDKs handle them as usual."], ["same", 1],
      ["table", ["Status", "Code", "Meaning", "What to do"], [["400", "`bad_json`, `messages_required`, `model_required`", "Malformed request", "Check the body"], ["401", "`invalid_api_key`, `key_disabled`, `key_expired`", "Key rejected", "Check the key"], ["402", "`insufficient_balance`, `key_limit`, `team_budget`", "No money or limit reached", "Top up or raise the limit"], ["403", "`account_blocked`, `team_access_revoked`", "Access denied", "Contact support"], ["404", "`model_not_found`, `preset_not_found`", "Unknown model or preset", "Check the catalog"], ["429", "`rate_limited`, `concurrency_limit`, `free_limit`", "Too many requests", "Retry later"], ["502", "`upstream_error`", "All providers failed", "Add fallback models"]]],
      ["tip", "Provider errors are handled by the gateway: if one provider fails the request goes to the next, and you only get an error when all are down."],
    ],
  },
  "start/migration": {
    title: "Migrating from OpenAI", desc: "Move existing code in a couple of minutes.",
    blocks: [
      ["p", "Change two lines: base URL and key. Model names include the author: `openai/gpt-5` instead of `gpt-5`."], ["same", 1],
      ["h2", "Works the same"], ["ul", ["`/chat/completions` with and without streaming", "`tools` and `tool_choice`", "`response_format` for JSON", "`/images/generations`", "`/models`"]],
      ["h2", "What's added"], ["ul", ["`models` — fallback models.", "`provider` — provider order.", "`preset` or model `@preset/name`.", "Cost in rubles in `usage`."]],
    ],
  },
  "start/faq": {
    title: "FAQ", desc: "The most common questions, briefly.",
    blocks: [
      ["h3", "Do you store my prompts?"], ["p", "No. History keeps metadata only: model, tokens, cost and time. Prompt text is stored only if you enable it in privacy settings."],
      ["h3", "Where is data stored?"], ["p", "User personal data is stored on servers in Russia and processed under Federal Law 152-FZ. See the [privacy policy](/legal/privacy)."],
      ["h3", "Can a company pay?"], ["p", "Yes, issue an invoice for your company in “Billing”."],
      ["h3", "What if a provider goes down?"], ["p", "The gateway sends the request to another provider of the same model, and to the next fallback model if you listed one."],
      ["h3", "How do I cap spending?"], ["p", "Each key has a ruble limit reset daily, weekly or monthly. Team members have a monthly budget."],
      ["h3", "Still have questions?"], ["p", "Write to support from the dashboard — we reply there."],
    ],
  },
  "concepts/how-it-works": {
    title: "How the gateway works", desc: "The path of a request from your code to the model and back.",
    blocks: [
      ["p", "The gateway sits between your app and model providers. It accepts OpenAI-format requests, checks the key and balance, picks a provider, forwards the request, counts tokens and charges the cost."],
      ["steps", [["Check", "The key is active, the account has money or plan tokens, limits are not exceeded."], ["Pick a model", "The model from `model`, a preset, or the first available one from `models`."], ["Pick a provider", "A model may have several providers. The gateway follows priority or your `provider.order`."], ["Answer and accounting", "The answer is returned as is, tokens are counted, the ruble cost is charged and logged."]]],
      ["h2", "If a provider is down"], ["p", "The gateway tries the next provider of the same model, then the next model from `models`. You only get an error when everything is down."],
      ["h2", "What we store"], ["p", "Model, provider, token counts, cost, latency and status. Prompt text is not stored unless you enable it."],
    ],
  },
  "guides/streaming": {
    title: "Streaming", desc: "Show the answer as the model writes it.",
    blocks: [
      ["p", "Add `\"stream\": true` and the answer arrives in chunks via Server-Sent Events, so users see text immediately."], ["same", 1],
      ["h2", "Stream format"], ["same", 3], ["note", "Cost and tokens arrive in the last chunk, right before `[DONE]`."],
      ["h2", "Cancelling"], ["p", "Closing the connection stops generation. You pay only for tokens already written."],
    ],
  },
  "guides/tool-calling": {
    title: "Tool calling", desc: "The model decides when to call your function.",
    blocks: [
      ["p", "Describe functions in `tools`. The model may answer with a request to call a function with arguments; you run it and send the result back."], ["same", 1],
      ["h2", "Returning the result"], ["same", 3], ["tip", "Tool calling is supported by models marked “Tools” in the catalog."],
    ],
  },
  "guides/structured-outputs": {
    title: "Structured outputs", desc: "Strict JSON instead of free text.",
    blocks: [["p", "To parse the answer programmatically, ask for JSON by schema via `response_format`."], ["same", 1], ["note", "If a model does not support schemas, describe the format in the system instruction with an example — most models follow it."]],
  },
  "guides/reasoning": {
    title: "Reasoning", desc: "Models that think before answering.",
    blocks: [["p", "Models marked “Reasoning” analyse the task before answering. They are more accurate at maths, logic and code but slower and use more tokens."], ["table", ["Use when", "Not needed for"], [["Multi-step tasks, calculations, complex code", "Short answers, translation, simple texts"]]], ["same", 2], ["tip", "Limit the answer with `max_tokens` so reasoning does not eat the budget."]],
  },
  "guides/multimodal": {
    title: "Image inputs", desc: "Send an image along with the question.",
    blocks: [["p", "Models marked “Vision” understand images. Pass them in `content` as parts: text plus a URL or base64."], ["same", 1], ["h2", "Generating images"], ["p", "To draw an image, use [POST /images/generations](/docs/api/images)."]],
  },
  "guides/fallbacks": {
    title: "Fallback models and providers", desc: "So requests do not fail when a model is down.",
    blocks: [
      ["p", "`models` is an ordered list of fallback models. `provider` controls provider choice for one model."], ["same", 1],
      ["params", [["models", "string[]", false, "Fallback models, tried in order if the main one is unavailable"], ["provider.order", "string[]", false, "Provider order for the model"], ["provider.allow_fallbacks", "boolean", false, "`false` — do not switch providers"]]],
      ["p", "`model` in the response shows which model actually answered, and `provider` which provider."],
    ],
  },
  "guides/caching": {
    title: "Caching", desc: "Repeat the same request instantly for 10% of the price.",
    blocks: [
      ["p", "If the same request — same models, messages and parameters — was sent within an hour, the gateway returns the saved answer without calling the model. It is faster and costs 10% of the normal price."],
      ["p", "`usage.cached` is `true` and the request history shows a “cache” tag."],
      ["h2", "Turning it off"], ["ul", ["For the account — in Settings.", "For one request — `\"cache\": false`.", "With the `X-Cache: off` header."]],
      ["warn", "If you need different answers to the same question (e.g. generating variants), disable the cache for those requests."],
    ],
  },
  "guides/presets": {
    title: "Presets", desc: "Model, instruction and parameters under a short name.",
    blocks: [["p", "A preset stores the model, system instruction, temperature, answer length and fallbacks. Create it in the dashboard and call it as model `@preset/name`."], ["same", 1], ["p", "Change the model or instruction in the dashboard without touching your code."]],
  },
  "account/balance": {
    title: "Balance and usage", desc: "Where to see spending and how to control it.",
    blocks: [["ul", ["**Overview** — spend, requests and tokens per day, week or month.", "**Request history** — every request with model, tokens, cost and latency; CSV and JSON export.", "**Billing** — top-ups, subscription, transactions."]], ["h2", "Via API"], ["same", 2], ["tip", "Turn on the low balance alert in Billing."]],
  },
  "account/api-keys": {
    title: "Managing keys", desc: "Create, limit, disable and revoke keys.",
    blocks: [["p", "Create keys in the dashboard or programmatically with a management key — handy when you issue access to your own customers."], ["same", 1], ["p", "All fields are described in the [API reference](/docs/api/keys-create)."]],
  },
  "account/teams": {
    title: "Teams", desc: "Shared balance and budgets for colleagues.",
    blocks: [["steps", [["Invite a member", "In “Team” enter the email, role and monthly budget. The invite appears in their dashboard; you can also send the link."], ["They accept", "Then they can create team keys."], ["Charged to your balance", "Team key requests are paid from the owner's balance until the member's budget runs out."]]], ["p", "Removing a member immediately disables their team keys."]],
  },
  "account/invoices": {
    title: "Paying as a company", desc: "An invoice for your company details.",
    blocks: [["ol", ["In Billing click “Invoice for a company”.", "Enter the name, INN, KPP and amount.", "Download the PDF invoice and pay from the company account with the invoice number in the payment purpose.", "Money reaches the balance once it arrives, usually in 1–2 business days."]], ["note", "Closing documents can be requested via support."]],
  },
  "api/overview": {
    title: "API overview", desc: "Base URL, authentication, request and response format.",
    blocks: [["p", "The API speaks JSON in UTF-8 and is OpenAI-compatible."], ["table", ["", ""], [["Base URL", "`{BASE}`"], ["Auth", "`Authorization: Bearer st-v1-…`"], ["Errors", "`{\"error\": {\"code\", \"message\", \"type\"}}`"], ["Money", "Rubles, in `usage.cost`"]]], ["h2", "Endpoints"],
      ["table", ["Method", "Path", "Description"], [["POST", "[/chat/completions](/docs/api/chat)", "Model answer to messages"], ["POST", "[/images/generations](/docs/api/images)", "Image generation"], ["GET", "[/models](/docs/api/models)", "Models and prices"], ["GET", "[/key](/docs/api/key)", "Key info"], ["GET", "[/credits](/docs/api/credits)", "Account balance"], ["GET", "[/generation](/docs/api/generation)", "Request details"], ["GET · POST · PATCH · DELETE", "[/keys](/docs/api/keys-list)", "Key management"]]]],
  },
  "api/chat": {
    title: "Chat", desc: "The model's answer to a list of messages.",
    blocks: [
      ["same", 0], ["h2", "Request body"],
      ["params", [["model", "string", true, "Model ID (`openai/gpt-5`) or preset (`@preset/name`)"], ["messages", "array", true, "Messages: `role` (`system`, `user`, `assistant`, `tool`) and `content` — a string or parts"], ["stream", "boolean", false, "Stream via SSE"], ["temperature", "number", false, "0 to 2. Lower is more precise, higher more varied"], ["top_p", "number", false, "Alternative to temperature"], ["max_tokens", "integer", false, "Max tokens in the answer"], ["stop", "string | string[]", false, "Stop on these strings"], ["tools", "array", false, "Functions the model may call"], ["response_format", "object", false, "JSON or JSON-schema output"], ["models", "string[]", false, "Fallback models"], ["provider", "object", false, "`order` — provider order, `allow_fallbacks` — allow switching"], ["preset", "string", false, "Preset name if not in `model`"], ["cache", "boolean", false, "`false` — skip the cache"], ["user", "string", false, "Your user ID for your own analytics"]]],
      ["h2", "Example"], ["same", 4], ["h2", "Response fields"],
      ["params", [["id", "string", true, "Generation ID for detail lookups"], ["model", "string", true, "Model that answered (after fallbacks)"], ["provider", "string", true, "Provider that served the request"], ["choices[].finish_reason", "string", true, "`stop` — finished, `length` — hit `max_tokens`"], ["usage.cost", "number", true, "Cost in rubles"], ["usage.paid_by", "string", true, "`balance`, `plan` or `free`"], ["usage.cached", "boolean", true, "Served from cache"]]],
    ],
  },
  "api/images": {
    title: "Images", desc: "Generate images from a description.",
    blocks: [["same", 0], ["params", [["model", "string", true, "Image model, e.g. `black-forest-labs/flux-1.1-pro`"], ["prompt", "string", true, "What to draw"], ["n", "integer", false, "1 to 4 images"], ["size", "string", false, "`1024x1024`, `1024x1536` or `1536x1024`"]]], ["same", 2], ["note", "Priced per image regardless of prompt length."]],
  },
  "api/models": { title: "List models", desc: "All models, capabilities and prices.", blocks: [["same", 0], ["p", "Public, no key required."], ["same", 2], ["p", "`pricing.prompt` and `pricing.completion` are rubles per prompt and completion token."]] },
  "api/key": { title: "Key info", desc: "Usage and limit of the current key.", blocks: [["same", 0], ["same", 1]] },
  "api/credits": { title: "Balance", desc: "Money left on the account.", blocks: [["same", 0], ["same", 1]] },
  "api/generation": { title: "Request details", desc: "Tokens, cost and timing of a request.", blocks: [["same", 0], ["params", [["id", "string", true, "ID from the response, e.g. `gen-3f2a…`"]]], ["same", 2]] },
  "api/keys-list": { title: "List keys", desc: "All active API keys of the account.", blocks: [["same", 0], ["note", "Requires a management key `st-mgmt-…`."], ["same", 2]] },
  "api/keys-create": {
    title: "Create key", desc: "A new API key with limits.",
    blocks: [["same", 0], ["params", [["name", "string", true, "Key name, 1–80 characters"], ["limit_rub", "number", false, "Spend limit in rubles; omit for none"], ["limit_reset", "string", false, "`never`, `daily`, `weekly` or `monthly`"], ["rpm_limit", "integer", false, "Max requests per minute"], ["expires_at", "string", false, "Expiry in ISO 8601"], ["disabled", "boolean", false, "`true` — temporarily disabled"]]], ["same", 2], ["warn", "`secret` is returned only on creation. Save it right away."]],
  },
  "api/keys-update": { title: "Update key", desc: "Change name or limits, or disable.", blocks: [["same", 0], ["params", [["name", "string", true, "Key name"], ["limit_rub", "number", false, "Spend limit in rubles"], ["limit_reset", "string", false, "`never`, `daily`, `weekly` or `monthly`"], ["rpm_limit", "integer", false, "Requests per minute"], ["expires_at", "string", false, "Expiry in ISO 8601"], ["disabled", "boolean", false, "Disable the key"]]], ["same", 2]] },
  "api/keys-delete": { title: "Revoke key", desc: "The key stops working immediately.", blocks: [["same", 0], ["same", 1]] },
  "integrations/overview": { title: "Integrations overview", desc: "Where you can use Strelka.", blocks: [["p", "Any library or tool that works with OpenAI works with Strelka: set our base URL and your key."], ["cards", [["OpenAI Python", "Official SDK", "/docs/integrations/python"], ["OpenAI Node", "JavaScript and TypeScript", "/docs/integrations/node"], ["LangChain", "Chains and agents", "/docs/integrations/langchain"], ["Vercel AI SDK", "Chats in Next.js", "/docs/integrations/vercel"], ["Code editors", "Continue, Cline and others", "/docs/integrations/ide"], ["n8n", "No-code automations", "/docs/integrations/n8n"]]]] },
  "integrations/python": { title: "OpenAI Python", desc: "The official OpenAI SDK for Python.", blocks: [["same", 0], ["tip", "The async `AsyncOpenAI` client is configured the same way."]] },
  "integrations/node": { title: "OpenAI Node", desc: "SDK for JavaScript and TypeScript.", blocks: [["same", 0]] },
  "integrations/langchain": { title: "LangChain", desc: "Chains, agents and RAG.", blocks: [["same", 0]] },
  "integrations/vercel": { title: "Vercel AI SDK", desc: "Streaming chats in Next.js.", blocks: [["same", 0]] },
  "integrations/ide": { title: "Code editors", desc: "Continue, Cline and other IDE assistants.", blocks: [["p", "In the assistant settings choose the “OpenAI compatible” provider and set:"], ["table", ["Field", "Value"], [["Base URL", "`{BASE}`"], ["API key", "your `st-v1-…` key"], ["Model", "e.g. `qwen/qwen3-coder` or `anthropic/claude-sonnet-4.5`"]]], ["tip", "Use fast budget models for autocomplete and reasoning models for chat."]] },
  "integrations/n8n": { title: "n8n", desc: "No-code automations.", blocks: [["steps", [["Create OpenAI credentials", "In n8n open Credentials → OpenAI and paste your `st-v1-…` key."], ["Set the base URL", "Put `{BASE}` into Base URL."], ["Pick a model", "In the OpenAI Chat Model node set a model ID from our catalog."]]]] },
};
