package gateway

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/billing"
	"github.com/ilyaero1911/api-aggregator/backend/internal/fx"
	"github.com/ilyaero1911/api-aggregator/backend/internal/money"
	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

// APIError — ошибка в формате OpenAI: {"error":{"message","type","code"}}.
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string { return e.Message }

func apiErr(status int, code, msg string) *APIError {
	return &APIError{Status: status, Code: code, Message: msg}
}

// Caller — кто делает запрос: ключ API или сессия в плейграунде (Key == nil).
type Caller struct {
	UserID     uuid.UUID
	Key        *db.GetKeyBySecretRow
	LogPrompts bool
	App        string
	// BillTo — чей баланс платит: владелец команды для командного ключа. Нулевой — сам пользователь.
	BillTo uuid.UUID
	// Cache — можно ли отдать ответ из кэша одинаковых запросов.
	Cache bool
}

func (c Caller) payer() uuid.UUID {
	if c.BillTo != uuid.Nil {
		return c.BillTo
	}
	return c.UserID
}

func (c Caller) team() bool { return c.BillTo != uuid.Nil && c.BillTo != c.UserID }

type Engine struct {
	q        *db.Queries
	billing  *billing.Service
	fx       *fx.Service
	settings *settings.Store
	rdb      *redis.Client
	sealer   *auth.Sealer
	log      *slog.Logger
}

func NewEngine(q *db.Queries, b *billing.Service, f *fx.Service, s *settings.Store, rdb *redis.Client, sealer *auth.Sealer, log *slog.Logger) *Engine {
	return &Engine{q: q, billing: b, fx: f, settings: s, rdb: rdb, sealer: sealer, log: log}
}

// Prices — цены модели в микрорублях за 1 млн токенов по текущему курсу и наценке.
type Prices struct {
	InputPerM     int64 `json:"input_per_m"`
	OutputPerM    int64 `json:"output_per_m"`
	CacheReadPerM int64 `json:"cache_read_per_m"`
	Image         int64 `json:"image"`
}

func (e *Engine) Prices(ctx context.Context, m db.Model) Prices {
	rate, markup := e.fx.USD(ctx), e.settings.Int(ctx, settings.MarkupBps, 2000)
	return Prices{
		InputPerM:     money.USDToRUB(m.InputUsdMicro, rate, markup),
		OutputPerM:    money.USDToRUB(m.OutputUsdMicro, rate, markup),
		CacheReadPerM: money.USDToRUB(m.CacheReadUsdMicro, rate, markup),
		Image:         money.USDToRUB(m.ImageUsdMicro, rate, markup),
	}
}

func IsFree(m db.Model) bool {
	return m.InputUsdMicro == 0 && m.OutputUsdMicro == 0 && m.ImageUsdMicro == 0
}

// cost — стоимость запроса в микрорублях.
func (e *Engine) cost(ctx context.Context, m db.Model, u Usage, images int) int64 {
	usd := money.TokenCost(int64(u.PromptTokens-u.CachedTokens), m.InputUsdMicro) +
		money.TokenCost(int64(u.CachedTokens), m.CacheReadUsdMicro) +
		money.TokenCost(int64(u.CompletionTokens), m.OutputUsdMicro) +
		int64(images)*m.ImageUsdMicro
	return money.USDToRUB(usd, e.fx.USD(ctx), e.settings.Int(ctx, settings.MarkupBps, 2000))
}

// plan — как будет оплачен запрос.
type plan struct {
	model  db.Model
	paidBy string
	sub    *db.GetActiveSubscriptionRow
}

type Outcome struct {
	ID         uuid.UUID
	Model      string
	ProviderID string
	Result     Result
	CostMicro  int64
	PaidBy     string
	Images     []string
	Cached     bool
}

