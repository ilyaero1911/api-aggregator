# ID24_API-86 · E06-04: fallback между провайдерами и моделями

Код: [routing/fallback.go](../../routing/fallback.go), тесты: [routing/fallback_test.go](../../routing/fallback_test.go), контракт: параметр `models` в [schema/openapi.yaml](../../schema/openapi.yaml).

## Как работает

1. Сначала эндпоинты той же модели: ретраи, backoff и breaker из ID24_API-85 (до 3 попыток).
2. Если модель так и не ответила, берётся следующая из `model`, затем `models` (не больше 5, повторы убираются).
3. На другую модель переходим при `provider_error`, `timeout`, `rate_limit` провайдера, `no_available_provider` (в том числе когда все эндпоинты модели отключены), `moderation` и `context_length_exceeded`. Модерация и превышение контекста — свойство запроса, поэтому вторую реплику той же модели не вызываем, а сразу идём к следующей модели.
4. Ошибки клиента (`invalid_request`, `insufficient_balance`, `invalid_api_key`) на другую модель не переходят.
5. Неизвестная модель в `model` или `models` — `404 model_not_found` с `param` до вызова провайдера.

`Result.Model` — фактическая модель: она уходит в поле `model` ответа и в биллинг. `Result.Endpoint.Provider` — фактический провайдер.

## Лог

Каждый запрос пишет одну запись `routing` (slog, JSON): `model_requested`, `model_used`, `endpoint`, `attempts`, `chain` (например, `deepseek-chat@ds-main → deepseek-chat@ds-mirror → gigachat-pro@giga`) и `fallback_reasons` с кодом ошибки каждой неудачной попытки. При итоговой ошибке уровень `WARN` и поле `error`.

## Сценарии (e2e на mock-провайдерах)

| Тест | Сценарий |
|---|---|
| `TestFallbackToSecondEndpointOfSameModel` | 500 у основного эндпоинта → зеркало той же модели, цепочка в логе |
| `TestFallbackToNextModelWhenAllEndpointsFail` | 500 и таймаут у обоих эндпоинтов → следующая модель, обе причины в логе |
| `TestFallbackOnModerationAndContextLength` | модерация или превышение контекста → сразу следующая модель |
| `TestClientErrorDoesNotFallback` | 400 invalid_request → ошибка клиенту, один вызов |
| `TestAllModelsFailReturnsLastError` | все модели упали → последняя ошибка, полная цепочка |
| `TestDisabledModelFallsThrough` | все эндпоинты модели отключены вручную → следующая модель |
| `TestRequestValidation` | пустая модель, неизвестная модель, больше 5 в models |
| `TestBillingChargesActualModel` | списание по `billing.Catalog` считается по фактической модели и провайдеру |

```sh
go test ./routing/ -v
```

Ограничение: сценарии проходят в процессе через `Router.Complete` на mock-провайдерах. Тот же прогон через HTTP `/v1/chat/completions` появится вместе с сервером шлюза (ID24_API-47, ID24_API-49).
