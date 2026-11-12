package adapters

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"strings"

	"github.com/ilyaero1911/api-aggregator/apierr"
)

const rawLimit = 512

// MapGemini переводит ошибку Gemini: {"error":{"code","message","status"}}.
func MapGemini(status int, raw []byte) *apierr.Error {
	var body struct {
		Error struct {
			Message string `json:"message"`
			Status  string `json:"status"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	if body.Error.Status == "DEADLINE_EXCEEDED" {
		status = 504
	}
	return mapStatus("gemini", status, body.Error.Message, raw)
}

// MapDeepSeek переводит ошибку DeepSeek в формате OpenAI: {"error":{"message","type","code"}}.
func MapDeepSeek(status int, raw []byte) *apierr.Error {
	var body struct {
		Error struct {
			Message string `json:"message"`
			Code    any    `json:"code"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	message := body.Error.Message
	if code, ok := body.Error.Code.(string); ok && code == "context_length_exceeded" {
		message = "context_length_exceeded: " + message
	}
	return mapStatus("deepseek", status, message, raw)
}

// MapYandex переводит ошибку YandexGPT: {"error":{"grpcCode","httpCode","message"}}.
func MapYandex(status int, raw []byte) *apierr.Error {
	var body struct {
		Error struct {
			HTTPCode int    `json:"httpCode"`
			Message  string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	if status == 0 {
		status = body.Error.HTTPCode
	}
	return mapStatus("yandexgpt", status, body.Error.Message, raw)
}

// MapGigaChat переводит ошибку GigaChat: {"status","message"}.
func MapGigaChat(status int, raw []byte) *apierr.Error {
	var body struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(raw, &body)
	if status == 0 {
		status = body.Status
	}
	return mapStatus("gigachat", status, body.Message, raw)
}

// MapTransport переводит сетевую ошибку до получения ответа.
func MapTransport(provider string, err error) *apierr.Error {
	var netErr net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()) {
		return withMeta(apierr.New(apierr.Timeout, ""), provider, err.Error())
	}
	return withMeta(apierr.New(apierr.ProviderError, ""), provider, err.Error())
}

func mapStatus(provider string, status int, message string, raw []byte) *apierr.Error {
	text := strings.ToLower(message)
	var e *apierr.Error
	switch {
	case status == 413 || ((status == 400 || status == 422) && contextLimit(text)):
		e = apierr.New(apierr.ContextLengthExceeded, "").WithParam("messages")
	case (status == 400 || status == 403 || status == 422) && moderated(text):
		e = apierr.New(apierr.Moderation, "")
	case status == 400 || status == 422:
		e = apierr.New(apierr.InvalidRequest, message)
	case status == 408 || status == 504:
		e = apierr.New(apierr.Timeout, "")
	case status == 429:
		e = apierr.New(apierr.RateLimit, "Превышен лимит запросов у провайдера")
		e.Metadata = &apierr.Metadata{LimitSource: apierr.LimitProvider}
	default:
		// 401, 402, 403 и 404 провайдера — проблема нашего ключа или каталога,
		// а не клиента: клиенту отдаём provider_error без деталей.
		e = apierr.New(apierr.ProviderError, "")
	}
	return withMeta(e, provider, string(raw))
}

func withMeta(e *apierr.Error, provider, raw string) *apierr.Error {
	if e.Metadata == nil {
		e.Metadata = &apierr.Metadata{}
	}
	e.Metadata.Provider = provider
	raw = apierr.Redact(raw)
	if len(raw) > rawLimit {
		raw = strings.ToValidUTF8(raw[:rawLimit], "")
	}
	e.Metadata.Raw = raw
	return e
}

func contextLimit(text string) bool {
	for _, marker := range []string{"context_length", "context length", "maximum context", "too many tokens", "exceeds the maximum number of tokens", "token limit", "tokens limit"} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func moderated(text string) bool {
	for _, marker := range []string{"moderation", "content policy", "safety", "blocked", "censor"} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}