// resolve проверяет ключ, пресет, лимиты и подбирает список моделей для попыток.
func (e *Engine) prepare(ctx context.Context, c Caller, req *ChatRequest) ([]string, string, error) {
	if c.Key != nil {
		k := c.Key
		if k.UserStatus != "active" {
			return nil, "", apiErr(403, "account_blocked", "Account is blocked")
		}
		if k.Disabled {
			return nil, "", apiErr(401, "key_disabled", "API key is disabled")
		}
		if k.Kind != "inference" {
			return nil, "", apiErr(401, "wrong_key_kind", "Management keys cannot be used for inference")
		}
		if k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now()) {
			return nil, "", apiErr(401, "key_expired", "API key has expired")
		}
		if k.RpmLimit != nil {
			slot := fmt.Sprintf("rl:key:%s:%d", k.ID, time.Now().Unix()/60)
			n, err := e.rdb.Incr(ctx, slot).Result()
			if err == nil {
				e.rdb.Expire(ctx, slot, 70*time.Second)
				if n > int64(*k.RpmLimit) {
					return nil, "", apiErr(429, "rate_limited", "Requests per minute limit reached for this key")
				}
			}
		}
	}
	presetSlug := req.Preset
	if strings.HasPrefix(req.Model, "@preset/") {
		presetSlug = strings.TrimPrefix(req.Model, "@preset/")
	}
	var fallbacks []string
	if presetSlug != "" {
		p, err := e.q.GetPresetBySlug(ctx, db.GetPresetBySlugParams{UserID: c.UserID, Slug: presetSlug})
		if err != nil {
			return nil, "", apiErr(404, "preset_not_found", "Preset @preset/"+presetSlug+" not found")
		}
		req.Model = p.ModelID
		fallbacks = p.FallbackModels
		if p.SystemPrompt != "" && (len(req.Messages) == 0 || req.Messages[0].Role != "system") {
			req.Messages = append([]Message{TextMessage("system", p.SystemPrompt)}, req.Messages...)
		}
		if req.Temperature == nil && p.Temperature != nil {
			t := float64(*p.Temperature)
			req.Temperature = &t
		}
		if req.MaxTokens == nil && p.MaxTokens != nil {
			n := int(*p.MaxTokens)
			req.MaxTokens = &n
		}
	}
	models := []string{}
	seen := map[string]bool{}
	for _, m := range append(append([]string{req.Model}, req.Models...), fallbacks...) {
		if m != "" && !seen[m] {
			seen[m] = true
			models = append(models, m)
		}
	}
	if len(models) == 0 {
		return nil, "", apiErr(400, "model_required", "Field 'model' is required")
	}
	return models, presetSlug, nil
}

func (e *Engine) choosePayment(ctx context.Context, c Caller, m db.Model) (plan, error) {
	p := plan{model: m}
	sub, err := e.q.GetActiveSubscription(ctx, c.payer())
	if err == nil {
		p.sub = &sub
	}
	if c.team() {
		mem, err := e.q.GetMembership(ctx, db.GetMembershipParams{OwnerID: c.BillTo, MemberID: c.UserID})
		if err != nil {
			return p, apiErr(403, "team_access_revoked", "You are no longer a member of this team")
		}
		if mem.BudgetMicro != nil {
			if spent, _ := e.q.MemberSpentMonth(ctx, db.MemberSpentMonthParams{UserID: c.UserID, BilledUserID: &c.BillTo}); spent >= *mem.BudgetMicro {
				return p, apiErr(402, "team_budget", "Your monthly team budget is used up")
			}
		}
	}
	if IsFree(m) {
		limit := e.settings.Int(ctx, settings.FreeDailyRequests, 50)
		if p.sub != nil {
			limit = int64(p.sub.DailyFreeRequests)
		}
		key := fmt.Sprintf("free:%s:%s", c.UserID, time.Now().UTC().Format("20060102"))
		n, err := e.rdb.Incr(ctx, key).Result()
		if err == nil {
			e.rdb.Expire(ctx, key, 26*time.Hour)
			if n > limit {
				return p, apiErr(429, "free_limit", fmt.Sprintf("Daily limit of %d free requests reached", limit))
			}
		}
		p.paidBy = "free"
		return p, nil
	}
	if p.sub != nil && m.InPlans && p.sub.TokensUsed < p.sub.TokenQuota {
		p.paidBy = "plan"
		return p, nil
	}
	w, err := e.q.GetWallet(ctx, c.payer())
	if err != nil || w.BalanceMicro <= 0 {
		return p, apiErr(402, "insufficient_balance", "Insufficient balance. Top up in the dashboard to continue.")
	}
	if c.Key != nil && c.Key.LimitMicro != nil {
		spent := c.Key.PeriodSpentMicro
		if periodExpired(c.Key.LimitReset, c.Key.PeriodStartedAt) {
			_ = e.q.ResetKeyPeriod(ctx, c.Key.ID)
			spent = 0
		}
		if spent >= *c.Key.LimitMicro {
			return p, apiErr(402, "key_limit", "Spending limit for this API key is reached")
		}
	}
	p.paidBy = "balance"
	return p, nil
}

