package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/gateway"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

type keyCtx struct{}

func (s *Server) v1Routes(r chi.Router) {
	r.With(s.publicLimit(60)).Get("/models", s.v1Models)
	r.Group(func(r chi.Router) {
		r.Use(s.requireKey)
		r.Post("/chat/completions", s.v1Chat)
		r.Post("/images/generations", s.v1Image)
		r.Get("/key", s.v1Key)
		r.Get("/credits", s.v1Credits)
		r.Get("/generation", s.v1Generation)
		r.Route("/keys", func(r chi.Router) {
			r.Use(requireManagement)
			r.Get("/", func(w http.ResponseWriter, r *http.Request) { s.listKeysFor(w, r, keyOf(r).UserID, "inference") })
			r.Post("/", func(w http.ResponseWriter, r *http.Request) {
				var in keyInput
				if readJSON(w, r, &in) {
					in.Kind = "inference"
					s.createKeyFor(w, r, keyOf(r).UserID, in)
				}
			})
			r.Patch("/{id}", func(w http.ResponseWriter, r *http.Request) {
				id, ok := pathUUID(w, r, "id")
				var in keyInput
				if ok && readJSON(w, r, &in) {
					s.updateKeyFor(w, r, keyOf(r).UserID, id, in)
				}
			})
			r.Delete("/{id}", func(w http.ResponseWriter, r *http.Request) {
				if id, ok := pathUUID(w, r, "id"); ok {
					s.revokeKeyFor(w, r, keyOf(r).UserID, id)
				}
			})
		})
	})
}

func keyOf(r *http.Request) *db.GetKeyBySecretRow {
	k, _ := r.Context().Value(keyCtx{}).(*db.GetKeyBySecretRow)
	return k
}

func (s *Server) requireKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		token := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		if token == "" || token == h {
			writeErr(w, 401, "missing_api_key", "Provide an API key: Authorization: Bearer st-v1-…")
			return
		}
		k, err := s.q.GetKeyBySecret(r.Context(), auth.HashToken(token))
		if err != nil {
			writeErr(w, 401, "invalid_api_key", "Invalid API key")
			return
		}
		if k.UserStatus != "active" {
			writeErr(w, 403, "account_blocked", "Account is blocked")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), keyCtx{}, &k)))
	})
}

