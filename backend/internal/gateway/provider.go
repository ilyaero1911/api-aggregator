// Package gateway — OpenAI-совместимый шлюз: выбор модели и провайдера, фолбэки, учёт токенов.
package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"strings"
	"time"
	"unicode/utf8"
)

type Message struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
	Name    string          `json:"name,omitempty"`
}

// Text достаёт текст из content: строки или массива частей [{type:text,text:...}].
func (m Message) Text() string {
	var s string
	if json.Unmarshal(m.Content, &s) == nil {
		return s
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(m.Content, &parts) == nil {
		var b strings.Builder
		for _, p := range parts {
			if p.Type == "text" {
				b.WriteString(p.Text)
			}
		}
		return b.String()
	}
	return ""
}

func TextMessage(role, text string) Message {
	raw, _ := json.Marshal(text)
	return Message{Role: role, Content: raw}
}

type ChatRequest struct {
	Model       string    `json:"model"`
	Models      []string  `json:"models,omitempty"` // фолбэк-модели, как в OpenRouter
	Preset      string    `json:"preset,omitempty"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	TopP        *float64  `json:"top_p,omitempty"`
	MaxTokens   *int      `json:"max_tokens,omitempty"`
	Stop        any       `json:"stop,omitempty"`
	Tools       any       `json:"tools,omitempty"`
	ToolChoice  json.RawMessage `json:"tool_choice,omitempty"`
	RespFormat  json.RawMessage `json:"response_format,omitempty"`
	User        string    `json:"user,omitempty"`
	Cache       *bool     `json:"cache,omitempty"`
	Provider    *struct {
		Order          []string `json:"order,omitempty"`
		AllowFallbacks *bool    `json:"allow_fallbacks,omitempty"`
	} `json:"provider,omitempty"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	CachedTokens     int `json:"cached_tokens,omitempty"`
}

type Result struct {
	Content      string
	ToolCalls    json.RawMessage
	Usage        Usage
	FinishReason string
	TTFT         time.Duration
}

// UpstreamError — ошибка провайдера. Retryable = можно идти к следующему провайдеру.
type UpstreamError struct {
	Status    int
	Message   string
	Retryable bool
}

func (e *UpstreamError) Error() string { return fmt.Sprintf("upstream %d: %s", e.Status, e.Message) }

// Upstream — один провайдер. onDelta == nil означает обычный (не потоковый) ответ.
type Upstream interface {
	Chat(ctx context.Context, model string, req ChatRequest, onDelta func(string) error) (Result, error)
	Image(ctx context.Context, model, prompt string, n int, size string) ([]string, error)
}

// Endpoint — конкретная пара модель+провайдер из базы.
type Endpoint struct {
	ProviderID    string
	Kind          string
	UpstreamModel string
	LatencyMS     int
	ErrorRate     int
	BaseURL       string
	APIKey        string
}

func NewUpstream(e Endpoint) (Upstream, error) {
	switch e.Kind {
	case "mock":
		return &Mock{Latency: time.Duration(e.LatencyMS) * time.Millisecond, ErrorRate: e.ErrorRate, Name: e.ProviderID}, nil
	case "openai_compatible":
		if e.BaseURL == "" || e.APIKey == "" {
			return nil, &UpstreamError{Status: 503, Message: e.ProviderID + ": base URL or API key is not set", Retryable: true}
		}
		return &OpenAICompat{Name: e.ProviderID, BaseURL: strings.TrimRight(e.BaseURL, "/"), Key: e.APIKey}, nil
	}
	return nil, errors.New("unknown provider kind " + e.Kind)
}

// EstimateTokens — грубая оценка: ~4 символа на токен для латиницы, ~2.5 для кириллицы.
func EstimateTokens(s string) int {
	if s == "" {
		return 0
	}
	n := utf8.RuneCountInString(s)
	cyr := 0
	for _, r := range s {
		if r >= 0x0400 && r <= 0x04FF {
			cyr++
		}
	}
	t := (n-cyr)/4 + cyr*2/5
	if t < 1 {
		t = 1
	}
	return t
}

func PromptTokens(msgs []Message) int {
	t := 0
	for _, m := range msgs {
		t += EstimateTokens(m.Text()) + 4
	}
	return t + 2
}

// Mock отвечает правдоподобным текстом без обращения к сети.
type Mock struct {
	Latency   time.Duration
	ErrorRate int
	Name      string
}

func (m *Mock) Chat(ctx context.Context, model string, req ChatRequest, onDelta func(string) error) (Result, error) {
	start := time.Now()
	if m.ErrorRate > 0 && rand.IntN(100) < m.ErrorRate {
		return Result{}, &UpstreamError{Status: 503, Message: m.Name + " is overloaded", Retryable: true}
	}
	if err := sleep(ctx, m.Latency); err != nil {
		return Result{}, err
	}
	last := ""
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			last = req.Messages[i].Text()
			break
		}
	}
	answer := mockAnswer(model, last)
	limit := 0
	if req.MaxTokens != nil && *req.MaxTokens > 0 {
		limit = *req.MaxTokens
	}
	words := strings.SplitAfter(answer, " ")
	var b strings.Builder
	finish := "stop"
	res := Result{}
	for i, w := range words {
		if limit > 0 && EstimateTokens(b.String()+w) > limit {
			finish = "length"
			break
		}
		b.WriteString(w)
		if onDelta != nil {
			if i == 0 {
				res.TTFT = time.Since(start)
			}
			if err := onDelta(w); err != nil {
				return Result{}, err
			}
			if err := sleep(ctx, 12*time.Millisecond); err != nil {
				return Result{}, err
			}
		}
	}
	if onDelta == nil {
		res.TTFT = time.Since(start)
	}
	res.Content = b.String()
	res.FinishReason = finish
	res.Usage = Usage{PromptTokens: PromptTokens(req.Messages), CompletionTokens: EstimateTokens(res.Content)}
	return res, nil
}