func periodExpired(reset string, start time.Time) bool {
	now := time.Now().UTC()
	switch reset {
	case "daily":
		return start.UTC().Format("2006-01-02") != now.Format("2006-01-02")
	case "weekly":
		y1, w1 := start.UTC().ISOWeek()
		y2, w2 := now.ISOWeek()
		return y1 != y2 || w1 != w2
	case "monthly":
		return start.UTC().Format("2006-01") != now.Format("2006-01")
	}
	return false
}

func (e *Engine) concurrency(ctx context.Context, c Caller, p plan) (func(), error) {
	limit := int64(4)
	if p.sub != nil {
		limit = int64(p.sub.Concurrency)
	} else if p.paidBy == "free" {
		limit = 1
	}
	key := "conc:" + c.UserID.String()
	n, err := e.rdb.Incr(ctx, key).Result()
	if err != nil {
		return func() {}, nil // Redis недоступен: не блокируем запросы
	}
	e.rdb.Expire(ctx, key, 10*time.Minute)
	release := func() { e.rdb.Decr(context.WithoutCancel(ctx), key) }
	if n > limit {
		release()
		return nil, apiErr(429, "concurrency_limit", fmt.Sprintf("Too many concurrent requests (limit %d)", limit))
	}
	return release, nil
}

func (e *Engine) endpoints(ctx context.Context, model string, order []string) ([]Endpoint, error) {
	rows, err := e.q.ListEndpointsForModel(ctx, model)
	if err != nil {
		return nil, err
	}
	var out []Endpoint
	for _, r := range rows {
		if !r.Enabled || !r.ProviderEnabled {
			continue
		}
		key, _ := e.sealer.Open(r.ApiKeyEnc)
		out = append(out, Endpoint{ProviderID: r.ProviderID, Kind: r.Kind, UpstreamModel: r.UpstreamModel,
			LatencyMS: int(r.MockLatencyMs), ErrorRate: int(r.MockErrorRate), BaseURL: r.BaseUrl, APIKey: key})
	}
	if len(order) > 0 {
		rank := map[string]int{}
		for i, id := range order {
			rank[id] = i + 1
		}
		sorted := make([]Endpoint, 0, len(out))
		for i := 1; i <= len(order); i++ {
			for _, ep := range out {
				if rank[ep.ProviderID] == i {
					sorted = append(sorted, ep)
				}
			}
		}
		for _, ep := range out {
			if rank[ep.ProviderID] == 0 {
				sorted = append(sorted, ep)
			}
		}
		out = sorted
	}
	return out, nil
}