func requireManagement(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if keyOf(r).Kind != "management" {
			writeErr(w, 403, "management_key_required", "This endpoint requires a management key")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) keyCaller(r *http.Request) gateway.Caller {
	k := keyOf(r)
	app := r.Header.Get("X-Title")
	if app == "" {
		app = r.Header.Get("HTTP-Referer")
	}
	c := gateway.Caller{UserID: k.UserID, Key: k, LogPrompts: k.UserLogPrompts, App: truncate(app, 100), Cache: k.UserCache && !strings.EqualFold(r.Header.Get("X-Cache"), "off")}
	if k.BillingUserID != nil {
		c.BillTo = *k.BillingUserID
	}
	return c
}

func (s *Server) v1Chat(w http.ResponseWriter, r *http.Request) {
	var req gateway.ChatRequest
	if !readJSON(w, r, &req) {
		return
	}
	c := s.keyCaller(r)
	if req.Cache != nil && !*req.Cache {
		c.Cache = false
	}
	s.serveChat(w, r, c, req)
}

func (s *Server) gatewayErr(w http.ResponseWriter, err error) {
	var ae *gateway.APIError
	if errors.As(err, &ae) {
		writeErr(w, ae.Status, ae.Code, ae.Message)
		return
	}
	if errors.Is(err, context.Canceled) {
		return
	}
	s.log.Error("gateway", "err", err)
	writeErr(w, 502, "upstream_error", "Upstream error")
}

type usageOut struct {
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	TotalTokens      int     `json:"total_tokens"`
	Cost             float64 `json:"cost"` // в рублях
	Currency         string  `json:"currency"`
	PaidBy           string  `json:"paid_by"`
	Cached           bool    `json:"cached"`
}

func usageOf(o gateway.Outcome) usageOut {
	u := o.Result.Usage
	return usageOut{PromptTokens: u.PromptTokens, CompletionTokens: u.CompletionTokens, TotalTokens: u.PromptTokens + u.CompletionTokens,
		Cost: float64(o.CostMicro) / 1e6, Currency: "RUB", PaidBy: o.PaidBy, Cached: o.Cached}
}

func genID(id uuid.UUID) string { return "gen-" + strings.ReplaceAll(id.String(), "-", "") }

func parseGenID(s string) (uuid.UUID, error) {
	s = strings.TrimPrefix(s, "gen-")
	if len(s) == 32 {
		s = s[:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:]
	}
	return uuid.Parse(s)
}

func (s *Server) serveChat(w http.ResponseWriter, r *http.Request, c gateway.Caller, req gateway.ChatRequest) {
	created := time.Now().Unix()
	if !req.Stream {
		out, err := s.engine.Chat(r.Context(), c, req, nil, nil)
		if err != nil {
			s.gatewayErr(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{
			"id": genID(out.ID), "object": "chat.completion", "created": created, "model": out.Model, "provider": out.ProviderID,
			"choices": []any{map[string]any{"index": 0, "message": assistantMessage(out.Result),
				"finish_reason": out.Result.FinishReason}},
			"usage": usageOf(out),
		})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, 500, "no_stream", "Streaming unsupported")
		return
	}
	// id генерации известен только после записи в лог, поэтому в чанках временный id запроса
	streamID := "gen-" + strings.ReplaceAll(uuid.NewString(), "-", "")
	model := req.Model
	headersSent := false
	send := func(v any) error {
		b, _ := json.Marshal(v)
		if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}
	onStart := func(m string) error {
		model = m
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(200)
		headersSent = true
		return send(map[string]any{"id": streamID, "object": "chat.completion.chunk", "created": created, "model": m,
			"choices": []any{map[string]any{"index": 0, "delta": map[string]string{"role": "assistant", "content": ""}, "finish_reason": nil}}})
	}
	onDelta := func(d string) error {
		return send(map[string]any{"id": streamID, "object": "chat.completion.chunk", "created": created, "model": model,
			"choices": []any{map[string]any{"index": 0, "delta": map[string]string{"content": d}, "finish_reason": nil}}})
	}
	out, err := s.engine.Chat(r.Context(), c, req, onStart, onDelta)
	if err != nil {
		if !headersSent {
			s.gatewayErr(w, err)
			return
		}
		var ae *gateway.APIError
		msg := err.Error()
		if errors.As(err, &ae) {
			msg = ae.Message
		}
		_ = send(map[string]any{"error": map[string]string{"message": msg, "code": "upstream_error"}})
		fmt.Fprint(w, "data: [DONE]\n\n")
		flusher.Flush()
		return
	}
	_ = send(map[string]any{"id": streamID, "generation_id": genID(out.ID), "object": "chat.completion.chunk", "created": created,
		"model": out.Model, "provider": out.ProviderID,
		"choices": []any{map[string]any{"index": 0, "delta": map[string]string{}, "finish_reason": out.Result.FinishReason}},
		"usage":   usageOf(out)})
	fmt.Fprint(w, "data: [DONE]\n\n")
	flusher.Flush()
}

func (s *Server) v1Image(w http.ResponseWriter, r *http.Request) { s.serveImage(w, r, s.keyCaller(r)) }

func (s *Server) serveImage(w http.ResponseWriter, r *http.Request, c gateway.Caller) {
	var in struct {
		Model  string `json:"model"`
		Prompt string `json:"prompt"`
		N      int    `json:"n"`
		Size   string `json:"size"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Prompt) == "" {
		writeErr(w, 400, "prompt_required", "Field 'prompt' is required")
		return
	}
	out, err := s.engine.Image(r.Context(), c, in.Model, in.Prompt, in.N, in.Size)
	if err != nil {
		s.gatewayErr(w, err)
		return
	}
	data := make([]map[string]string, len(out.Images))
	for i, u := range out.Images {
		data[i] = map[string]string{"url": u}
	}
	writeJSON(w, 200, map[string]any{"id": genID(out.ID), "created": time.Now().Unix(), "model": out.Model, "data": data, "usage": usageOf(out)})
}

// v1Models — список моделей в формате OpenRouter, цены в рублях за токен.
func (s *Server) v1Models(w http.ResponseWriter, r *http.Request) {
	ms, err := s.modelDTOs(r, false)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := make([]map[string]any, len(ms))
	perToken := func(perM int64) string { return fmt.Sprintf("%.10f", float64(perM)/1e6/1e6) }
	for i, m := range ms {
		out[i] = map[string]any{
			"id": m.ID, "object": "model", "name": m.Name, "owned_by": m.Author, "created": m.ReleasedAt.Unix(),
			"description": m.Description, "context_length": m.ContextLength,
			"architecture": map[string]any{"modality": m.Modality, "input_modalities": inputModalities(m.Model), "output_modalities": []string{m.Modality}},
			"pricing": map[string]any{"prompt": perToken(m.Prices.InputPerM), "completion": perToken(m.Prices.OutputPerM),
				"input_cache_read": perToken(m.Prices.CacheReadPerM), "image": fmt.Sprintf("%.6f", float64(m.Prices.Image)/1e6), "currency": "RUB"},
			"top_provider":         map[string]any{"context_length": m.ContextLength, "max_completion_tokens": m.MaxOutput},
			"supported_parameters": supportedParams(m.Model),
		}
	}
	writeJSON(w, 200, map[string]any{"object": "list", "data": out})
}

func inputModalities(m db.Model) []string {
	in := []string{"text"}
	for _, c := range m.Capabilities {
		if c == "vision" || c == "image-to-image" {
			in = append(in, "image")
		}
	}
	return in
}

func supportedParams(m db.Model) []string {
	p := []string{"max_tokens", "temperature", "top_p", "stop", "stream"}
	for _, c := range m.Capabilities {
		switch c {
		case "tools":
			p = append(p, "tools", "tool_choice")
		case "reasoning":
			p = append(p, "reasoning")
		}
	}
	return p
}

func (s *Server) v1Key(w http.ResponseWriter, r *http.Request) {
	k := keyOf(r)
	var limit, remaining any
	if k.LimitMicro != nil {
		limit = float64(*k.LimitMicro) / 1e6
		remaining = float64(*k.LimitMicro-k.PeriodSpentMicro) / 1e6
	}
	_, subErr := s.q.GetActiveSubscription(r.Context(), k.UserID)
	writeJSON(w, 200, map[string]any{"data": map[string]any{
		"label": k.Name, "kind": k.Kind, "usage": float64(k.TotalSpentMicro) / 1e6, "period_usage": float64(k.PeriodSpentMicro) / 1e6,
		"limit": limit, "limit_remaining": remaining, "limit_reset": k.LimitReset, "rate_limit_rpm": k.RpmLimit,
		"is_free_tier": subErr != nil, "currency": "RUB", "expires_at": k.ExpiresAt,
	}})
}

func (s *Server) v1Credits(w http.ResponseWriter, r *http.Request) {
	k := keyOf(r)
	wal, err := s.q.GetWallet(r.Context(), k.UserID)
	if err != nil {
		s.internal(w, err)
		return
	}
	tot, _ := s.q.UsageTotals(r.Context(), db.UsageTotalsParams{UserID: k.UserID, Since: time.Unix(0, 0)})
	writeJSON(w, 200, map[string]any{"data": map[string]any{"balance": float64(wal.BalanceMicro) / 1e6, "total_usage": float64(tot.CostMicro) / 1e6, "currency": "RUB"}})
}

func (s *Server) v1Generation(w http.ResponseWriter, r *http.Request) {
	id, err := parseGenID(r.URL.Query().Get("id"))
	if err != nil {
		writeErr(w, 400, "bad_id", "Invalid generation id")
		return
	}
	row, err := s.q.GetRequest(r.Context(), db.GetRequestParams{ID: id, UserID: keyOf(r).UserID})
	if err != nil {
		writeErr(w, 404, "not_found", "Generation not found")
		return
	}
	writeJSON(w, 200, map[string]any{"data": map[string]any{
		"id": genID(row.ID), "model": row.ModelID, "provider": row.ProviderID, "created_at": row.CreatedAt, "status": row.Status,
		"tokens_prompt": row.PromptTokens, "tokens_completion": row.CompletionTokens, "total_cost": float64(row.CostMicro) / 1e6,
		"currency": "RUB", "paid_by": row.PaidBy, "latency": row.LatencyMs, "ttft": row.TtftMs, "streamed": row.Streamed,
		"finish_reason": row.FinishReason, "app": row.App,
	}})
}

// assistantMessage собирает message ответа: текст и, если модель вызвала инструменты, tool_calls.
func assistantMessage(r gateway.Result) map[string]any {
	m := map[string]any{"role": "assistant", "content": r.Content}
	if len(r.ToolCalls) > 0 {
		m["tool_calls"] = r.ToolCalls
		if r.Content == "" {
			m["content"] = nil
		}
	}
	return m
}
