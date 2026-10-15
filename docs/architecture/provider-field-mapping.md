# План преобразования канонической схемы

15.10.2026 · ID24_API-24. Матрица — правила для будущих адаптеров; production адаптеров пока нет. Поддержка зависит от конкретной модели/endpoint, а не только бренда. Пустые capabilities запрещают платный вызов, все внешние провайдеры выключены юридическим gate.

Обозначения: direct — имя/структура близки, всё равно валидируются; translate — явное преобразование; reject — 422, пока не появится проверенный capability. Для новых полей default reject.

| Каноническое поле | Chat Completions API | Anthropic Messages | Gemini generateContent | Yandex native completion | GigaChat |
|---|---|---|---|---|---|
| model | direct | direct | URL model | modelUri | direct |
| system | messages | top-level system | systemInstruction | messages system.text | messages system |
| developer | capability модели | reject отдельной роли | reject отдельной роли | reject | reject |
| user / assistant | direct | messages user/assistant | contents user/model | messages role/text | messages |
| tool result | role tool + tool_call_id | user tool_result block | functionResponse part | reject до проверки | отдельное functions capability |
| text | text part | text block | parts.text | text | content |
| image | image_url/data URI | image source URL/base64 | inlineData/fileData | reject в text endpoint | attachments только отдельный upload capability |
| PDF file | file_id/data capability | document block capability | fileData/inlineData MIME | reject | reject до upload mapping |
| input_audio | audio capability | reject | inlineData MIME capability | reject | reject |
| temperature | direct, model range | direct, model range | generationConfig.temperature | completionOptions.temperature 0..1 | direct, >0 для документированного gRPC |
| top_p | direct capability | direct capability | generationConfig.topP | reject без подтверждения | direct |
| top_k | reject без capability | capability | generationConfig.topK | reject | reject |
| max_tokens | max_completion_tokens для новых моделей | max_tokens | maxOutputTokens | maxTokens string | max_tokens |
| stop | stop capability | stop_sequences | stopSequences | reject | reject |
| seed | capability | reject | generationConfig.seed capability | reject | reject |
| frequency / presence penalty | direct capability | reject | generationConfig capability | reject | не равно repetition_penalty, reject |
| logprobs / top_logprobs | capability | reject | responseLogprobs/logprobs capability | reject | reject |
| logit_bias | capability | reject | reject | reject | reject |
| response_format | JSON/schema capability | structured output capability отдельно | responseMimeType/responseSchema | jsonSchema/jsonObject capability | reject до проверки |
| tools / tool_choice | tools/function + choice | tools/input_schema + tool_choice | functionDeclarations + toolConfig | reject на text baseline | functions/function_call capability |
| parallel_tool_calls | capability | disable_parallel_tool_use инверсия при поддержке | reject без теста | reject | reject |
| reasoning | model-specific effort/budget | thinking capability | thinkingConfig capability | reasoningOptions capability | reject |
| prediction | только capability | reject | reject | reject | reject |
| user | safety identifier mapping требует политики | metadata только по отдельному правилу | не пересылать PII автоматически | reject | reject |
| stream | SSE chunks | SSE message/content events | streamGenerateContent SSE | stream completionOptions | stream |

Usage mapping: Chat API prompt_tokens/completion_tokens и *_details; Anthropic input_tokens/output_tokens и cache_read/cache_creation; Gemini usageMetadata promptTokenCount/candidatesTokenCount/cachedContentTokenCount/thoughtsTokenCount; Yandex usage inputTextTokens/completionTokens; GigaChat usage prompt_tokens/completion_tokens. Отсутствующее поле — unknown, не выдуманный ноль. Для каждого адаптера необходим golden fixture с documented inclusive/exclusive semantics.

Finish: Chat API stop→stop, length→length, tool_calls→tool_calls, content_filter→content_filter; Anthropic end_turn/stop_sequence→stop, max_tokens→length, tool_use→tool_calls, refusal→content_filter, pause_turn требует continuation (не молча stop); Gemini STOP→stop, MAX_TOKENS→length, SAFETY→content_filter, MALFORMED_FUNCTION_CALL→error; неизвестное→error + diagnostic. Yandex/Giga enum фиксируется по конкретному endpoint fixture до включения.

Источники (проверены 15.10.2026): [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Claude stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons), [Gemini reference](https://ai.google.dev/api/generate-content), [Yandex basic request](https://aistudio.yandex.ru/ru/docs/ai-studio/operations/generation/completions-basic), [Yandex structured output](https://aistudio.yandex.ru/en/docs//ai-studio/concepts/generation/structured-output), [GigaChat proto reference](https://www.developers.sber.ru/docs/ru/gigachat/api/reference-grpc). Диапазоны и новые возможности должны перепроверяться по версии модели. Здесь не предполагается идентичность разных API.