// Chat выполняет запрос с фолбэками по провайдерам и моделям, списывает деньги и пишет лог.
// onStart вызывается один раз перед первым токеном, когда модель и провайдер уже выбраны.
func (e *Engine) Chat(ctx context.Context, c Caller, req ChatRequest, onStart func(model string) error, onDelta func(string) error) (Outcome, error) {
	start := time.Now()
	models, preset, err := e.prepare(ctx, c, &req)
	if err != nil {
		e.logFailure(ctx, c, req.Model, preset, "chat", req, err, start)
		return Outcome{}, err
	}
	if len(req.Messages) == 0 {
		return Outcome{}, apiErr(400, "messages_required", "Field 'messages' must not be empty")
	}
	// кэш одинаковых запросов: тот же набор моделей, сообщения и параметры
	ck := ""
	if c.Cache {
		ck = "cache:" + cacheKey(models, req)
		if raw, err := e.rdb.Get(ctx, ck).Bytes(); err == nil {
			var hit cachedAnswer
			if json.Unmarshal(raw, &hit) == nil {
				out, err := e.replay(ctx, c, req, preset, hit, onStart, onDelta, start)
				if err == nil {
					return out, nil
				}
				var ae *APIError
				if errors.As(err, &ae) {
					return Outcome{}, err
				}
			}
		}
	}
	var order []string
	allowFallbacks := true
	if req.Provider != nil {
		order = req.Provider.Order
		if req.Provider.AllowFallbacks != nil {
			allowFallbacks = *req.Provider.AllowFallbacks
		}
	}
	var lastErr error = apiErr(404, "model_not_found", "Model not found: "+models[0])
	current := models[0]
	for _, modelID := range models {
		m, err := e.q.GetModel(ctx, modelID)
		if err != nil || !m.Enabled {
			lastErr = apiErr(404, "model_not_found", "Model not found: "+modelID)
			continue
		}
		if m.Modality != "text" {
			lastErr = apiErr(400, "wrong_modality", modelID+" is an image model, use /v1/images/generations")
			continue
		}
		current = modelID
		p, err := e.choosePayment(ctx, c, m)
		if err != nil {
			e.logFailure(ctx, c, modelID, preset, "chat", req, err, start)
			return Outcome{}, err
		}
		release, err := e.concurrency(ctx, c, p)
		if err != nil {
			return Outcome{}, err
		}
		eps, _ := e.endpoints(ctx, modelID, order)
		if !allowFallbacks && len(eps) > 1 {
			eps = eps[:1]
		}
		started := false
		for _, ep := range eps {
			up, err := NewUpstream(ep)
			if err != nil {
				lastErr = err
				continue
			}
			delta := onDelta
			if onDelta != nil {
				delta = func(s string) error {
					if !started {
						started = true
						if onStart != nil {
							if err := onStart(modelID); err != nil {
								return err
							}
						}
					}
					return onDelta(s)
				}
			}
			res, err := up.Chat(ctx, ep.UpstreamModel, req, delta)
			if err != nil {
				lastErr = err
				var ue *UpstreamError
				if started || !errors.As(err, &ue) || !ue.Retryable {
					break
				}
				e.log.Warn("gateway: provider failed, falling back", "model", modelID, "provider", ep.ProviderID, "err", err)
				continue
			}
			if onDelta == nil && onStart != nil {
				_ = onStart(modelID)
			}
			release()
			if ck != "" && res.FinishReason != "" && len(res.ToolCalls) == 0 {
				if raw, err := json.Marshal(cachedAnswer{Model: modelID, Provider: ep.ProviderID, Content: res.Content, Finish: res.FinishReason, Usage: res.Usage}); err == nil {
					ttl := time.Duration(e.settings.Int(ctx, "cache_ttl_sec", 3600)) * time.Second
					e.rdb.Set(context.WithoutCancel(ctx), ck, raw, ttl)
				}
			}
			out := e.settle(ctx, c, p, ep.ProviderID, preset, "chat", req, res, nil, start, onDelta != nil, false)
			return out, nil
		}
		release()
		if started {
			break
		}
	}
	var ue *UpstreamError
	if errors.As(lastErr, &ue) {
		if !ue.Retryable && ue.Status >= 400 && ue.Status < 500 {
			// провайдер отклонил сам запрос (например, неверные параметры): отдаём его ответ как есть
			lastErr = apiErr(ue.Status, "upstream_rejected", ue.Message)
		} else {
			lastErr = apiErr(502, "upstream_error", "All providers failed: "+ue.Message)
		}
	}
	e.logFailure(ctx, c, current, preset, "chat", req, lastErr, start)
	return Outcome{}, lastErr
}

// Image генерирует изображения.
func (e *Engine) Image(ctx context.Context, c Caller, model, prompt string, n int, size string) (Outcome, error) {
	start := time.Now()
	req := ChatRequest{Model: model, Messages: []Message{TextMessage("user", prompt)}}
	if _, _, err := e.prepare(ctx, c, &req); err != nil {
		return Outcome{}, err
	}
	m, err := e.q.GetModel(ctx, model)
	if err != nil || !m.Enabled || m.Modality != "image" {
		return Outcome{}, apiErr(404, "model_not_found", "Image model not found: "+model)
	}
	if n < 1 {
		n = 1
	}
	if n > 4 {
		n = 4
	}
	p, err := e.choosePayment(ctx, c, m)
	if err != nil {
		return Outcome{}, err
	}
	if p.paidBy == "plan" {
		p.paidBy = "balance" // изображения в токенную квоту тарифа не входят
	}
	eps, _ := e.endpoints(ctx, model, nil)
	var lastErr error = apiErr(502, "upstream_error", "No providers available")
	for _, ep := range eps {
		up, err := NewUpstream(ep)
		if err != nil {
			continue
		}
		imgs, err := up.Image(ctx, ep.UpstreamModel, prompt, n, size)
		if err != nil {
			lastErr = err
			continue
		}
		res := Result{Usage: Usage{PromptTokens: EstimateTokens(prompt)}, FinishReason: "stop"}
		return e.settle(ctx, c, p, ep.ProviderID, "", "image", req, res, imgs, start, false, false), nil
	}
	return Outcome{}, lastErr
}

