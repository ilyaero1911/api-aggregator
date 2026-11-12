# ID24_API-52 · E04-06: единая модель ошибок

Код: [apierr/apierr.go](../../apierr/apierr.go), маппинг провайдеров: [adapters/errors.go](../../adapters/errors.go), контракт: `ErrorResponse` в [schema/openapi.yaml](../../schema/openapi.yaml).

Любая ошибка шлюза отдаётся клиенту так:

```json
{"error": {"message": "Запрос превышает контекст модели", "type": "invalid_request_error",
  "code": "context_length_exceeded", "param": "messages",
  "metadata": {"provider": "deepseek", "raw": "{…ответ провайдера без ключей…}"}}}
```

## Таблица ошибок

| HTTP | code | type | Когда | Повтор / fallback |
|---|---|---|---|---|
| 400 | `invalid_request` | `invalid_request_error` | Ошибка в теле запроса, в том числе 400/422 провайдера | нет / нет |
| 401 | `invalid_api_key` | `authentication_error` | Ключ клиента неверный или отозван | нет / нет |
| 402 | `insufficient_balance` | `billing_error` | Не хватает средств, провайдер не вызывается | нет / нет |
| 403 | `forbidden` | `permission_error` | Модель или действие запрещены ключу | нет / нет |
| 403 | `moderation` | `moderation_error` | Запрос заблокирован модерацией или safety провайдера | нет / да |
| 404 | `model_not_found` | `not_found_error` | Модели нет в нашем каталоге | нет / нет |
| 408 | `timeout` | `timeout_error` | Таймаут соединения, 408/504 или `DEADLINE_EXCEEDED` провайдера | да / да |
| 413 | `context_length_exceeded` | `invalid_request_error` | Запрос длиннее контекста модели, `param = messages` | нет / да |
| 429 | `rate_limit` | `rate_limit_error` | `metadata.limit_source`: `gateway` — наш лимит, `provider` — лимит провайдера | только `provider` |
| 502 | `provider_error` | `provider_error` | 5xx провайдера, а также его 401/402/403/404 | да / да |
| 503 | `no_available_provider` | `service_unavailable_error` | Все эндпоинты модели недоступны | да / да |

401, 402, 403 и 404 от провайдера означают проблему нашего ключа, баланса или каталога, поэтому клиент получает `provider_error` без подробностей.

## Маппинг по адаптерам

| Провайдер | Формат ошибки | Функция |
|---|---|---|
| Gemini | `{"error":{"code","message","status"}}` | `MapGemini` |
| DeepSeek | `{"error":{"message","type","code"}}` (формат OpenAI) | `MapDeepSeek` |
| YandexGPT | `{"error":{"grpcCode","httpCode","message"}}` | `MapYandex` |
| GigaChat | `{"status","message"}` | `MapGigaChat` |
| Сеть | `context.DeadlineExceeded`, `net.Error` | `MapTransport` |

## Скрытие секретов

`apierr.Redact` вырезает Bearer-токены, JWT, ключи `sk-…`, `AIza…`, `AQVN…`, значения `api_key=`, `token=`, `secret=`, `password=`, `Authorization:` и длинные base64-строки. Это касается и `message`, и `metadata.raw`. `raw` обрезается до 512 байт. Чужая ошибка без типа (`apierr.As`) превращается в `provider_error` с общим текстом.

## Проверка

```sh
go test ./apierr/ ./adapters/ -v
```

Отдельные тесты по каждому адаптеру: `TestMapGemini`, `TestMapDeepSeek`, `TestMapYandex`, `TestMapGigaChat`, `TestMapTransport`. В каждом случае проверяются код, HTTP-статус, провайдер в metadata и отсутствие секрета в теле ответа.
