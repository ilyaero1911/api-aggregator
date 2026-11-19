# API reference

Публичные методы учебного шлюза. Интерактивной песочницы и отдельного сайта документации нет: примеры ниже проверяются тестом на то, что путь есть в коде.

## Аутентификация

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/v1/key"
```

Тот же ключ можно передать заголовком `x-api-key`.

## GET /v1/models

Список без ключа. Ответ кэшируется по `ETag`. Поля: id, name, context_length, pricing.

```bash
curl -D - "$BASE/v1/models"
```

## GET /v1/models/{id}/endpoints

Эндпоинты модели, включая выключенные. Нужен ключ.

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/v1/models/gpt/endpoints"
```

## POST /v1/chat/completions

Без стрима возвращает один JSON. `stream: true` отдаёт SSE и завершает строкой `data: [DONE]`.

Повтор с тем же `Idempotency-Key` не вызывает провайдера второй раз. Параллельный повтор, пока первый ещё идёт, получает 409.

`model` может быть `@preset/имя` или `auto`. Суффиксы `:free`, `:nitro`, `:floor`, `:online`, `:thinking` меняют выбор эндпоинта. Объект `provider` принимает order, only, ignore, allow_fallbacks, sort, max_price, data_collection, require_parameters, quantizations.

```bash
curl -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"gpt","messages":[{"role":"user","content":"привет"}]}' \
  "$BASE/v1/chat/completions"
```

```python
from neurogateway.client import Client
print(Client("http://localhost:8080", "key").chat_payload("gpt", [{"role": "user", "content": "привет"}]))
```

```javascript
import { chatPayload } from "./client.mjs";
console.log(chatPayload("gpt", [{ role: "user", content: "привет" }]));
```

## GET /v1/generation?id=

Модель, провайдер, число попыток и причина выбора. Чужой аккаунт эту запись не видит. ClickHouse здесь нет, запись лежит в памяти процесса.

## POST /v1/keys, GET /v1/keys, DELETE /v1/keys/{id}

Только management-ключ. Секрет возвращается в ответе создания и больше не хранится.

## Ошибки

Тело `{"error":{"message","type","code","param"}}`. 401 invalid_api_key, 402 insufficient_balance, 403 forbidden или moderation, 404 model_not_found, 408 timeout, 429 rate_limit, 502 provider_error, 503 no_available_provider.

## Лимиты

Заголовки `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests`. При 429 есть `retry-after`. Уровень аккаунта виден в GET /v1/key.