func (m *Mock) Image(ctx context.Context, model, prompt string, n int, size string) ([]string, error) {
	if err := sleep(ctx, m.Latency*3); err != nil {
		return nil, err
	}
	out := make([]string, n)
	for i := range out {
		out[i] = mockImage(prompt, i)
	}
	return out, nil
}

func sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func isCyrillic(s string) bool {
	for _, r := range s {
		if r >= 0x0400 && r <= 0x04FF {
			return true
		}
	}
	return false
}

func mockAnswer(model, prompt string) string {
	q := strings.TrimSpace(prompt)
	if utf8.RuneCountInString(q) > 120 {
		q = string([]rune(q)[:120]) + "…"
	}
	if isCyrillic(prompt) || prompt == "" {
		return fmt.Sprintf("Это тестовый ответ модели %s. Сейчас шлюз работает на мок-провайдере, поэтому текст не настоящий, "+
			"но формат, потоковая выдача, подсчёт токенов и списание с баланса работают так же, как будут работать с реальными провайдерами. "+
			"Ваш запрос: «%s». Когда подключим провайдеров, здесь появится настоящий ответ.", model, q)
	}
	return fmt.Sprintf("This is a test response from %s. The gateway is running on a mock provider, so the text is not real, "+
		"but the response format, streaming, token accounting and billing behave exactly as they will with live providers. "+
		"Your prompt: \"%s\". Once providers are connected, a real answer will appear here.", model, q)
}

// mockImage рисует детерминированный SVG по тексту запроса.
func mockImage(prompt string, i int) string {
	h := fnv.New64a()
	fmt.Fprintf(h, "%s#%d", prompt, i)
	seed := h.Sum64()
	r := rand.New(rand.NewPCG(seed, seed>>7))
	palette := []string{"#1f3a2e", "#d8c9a7", "#c4552d", "#2d4f6c", "#e9e4d8", "#8a9a5b", "#141414"}
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="%s"/>`, palette[r.IntN(len(palette))])
	for k := 0; k < 9; k++ {
		c := palette[r.IntN(len(palette))]
		switch r.IntN(3) {
		case 0:
			fmt.Fprintf(&b, `<circle cx="%d" cy="%d" r="%d" fill="%s" opacity=".9"/>`, r.IntN(512), r.IntN(512), 20+r.IntN(160), c)
		case 1:
			fmt.Fprintf(&b, `<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>`, r.IntN(448), r.IntN(448), 30+r.IntN(220), 30+r.IntN(220), c)
		default:
			fmt.Fprintf(&b, `<path d="M%d %d L%d %d L%d %d Z" fill="%s"/>`, r.IntN(512), r.IntN(512), r.IntN(512), r.IntN(512), r.IntN(512), r.IntN(512), c)
		}
	}
	b.WriteString(`</svg>`)
	return "data:image/svg+xml;base64," + b64(b.String())
}
