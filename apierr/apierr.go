// Package apierr — единая модель ошибок шлюза и маппинг ошибок провайдеров.
//
// Клиент всегда получает {"error": {message, type, code, param, metadata}}.
// Ключи и токены провайдера вырезаются из message и metadata.raw.
package apierr

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Code — машинный код ошибки в поле error.code.
type Code string

const (
	InvalidRequest        Code = "invalid_request"
	InvalidAPIKey         Code = "invalid_api_key"
	InsufficientBalance   Code = "insufficient_balance"
	Forbidden             Code = "forbidden"
	Moderation            Code = "moderation"
	ModelNotFound         Code = "model_not_found"
	Timeout               Code = "timeout"
	ContextLengthExceeded Code = "context_length_exceeded"
	RateLimit             Code = "rate_limit"
	ProviderError         Code = "provider_error"
	NoAvailableProvider   Code = "no_available_provider"
)

func (c Code) String() string { return string(c) }

// Kind описывает строку таблицы ошибок: HTTP-статус, тип и текст для клиента.
type Kind struct {
	Status  int
	Type    string
	Message string
}

// Table — опубликованная таблица ошибок, см. docs/zadachi/ID24_API-52.md.
var Table = map[Code]Kind{
	InvalidRequest:        {400, "invalid_request_error", "Некорректный запрос"},
	InvalidAPIKey:         {401, "authentication_error", "Неверный или отозванный API-ключ"},
	InsufficientBalance:   {402, "billing_error", "Недостаточно средств на балансе"},
	Forbidden:             {403, "permission_error", "Доступ запрещён"},
	Moderation:            {403, "moderation_error", "Запрос отклонён модерацией"},
	ModelNotFound:         {404, "not_found_error", "Модель не найдена"},
	Timeout:               {408, "timeout_error", "Превышено время ожидания ответа модели"},
	ContextLengthExceeded: {413, "invalid_request_error", "Запрос превышает контекст модели"},
	RateLimit:             {429, "rate_limit_error", "Превышен лимит запросов"},
	ProviderError:         {502, "provider_error", "Провайдер вернул ошибку"},
	NoAvailableProvider:   {503, "service_unavailable_error", "Нет доступного провайдера для модели"},
}

// Limit — чей лимит сработал при 429.
const (
	LimitGateway  = "gateway"
	LimitProvider = "provider"
)

// Metadata — подробности для отладки, без секретов.
type Metadata struct {
	Provider    string `json:"provider,omitempty"`
	Raw         string `json:"raw,omitempty"`
	LimitSource string `json:"limit_source,omitempty"`
}

// Error — ошибка шлюза. Status в тело не попадает, это HTTP-статус ответа.
type Error struct {
	Status   int       `json:"-"`
	Message  string    `json:"message"`
	Type     string    `json:"type"`
	Code     Code      `json:"code"`
	Param    *string   `json:"param"`
	Metadata *Metadata `json:"metadata,omitempty"`
}

func (e *Error) Error() string { return fmt.Sprintf("%d %s: %s", e.Status, e.Code, e.Message) }

// New собирает ошибку по коду из таблицы. Пустой message — текст из таблицы.
func New(code Code, message string) *Error {
	kind, ok := Table[code]
	if !ok {
		kind, code = Table[ProviderError], ProviderError
	}
	if message == "" {
		message = kind.Message
	}
	return &Error{Status: kind.Status, Message: Redact(message), Type: kind.Type, Code: code}
}

// WithParam указывает поле запроса, к которому относится ошибка.
func (e *Error) WithParam(param string) *Error {
	e.Param = &param
	return e
}

// JSON — тело ответа клиенту.
func (e *Error) JSON() []byte {
	body, _ := json.Marshal(struct {
		Error *Error `json:"error"`
	}{e})
	return body
}

// Retryable — можно ли повторить запрос на этом или другом эндпоинте.
// Ошибки клиента и модерация не повторяются.
func (e *Error) Retryable() bool {
	switch e.Code {
	case ProviderError, Timeout, NoAvailableProvider:
		return true
	case RateLimit:
		return e.Metadata != nil && e.Metadata.LimitSource == LimitProvider
	}
	return false
}

// Fallbackable — можно ли перейти на следующую модель из параметра models.
func (e *Error) Fallbackable() bool {
	return e.Retryable() || e.Code == Moderation || e.Code == ContextLengthExceeded
}

// As достаёт *Error из цепочки; чужая ошибка становится provider_error.
func As(err error) *Error {
	if err == nil {
		return nil
	}
	var target *Error
	if errors.As(err, &target) {
		return target
	}
	return New(ProviderError, "")
}

var secrets = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(api[_-]?key|token|secret|password|authorization)(["']?\s*[:=]\s*["']?)(?:bearer\s+|basic\s+)?[^\s"'&,}]+`),
	regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._~+/=-]+`),
	regexp.MustCompile(`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*`),
	regexp.MustCompile(`sk-[A-Za-z0-9_-]{8,}`),
	regexp.MustCompile(`AIza[0-9A-Za-z_-]{20,}`),
	regexp.MustCompile(`AQVN[0-9A-Za-z_-]{20,}`),
	regexp.MustCompile(`\b[A-Za-z0-9+/]{40,}={0,2}`),
}

// Redact вырезает ключи и токены из текста.
func Redact(s string) string {
	for _, re := range secrets {
		s = re.ReplaceAllStringFunc(s, func(m string) string {
			if sub := re.FindStringSubmatch(m); len(sub) == 3 {
				return sub[1] + sub[2] + "***"
			}
			if strings.HasPrefix(strings.ToLower(m), "bearer") {
				return "Bearer ***"
			}
			return "***"
		})
	}
	return s
}
