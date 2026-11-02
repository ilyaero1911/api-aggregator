# Канонический LLM-контракт и HTTP API

ID24_API-24/25. Источник схем — `tools/generate-contracts.py`; изменения в генераторе, затем `make gen`. Сгенерированные файлы коммитятся. Public OpenAPI 3.1 `schema/openapi.yaml` и internal `schema/internal.openapi.yaml` разделены: internal session/cookie/CSRF не публикуются как SDK inference API.

## Поверхность

Base URL `/v1`. Public: POST chat/completions, responses, messages, embeddings, rerank, images/generations, audio/speech, audio/transcriptions; GET models, models/{id}/endpoints, generation, key, credits. Это контракт целевого продукта, **не заявление о реализации 13 методов**. Каркас gateway возвращает 501; mock поддерживает только ограниченные chat/completions и responses для разработки. Responses input/output items не подменяются chat choices.

совместимый SDK: заменить baseURL на `http://127.0.0.1:8089/v1` и использовать синтетический apiKey. SDK-тест делает настоящий HTTP round trip chat, SSE и responses к mock. Реальные ключи не нужны. Собственный TS SDK генерируется openapi-typescript + openapi-fetch; Go модели — oapi-codegen. Область совместимости — явно перечисленные схемой поля, а не полный API всех поставщиков.

## Канонические данные

Роли system/developer/user/assistant/tool. Content parts: text, image_url (URL/data), file (file_id или file_data, PDF MIME), input_audio. Параметры temperature/top_p/top_k/max_tokens/stop/seed/frequency_penalty/presence_penalty/logprobs/top_logprobs/logit_bias/response_format/tools/tool_choice/parallel_tool_calls/reasoning/prediction/user. Пропущенное optional отличается от нуля: Go pointer поля проходят round trip с temperature=0.

Usage: prompt_tokens/completion_tokens/total_tokens, cached input, cache write, reasoning, audio input/output, image tokens. Неизвестное usage не превращается в ноль для списания — generation отправляется на reconcile; нельзя считать cache/reasoning токены второй раз, если они входят в totals. Finish enum: stop/length/tool_calls/content_filter/error. Provider raw status хранится в диагностике без prompt.

[Таблица отображения полей и строгие ограничения](provider-field-mapping.md). Поле, не поддержанное выбранным model endpoint, вызывает 422 unsupported_parameter с param, request_id. Молчаливое удаление, слияние developer в system или имитация tools не разрешены. Расширения models/provider/transforms/preset имеют собственные типы в OAS; policy routing не обещает недопущенные модели.

## Ошибки, заголовки, версии

Ошибка `{error:{message,type,param,code}}`, HTTP: 400 malformed, 401 key, 402 balance, 403 policy, 404 model, 409 idempotency conflict, 413 size, 415 media, 422 capability, 429 rate, 5xx server/provider. X-Request-Id на ответе и в логах, rate limit заголовки по ключу, Retry-After на временном ограничении. В SSE ошибка после начала потока передаётся событием и завершением; HTTP статус уже менять нельзя.

Idempotency-Key scoped tenant+key+operation, hash нормализованного тела; одинаковый ключ/иной hash — 409, TTL не менее 24 часов. Денежный capture имеет отдельный уникальный generation ID без TTL. Повтор после ambiguous provider timeout требует reconcile, не нового внешнего платного запроса.

`/v1` — совместимая версия, additive optional изменения в minor. Breaking schema/semantics → `/v2`, период параллельной работы минимум 90 дней и объявленные Deprecation/Sunset + migration guide. Не удалять метод из работающего клиента по одному PR. Spectral должен выдавать ноль warning; Ajv 2020 проверяет положительные и отрицательные случаи; Go serialization и official SDK HTTP tests включены в make test. Полный API conformance — будущий gate до Beta.
