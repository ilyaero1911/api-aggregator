package gateway

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// OpenAICompat — провайдер с OpenAI-совместимым API: OpenAI, DeepSeek, OpenRouter, Together, vLLM и т.п.
// Адрес и ключ задаются в админке (раздел «Провайдеры»), ключ хранится зашифрованным.
type OpenAICompat struct {
	Name    string
	BaseURL string
	Key     string
}

var compatClient = &http.Client{Timeout: 5 * time.Minute}

func (o *OpenAICompat) post(ctx context.Context, path string, body any) (*http.Response, error) {
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+o.Key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := compatClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, &UpstreamError{Status: 502, Message: o.Name + ": " + err.Error(), Retryable: true}
	}
	if resp.StatusCode >= 300 {
		defer resp.Body.Close()
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		text := strings.TrimSpace(string(msg))
		if json.Unmarshal(msg, &e) == nil && e.Error.Message != "" {
			text = e.Error.Message
		}
		// 429 и 5xx — проблемы провайдера, пробуем следующего; 4xx — ошибка запроса, отдаём клиенту
		retry := resp.StatusCode == 429 || resp.StatusCode >= 500 || resp.StatusCode == 401 || resp.StatusCode == 403
		return nil, &UpstreamError{Status: resp.StatusCode, Message: fmt.Sprintf("%s: %s", o.Name, text), Retryable: retry}
	}
	return resp, nil
}

func (o *OpenAICompat) body(model string, req ChatRequest, stream bool) map[string]any {
	b := map[string]any{"model": model, "messages": req.Messages}
	if req.Temperature != nil {
		b["temperature"] = *req.Temperature
	}
	if req.TopP != nil {
		b["top_p"] = *req.TopP
	}
	if req.MaxTokens != nil {
		b["max_tokens"] = *req.MaxTokens
	}
	if req.Stop != nil {
		b["stop"] = req.Stop
	}
	if req.Tools != nil {
		b["tools"] = req.Tools
	}
	if len(req.ToolChoice) > 0 {
		b["tool_choice"] = req.ToolChoice
	}
	if len(req.RespFormat) > 0 {
		b["response_format"] = req.RespFormat
	}
	if stream {
		b["stream"] = true
		b["stream_options"] = map[string]bool{"include_usage": true}
	}
	return b
}

type compatUsage struct {
	PromptTokens        int `json:"prompt_tokens"`
	CompletionTokens    int `json:"completion_tokens"`
	PromptTokensDetails *struct {
		CachedTokens int `json:"cached_tokens"`
	} `json:"prompt_tokens_details"`
}

func (u compatUsage) toUsage() Usage {
	r := Usage{PromptTokens: u.PromptTokens, CompletionTokens: u.CompletionTokens}
	if u.PromptTokensDetails != nil {
		r.CachedTokens = u.PromptTokensDetails.CachedTokens
	}
	return r
}

func (o *OpenAICompat) Chat(ctx context.Context, model string, req ChatRequest, onDelta func(string) error) (Result, error) {
	start := time.Now()
	resp, err := o.post(ctx, "/chat/completions", o.body(model, req, onDelta != nil))
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	if onDelta == nil {
		var r struct {
			Choices []struct {
				Message struct {
					Content   string          `json:"content"`
					ToolCalls json.RawMessage `json:"tool_calls"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Usage compatUsage `json:"usage"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
			return Result{}, &UpstreamError{Status: 502, Message: o.Name + ": bad response", Retryable: true}
		}
		if len(r.Choices) == 0 {
			return Result{}, &UpstreamError{Status: 502, Message: o.Name + ": empty response", Retryable: true}
		}
		c := r.Choices[0]
		res := Result{Content: c.Message.Content, FinishReason: c.FinishReason, Usage: r.Usage.toUsage(), TTFT: time.Since(start)}
		if len(c.Message.ToolCalls) > 0 && string(c.Message.ToolCalls) != "null" {
			res.ToolCalls = c.Message.ToolCalls
		}
		if res.Usage.PromptTokens == 0 {
			res.Usage = Usage{PromptTokens: PromptTokens(req.Messages), CompletionTokens: EstimateTokens(res.Content)}
		}
		return res, nil
	}

	// поток SSE: пересылаем куски текста и забираем usage из последнего чанка
	var b strings.Builder
	res := Result{FinishReason: "stop"}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "[DONE]" {
			break
		}
		var ch struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
			Usage *compatUsage `json:"usage"`
		}
		if json.Unmarshal([]byte(payload), &ch) != nil {
			continue
		}
		if ch.Usage != nil {
			res.Usage = ch.Usage.toUsage()
		}
		for _, c := range ch.Choices {
			if c.Delta.Content != "" {
				if b.Len() == 0 {
					res.TTFT = time.Since(start)
				}
				b.WriteString(c.Delta.Content)
				if err := onDelta(c.Delta.Content); err != nil {
					return Result{}, err
				}
			}
			if c.FinishReason != nil && *c.FinishReason != "" {
				res.FinishReason = *c.FinishReason
			}
		}
	}
	if err := sc.Err(); err != nil && !errors.Is(err, context.Canceled) {
		return Result{}, err
	}
	res.Content = b.String()
	if res.Usage.PromptTokens == 0 {
		res.Usage = Usage{PromptTokens: PromptTokens(req.Messages), CompletionTokens: EstimateTokens(res.Content)}
	}
	return res, nil
}

func (o *OpenAICompat) Image(ctx context.Context, model, prompt string, n int, size string) ([]string, error) {
	body := map[string]any{"model": model, "prompt": prompt, "n": n}
	if size != "" {
		body["size"] = size
	}
	resp, err := o.post(ctx, "/images/generations", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var r struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, &UpstreamError{Status: 502, Message: o.Name + ": bad image response", Retryable: true}
	}
	out := make([]string, 0, len(r.Data))
	for _, d := range r.Data {
		if d.URL != "" {
			out = append(out, d.URL)
		} else if d.B64JSON != "" {
			out = append(out, "data:image/png;base64,"+d.B64JSON)
		}
	}
	if len(out) == 0 {
		return nil, &UpstreamError{Status: 502, Message: o.Name + ": no images returned", Retryable: true}
	}
	return out, nil
}