func preview(c Caller, req ChatRequest) string {
	if !c.LogPrompts {
		return ""
	}
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			t := req.Messages[i].Text()
			if utf8.RuneCountInString(t) > 400 {
				t = string([]rune(t)[:400]) + "…"
			}
			return t
		}
	}
	return ""
}

func (e *Engine) settle(ctx context.Context, c Caller, p plan, provider, preset, endpoint string, req ChatRequest, res Result, imgs []string, start time.Time, streamed, cacheHit bool) Outcome {
	ctx = context.WithoutCancel(ctx)
	cost := int64(0)
	if p.paidBy == "balance" {
		cost = e.cost(ctx, p.model, res.Usage, len(imgs))
	}
	planTokens := int64(res.Usage.PromptTokens + res.Usage.CompletionTokens)
	if cacheHit {
		// ответ из кэша: модель не вызывалась, берём только малую часть цены
		keep := 10000 - e.settings.Int(ctx, "cache_discount_bps", 9000)
		cost = cost * keep / 10000
		planTokens = planTokens * keep / 10000
		res.Usage.CachedTokens = res.Usage.PromptTokens
	}
	var billed *uuid.UUID
	if c.team() {
		billed = &c.BillTo
	}
	var keyID *uuid.UUID
	if c.Key != nil {
		keyID = &c.Key.ID
	}
	id, err := e.q.InsertRequest(ctx, db.InsertRequestParams{
		UserID: c.UserID, ApiKeyID: keyID, ModelID: p.model.ID, ProviderID: provider, Preset: preset, Endpoint: endpoint,
		Status: 200, PromptTokens: int32(res.Usage.PromptTokens), CompletionTokens: int32(res.Usage.CompletionTokens),
		CachedTokens: int32(res.Usage.CachedTokens), CostMicro: cost, PaidBy: p.paidBy,
		LatencyMs: int32(time.Since(start).Milliseconds()), TtftMs: int32(res.TTFT.Milliseconds()), Streamed: streamed,
		FinishReason: res.FinishReason, App: c.App, PromptPreview: preview(c, req),
		CacheHit: cacheHit, BilledUserID: billed,
	})
	if err != nil {
		e.log.Error("gateway: log request", "err", err)
	}
	switch p.paidBy {
	case "balance":
		if _, err := e.billing.Charge(ctx, c.payer(), cost, p.model.Name, id.String()); err != nil {
			e.log.Error("gateway: charge", "err", err, "request", id)
		}
		if keyID != nil {
			_ = e.q.AddKeySpend(ctx, db.AddKeySpendParams{ID: *keyID, Amount: cost})
		}
	case "plan":
		_ = e.q.AddSubscriptionTokens(ctx, db.AddSubscriptionTokensParams{ID: p.sub.ID, Tokens: planTokens})
		if keyID != nil {
			_ = e.q.AddKeySpend(ctx, db.AddKeySpendParams{ID: *keyID, Amount: 0})
		}
	default:
		if keyID != nil {
			_ = e.q.AddKeySpend(ctx, db.AddKeySpendParams{ID: *keyID, Amount: 0})
		}
	}
	return Outcome{ID: id, Model: p.model.ID, ProviderID: provider, Result: res, CostMicro: cost, PaidBy: p.paidBy, Images: imgs, Cached: cacheHit}
}

func (e *Engine) logFailure(ctx context.Context, c Caller, model, preset, endpoint string, req ChatRequest, err error, start time.Time) {
	status := 500
	if errors.Is(err, context.Canceled) {
		status = 499 // клиент закрыл соединение
	}
	var ae *APIError
	if errors.As(err, &ae) {
		status = ae.Status
		if status == 401 || status == 403 {
			return // ключ не прошёл проверку: в логи пользователя не пишем
		}
	}
	var keyID *uuid.UUID
	if c.Key != nil {
		keyID = &c.Key.ID
	}
	_, _ = e.q.InsertRequest(context.WithoutCancel(ctx), db.InsertRequestParams{
		UserID: c.UserID, ApiKeyID: keyID, ModelID: model, Preset: preset, Endpoint: endpoint, Status: int32(status),
		PaidBy: "balance", LatencyMs: int32(time.Since(start).Milliseconds()), Error: err.Error(), App: c.App,
		PromptPreview: preview(c, req),
	})
}
