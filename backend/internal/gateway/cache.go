package gateway

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

// cachedAnswer — сохранённый ответ модели для повторения одинаковых запросов.
type cachedAnswer struct {
	Model    string `json:"model"`
	Provider string `json:"provider"`
	Content  string `json:"content"`
	Finish   string `json:"finish"`
	Usage    Usage  `json:"usage"`
}

// cacheKey учитывает всё, что влияет на ответ: модели, сообщения и параметры генерации.
func cacheKey(models []string, req ChatRequest) string {
	raw, _ := json.Marshal(struct {
		Models      []string  `json:"m"`
		Messages    []Message `json:"msg"`
		Temperature *float64  `json:"t"`
		TopP        *float64  `json:"p"`
		MaxTokens   *int      `json:"x"`
		Stop        any       `json:"s"`
		Tools       any       `json:"tl"`
	}{models, req.Messages, req.Temperature, req.TopP, req.MaxTokens, req.Stop, req.Tools})
	h := sha256.Sum256(raw)
	return hex.EncodeToString(h[:])
}

// replay отдаёт ответ из кэша так же, как живой: с потоком, учётом и логом.
func (e *Engine) replay(ctx context.Context, c Caller, req ChatRequest, preset string, hit cachedAnswer, onStart func(string) error, onDelta func(string) error, start time.Time) (Outcome, error) {
	m, err := e.q.GetModel(ctx, hit.Model)
	if err != nil || !m.Enabled {
		return Outcome{}, err
	}
	p, err := e.choosePayment(ctx, c, m)
	if err != nil {
		return Outcome{}, err
	}
	if onStart != nil {
		if err := onStart(m.ID); err != nil {
			return Outcome{}, err
		}
	}
	if onDelta != nil {
		for _, w := range strings.SplitAfter(hit.Content, " ") {
			if err := onDelta(w); err != nil {
				return Outcome{}, err
			}
		}
	}
	res := Result{Content: hit.Content, Usage: hit.Usage, FinishReason: hit.Finish, TTFT: time.Since(start)}
	return e.settle(ctx, c, p, hit.Provider, preset, "chat", req, res, nil, start, onDelta != nil, true), nil
}
