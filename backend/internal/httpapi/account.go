package httpapi

import (
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/billing"
	"github.com/ilyaero1911/api-aggregator/backend/internal/gateway"
	"github.com/ilyaero1911/api-aggregator/backend/internal/money"
	"github.com/ilyaero1911/api-aggregator/backend/internal/payments"
	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

// ---------- публичные ----------

func (s *Server) publicRoutes(r chi.Router) {
	r.Get("/models", s.listModels)
	r.Get("/models/{author}/{slug}", s.getModel)
	r.Get("/plans", s.listPlans)
	r.Get("/fx", s.fxRates)
	r.Get("/rankings", s.rankings)
	r.Get("/config", s.publicConfig)
}

type ModelDTO struct {
	db.Model
	Prices    gateway.Prices `json:"prices"`
	IsFree    bool           `json:"is_free"`
	Providers []string       `json:"providers"`
}

func (s *Server) modelDTOs(r *http.Request, includeDisabled bool) ([]ModelDTO, error) {
	ms, err := s.q.ListModels(r.Context(), includeDisabled)
	if err != nil {
		return nil, err
	}
	eps, _ := s.q.ListAllEndpoints(r.Context())
	byModel := map[string][]string{}
	for _, e := range eps {
		if e.Enabled {
			byModel[e.ModelID] = append(byModel[e.ModelID], e.ProviderID)
		}
	}
	out := make([]ModelDTO, len(ms))
	for i, m := range ms {
		out[i] = ModelDTO{Model: m, Prices: s.engine.Prices(r.Context(), m), IsFree: gateway.IsFree(m), Providers: byModel[m.ID]}
		if out[i].Providers == nil {
			out[i].Providers = []string{}
		}
	}
	return out, nil
}

func (s *Server) listModels(w http.ResponseWriter, r *http.Request) {
	ms, err := s.modelDTOs(r, false)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": ms, "usd_rub_micro": s.fx.USD(r.Context())})
}

func (s *Server) getModel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "author") + "/" + chi.URLParam(r, "slug")
	m, err := s.q.GetModel(r.Context(), id)
	if err != nil || !m.Enabled {
		writeErr(w, 404, "not_found", "Model not found")
		return
	}
	eps, _ := s.q.ListEndpointsForModel(r.Context(), id)
	type ep struct {
		Provider string `json:"provider"`
		Enabled  bool   `json:"enabled"`
		Priority int32  `json:"priority"`
	}
	list := []ep{}
	for _, e := range eps {
		list = append(list, ep{Provider: e.ProviderID, Enabled: e.Enabled && e.ProviderEnabled, Priority: e.Priority})
	}
	writeJSON(w, 200, map[string]any{"model": ModelDTO{Model: m, Prices: s.engine.Prices(r.Context(), m), IsFree: gateway.IsFree(m)}, "endpoints": list})
}

func (s *Server) listPlans(w http.ResponseWriter, r *http.Request) {
	ps, err := s.q.ListPlans(r.Context(), false)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": ps})
}

func (s *Server) fxRates(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"data": s.fx.All(r.Context()), "markup_bps": s.settings.Int(r.Context(), settings.MarkupBps, 2000)})
}

func (s *Server) rankings(w http.ResponseWriter, r *http.Request) {
	from, _ := since(r)
	rows, err := s.q.GlobalModelRanking(r.Context(), from)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (s *Server) publicConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"api_base_url":      s.cfg.APIBaseURL,
		"google_enabled":    s.google != nil,
		"registration_open": s.settings.Bool(r.Context(), settings.RegistrationOpen, true),
		"min_topup_kopecks": s.settings.Int(r.Context(), settings.MinTopupKopecks, 10000),
		"payment_provider":  s.payments.Default().Name(),
	})
}

// ---------- кабинет ----------

func (s *Server) accountRoutes(r chi.Router) {
	r.Patch("/me", s.updateProfile)
	r.Post("/me/password", s.changePassword)

	r.Get("/keys", s.listKeys)
	r.Post("/keys", s.createKey)
	r.Patch("/keys/{id}", s.updateKey)
	r.Delete("/keys/{id}", s.revokeKey)

	r.Get("/billing", s.billingOverview)
	r.Patch("/billing/settings", s.walletSettings)
	r.Get("/billing/transactions", s.transactions)
	r.Post("/billing/topup", s.createTopup)
	r.Post("/billing/subscribe", s.subscribe)
	r.Post("/billing/promo", s.redeemPromo)
	r.Get("/payments/{id}", s.getPayment)
	r.Post("/payments/{id}/fake", s.fakePay)

	r.Get("/stats", s.stats)
	r.Get("/logs", s.logs)
	r.Get("/logs/export", s.exportLogs)
	r.Get("/logs/{id}", s.logEntry)

	r.Get("/presets", s.listPresets)
	r.Post("/presets", s.savePreset)
	r.Put("/presets/{id}", s.savePreset)
	r.Delete("/presets/{id}", s.deletePreset)

	r.Post("/playground/chat", s.playgroundChat)
	r.Post("/playground/image", s.playgroundImage)
}

type KeyDTO struct {
	ID               uuid.UUID  `json:"id"`
	Kind             string     `json:"kind"`
	Name             string     `json:"name"`
	Prefix           string     `json:"prefix"`
	LimitMicro       *int64     `json:"limit_micro"`
	LimitReset       string     `json:"limit_reset"`
	PeriodSpentMicro int64      `json:"period_spent_micro"`
	TotalSpentMicro  int64      `json:"total_spent_micro"`
	RpmLimit         *int32     `json:"rpm_limit"`
	Disabled         bool       `json:"disabled"`
	ExpiresAt        *time.Time `json:"expires_at"`
	LastUsedAt       *time.Time `json:"last_used_at"`
	CreatedAt        time.Time  `json:"created_at"`
	Secret           string     `json:"secret,omitempty"` // только при создании
}

func keyDTO(k db.ApiKey) KeyDTO {
	return KeyDTO{ID: k.ID, Kind: k.Kind, Name: k.Name, Prefix: k.Prefix, LimitMicro: k.LimitMicro, LimitReset: k.LimitReset,
		PeriodSpentMicro: k.PeriodSpentMicro, TotalSpentMicro: k.TotalSpentMicro, RpmLimit: k.RpmLimit, Disabled: k.Disabled,
		ExpiresAt: k.ExpiresAt, LastUsedAt: k.LastUsedAt, CreatedAt: k.CreatedAt}
}

func kindParam(r *http.Request) string {
	if r.URL.Query().Get("kind") == "management" {
		return "management"
	}
	return "inference"
}

func (s *Server) listKeys(w http.ResponseWriter, r *http.Request) {
	s.listKeysFor(w, r, currentUser(r).ID, kindParam(r))
}

func (s *Server) listKeysFor(w http.ResponseWriter, r *http.Request, user uuid.UUID, kind string) {
	ks, err := s.q.ListKeys(r.Context(), db.ListKeysParams{UserID: user, Kind: kind})
	if err != nil {
		s.internal(w, err)
		return
	}
	out := make([]KeyDTO, len(ks))
	for i, k := range ks {
		out[i] = keyDTO(k)
	}
	writeJSON(w, 200, map[string]any{"data": out})
}

type keyInput struct {
	Name       string     `json:"name"`
	Kind       string     `json:"kind"`
	LimitRub   *float64   `json:"limit_rub"`
	LimitReset string     `json:"limit_reset"`
	RpmLimit   *int32     `json:"rpm_limit"`
	Disabled   bool       `json:"disabled"`
	ExpiresAt  *time.Time `json:"expires_at"`
}

func (in *keyInput) validate() (*int64, string, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 80 {
		return nil, "", errors.New("name must be 1-80 characters")
	}
	var limit *int64
	if in.LimitRub != nil {
		if *in.LimitRub < 0 {
			return nil, "", errors.New("limit must be positive")
		}
		v := int64(*in.LimitRub * float64(money.Micro))
		limit = &v
	}
	reset := in.LimitReset
	switch reset {
	case "", "never":
		reset = "never"
	case "daily", "weekly", "monthly":
	default:
		return nil, "", errors.New("limit_reset must be never|daily|weekly|monthly")
	}
	if in.RpmLimit != nil && *in.RpmLimit <= 0 {
		in.RpmLimit = nil
	}
	return limit, reset, nil
}

func (s *Server) createKey(w http.ResponseWriter, r *http.Request) {
	var in keyInput
	if !readJSON(w, r, &in) {
		return
	}
	s.createKeyFor(w, r, currentUser(r).ID, in)
}

func (s *Server) createKeyFor(w http.ResponseWriter, r *http.Request, user uuid.UUID, in keyInput) {
	limit, reset, err := in.validate()
	if err != nil {
		writeErr(w, 400, "bad_input", err.Error())
		return
	}
	kind := "inference"
	if in.Kind == "management" {
		kind = "management"
	}
	secret, prefix, hash := auth.NewAPIKey(kind)
	k, err := s.q.CreateKey(r.Context(), db.CreateKeyParams{UserID: user, Kind: kind, Name: in.Name, Prefix: prefix,
		SecretHash: hash, LimitMicro: limit, LimitReset: reset, RpmLimit: in.RpmLimit, ExpiresAt: in.ExpiresAt})
	if err != nil {
		s.internal(w, err)
		return
	}
	d := keyDTO(k)
	d.Secret = secret
	writeJSON(w, 201, d)
}

func (s *Server) updateKey(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in keyInput
	if !readJSON(w, r, &in) {
		return
	}
	s.updateKeyFor(w, r, currentUser(r).ID, id, in)
}

func (s *Server) updateKeyFor(w http.ResponseWriter, r *http.Request, user, id uuid.UUID, in keyInput) {
	limit, reset, err := in.validate()
	if err != nil {
		writeErr(w, 400, "bad_input", err.Error())
		return
	}
	k, err := s.q.UpdateKey(r.Context(), db.UpdateKeyParams{ID: id, UserID: user, Name: in.Name, LimitMicro: limit,
		LimitReset: reset, RpmLimit: in.RpmLimit, Disabled: in.Disabled, ExpiresAt: in.ExpiresAt})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, keyDTO(k))
}

func (s *Server) revokeKey(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	s.revokeKeyFor(w, r, currentUser(r).ID, id)
}

func (s *Server) revokeKeyFor(w http.ResponseWriter, r *http.Request, user, id uuid.UUID) {
	n, err := s.q.RevokeKey(r.Context(), db.RevokeKeyParams{ID: id, UserID: user})
	if err != nil {
		s.internal(w, err)
		return
	}
	if n == 0 {
		writeErr(w, 404, "not_found", "Key not found")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ---------- биллинг ----------

func (s *Server) billingOverview(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	ctx := r.Context()
	_ = s.q.EnsureWallet(ctx, u.ID)
	wal, err := s.q.GetWallet(ctx, u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	var sub any
	if sv, err := s.q.GetActiveSubscription(ctx, u.ID); err == nil {
		sub = sv
	}
	pays, _ := s.q.ListUserPayments(ctx, u.ID)
	writeJSON(w, 200, map[string]any{
		"wallet": wal, "subscription": sub, "payments": pays,
		"usd_rub_micro": s.fx.USD(ctx), "min_topup_kopecks": s.settings.Int(ctx, settings.MinTopupKopecks, 10000),
	})
}

func (s *Server) walletSettings(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		LowBalanceAlert bool    `json:"low_balance_alert"`
		LowBalanceRub   float64 `json:"low_balance_rub"`
		AutoTopup       bool    `json:"auto_topup"`
		AutoBelowRub    float64 `json:"auto_topup_below_rub"`
		AutoAmountRub   float64 `json:"auto_topup_amount_rub"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.LowBalanceRub < 0 || in.AutoBelowRub < 0 || in.AutoAmountRub < 0 {
		writeErr(w, 400, "bad_input", "Amounts must be positive")
		return
	}
	wal, err := s.q.UpdateWalletSettings(r.Context(), db.UpdateWalletSettingsParams{
		UserID: u.ID, LowBalanceAlert: in.LowBalanceAlert, LowBalanceMicro: int64(in.LowBalanceRub * 1e6),
		AutoTopup: in.AutoTopup, AutoTopupBelowMicro: int64(in.AutoBelowRub * 1e6), AutoTopupAmountMicro: int64(in.AutoAmountRub * 1e6),
	})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, wal)
}

func (s *Server) transactions(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	lim, off := qInt(r, "limit", 25, 100), qInt(r, "offset", 0, 0)
	rows, err := s.q.ListTransactions(r.Context(), db.ListTransactionsParams{UserID: u.ID, Limit: int32(lim), Offset: int32(off)})
	if err != nil {
		s.internal(w, err)
		return
	}
	total, _ := s.q.CountTransactions(r.Context(), u.ID)
	writeJSON(w, 200, map[string]any{"data": rows, "total": total})
}

func (s *Server) startPayment(w http.ResponseWriter, r *http.Request, purpose string, planID *string, kopecks int64, desc string) {
	u := currentUser(r)
	prov := s.payments.Default()
	p, err := s.q.CreatePayment(r.Context(), db.CreatePaymentParams{UserID: u.ID, Provider: prov.Name(), Purpose: purpose, PlanID: planID, AmountKopecks: kopecks})
	if err != nil {
		s.internal(w, err)
		return
	}
	c, err := prov.Create(r.Context(), payments.Invoice{ID: p.ID, AmountKopecks: kopecks, Description: desc, ReturnURL: s.cfg.PublicURL + "/dashboard/billing"})
	if err != nil {
		_ = s.billing.FailPayment(r.Context(), p.ID, "failed")
		writeErr(w, 502, "payment_provider_error", err.Error())
		return
	}
	p, err = s.q.SetPaymentExternal(r.Context(), db.SetPaymentExternalParams{ID: p.ID, ExternalID: c.ExternalID, ConfirmationUrl: c.ConfirmationURL})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 201, p)
}

func (s *Server) createTopup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		AmountRub float64 `json:"amount_rub"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	kop := int64(in.AmountRub*100 + 0.5)
	min := s.settings.Int(r.Context(), settings.MinTopupKopecks, 10000)
	if kop < min || kop > 100_000_000 {
		writeErr(w, 400, "bad_amount", fmt.Sprintf("Amount must be between %d and 1 000 000 ₽", min/100))
		return
	}
	s.startPayment(w, r, "topup", nil, kop, "Пополнение баланса")
}

func (s *Server) subscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PlanID string `json:"plan_id"`
		Method string `json:"method"` // balance | payment
	}
	if !readJSON(w, r, &in) {
		return
	}
	plan, err := s.q.GetPlan(r.Context(), in.PlanID)
	if err != nil || !plan.Active {
		writeErr(w, 404, "plan_not_found", "Plan not found")
		return
	}
	if plan.PriceKopecks == 0 || in.Method == "balance" {
		sub, err := s.billing.BuyPlanFromBalance(r.Context(), currentUser(r).ID, plan.ID)
		if errors.Is(err, billing.ErrInsufficient) {
			writeErr(w, 402, "insufficient_balance", "Not enough balance for this plan")
			return
		}
		if err != nil {
			s.internal(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"subscription": sub})
		return
	}
	s.startPayment(w, r, "plan", &plan.ID, plan.PriceKopecks, "Тариф "+plan.NameRu)
}

func (s *Server) redeemPromo(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if s.loginThrottled(r.Context(), "promo:"+currentUser(r).ID.String()) {
		writeErr(w, 429, "too_many_attempts", "Too many attempts")
		return
	}
	amount, err := s.billing.RedeemPromo(r.Context(), currentUser(r).ID, strings.TrimSpace(in.Code))
	switch {
	case errors.Is(err, billing.ErrPromoInvalid):
		writeErr(w, 400, "promo_invalid", "Promo code is invalid or expired")
	case errors.Is(err, billing.ErrPromoUsed):
		writeErr(w, 409, "promo_used", "You have already used this promo code")
	case err != nil:
		s.internal(w, err)
	default:
		writeJSON(w, 200, map[string]int64{"amount_micro": amount})
	}
}

func (s *Server) getPayment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	p, err := s.q.GetPayment(r.Context(), id)
	if err != nil || p.UserID != currentUser(r).ID {
		writeErr(w, 404, "not_found", "Payment not found")
		return
	}
	writeJSON(w, 200, p)
}

// fakePay — подтверждение на странице фиктивной оплаты. Доступно только для провайдера fake.
func (s *Server) fakePay(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Action string `json:"action"` // pay | cancel | fail
	}
	if !readJSON(w, r, &in) {
		return
	}
	p, err := s.q.GetPayment(r.Context(), id)
	if err != nil || p.UserID != currentUser(r).ID {
		writeErr(w, 404, "not_found", "Payment not found")
		return
	}
	if p.Provider != "fake" {
		writeErr(w, 400, "not_fake", "This payment is not a test payment")
		return
	}
	switch in.Action {
	case "pay":
		p, err = s.billing.CompletePayment(r.Context(), id)
	case "cancel":
		err = s.billing.FailPayment(r.Context(), id, "canceled")
	case "fail":
		err = s.billing.FailPayment(r.Context(), id, "failed")
	default:
		writeErr(w, 400, "bad_action", "action must be pay|cancel|fail")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	p, _ = s.q.GetPayment(r.Context(), id)
	writeJSON(w, 200, p)
}

// ---------- статистика и логи ----------

func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	from, bucket := since(r)
	model := r.URL.Query().Get("model")
	ctx := r.Context()
	tot, err := s.q.UsageTotals(ctx, db.UsageTotalsParams{UserID: u.ID, Since: from, Model: model})
	if err != nil {
		s.internal(w, err)
		return
	}
	series, _ := s.q.UsageDaily(ctx, db.UsageDailyParams{UserID: u.ID, Since: from, Model: model, Bucket: bucket})
	top, _ := s.q.UsageByModel(ctx, db.UsageByModelParams{UserID: u.ID, Since: from})
	models, _ := s.q.UsedModels(ctx, u.ID)
	wal, _ := s.q.GetWallet(ctx, u.ID)
	writeJSON(w, 200, map[string]any{"totals": tot, "series": series, "bucket": bucket, "top_models": top, "models": models, "balance_micro": wal.BalanceMicro})
}

func (s *Server) logParams(r *http.Request, u uuid.UUID) db.ListRequestsParams {
	from, _ := since(r)
	if r.URL.Query().Get("range") == "" {
		from = time.Unix(0, 0)
	}
	return db.ListRequestsParams{UserID: u, Model: r.URL.Query().Get("model"), Status: r.URL.Query().Get("status"),
		Q: strings.TrimSpace(r.URL.Query().Get("q")), Since: from, Lim: int32(qInt(r, "limit", 50, 200)), Off: int32(qInt(r, "offset", 0, 0))}
}

func (s *Server) logs(w http.ResponseWriter, r *http.Request) {
	p := s.logParams(r, currentUser(r).ID)
	rows, err := s.q.ListRequests(r.Context(), p)
	if err != nil {
		s.internal(w, err)
		return
	}
	total, _ := s.q.CountRequests(r.Context(), db.CountRequestsParams{UserID: p.UserID, Model: p.Model, Status: p.Status, Q: p.Q, Since: p.Since})
	writeJSON(w, 200, map[string]any{"data": rows, "total": total})
}

func (s *Server) logEntry(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	row, err := s.q.GetRequest(r.Context(), db.GetRequestParams{ID: id, UserID: currentUser(r).ID})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, row)
}

func (s *Server) exportLogs(w http.ResponseWriter, r *http.Request) {
	p := s.logParams(r, currentUser(r).ID)
	p.Lim, p.Off = 10000, 0
	rows, err := s.q.ListRequests(r.Context(), p)
	if err != nil {
		s.internal(w, err)
		return
	}
	stamp := time.Now().Format("20060102-1504")
	if r.URL.Query().Get("format") == "json" {
		w.Header().Set("Content-Disposition", "attachment; filename=logs-"+stamp+".json")
		writeJSON(w, 200, rows)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=logs-"+stamp+".csv")
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"id", "created_at", "model", "provider", "key", "status", "prompt_tokens", "completion_tokens", "cost_rub", "paid_by", "latency_ms", "finish_reason", "error"})
	for _, x := range rows {
		_ = cw.Write([]string{x.ID.String(), x.CreatedAt.Format(time.RFC3339), x.ModelID, x.ProviderID, x.KeyName,
			strconv.Itoa(int(x.Status)), strconv.Itoa(int(x.PromptTokens)), strconv.Itoa(int(x.CompletionTokens)),
			strconv.FormatFloat(float64(x.CostMicro)/1e6, 'f', 6, 64), x.PaidBy, strconv.Itoa(int(x.LatencyMs)), x.FinishReason, x.Error})
	}
	cw.Flush()
}

// ---------- пресеты ----------

var slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,48}$`)

func (s *Server) listPresets(w http.ResponseWriter, r *http.Request) {
	ps, err := s.q.ListPresets(r.Context(), currentUser(r).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": ps, "limit": 10})
}

func (s *Server) savePreset(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		Slug           string   `json:"slug"`
		Name           string   `json:"name"`
		Description    string   `json:"description"`
		ModelID        string   `json:"model_id"`
		FallbackModels []string `json:"fallback_models"`
		SystemPrompt   string   `json:"system_prompt"`
		Temperature    *float32 `json:"temperature"`
		MaxTokens      *int32   `json:"max_tokens"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Slug = strings.ToLower(strings.TrimSpace(in.Slug))
	if !slugRe.MatchString(in.Slug) {
		writeErr(w, 400, "bad_slug", "Slug: 2-49 chars, a-z, 0-9 and dashes")
		return
	}
	if strings.TrimSpace(in.Name) == "" {
		in.Name = in.Slug
	}
	if _, err := s.q.GetModel(r.Context(), in.ModelID); err != nil {
		writeErr(w, 400, "bad_model", "Unknown model "+in.ModelID)
		return
	}
	if in.FallbackModels == nil {
		in.FallbackModels = []string{}
	}
	if id := chi.URLParam(r, "id"); id != "" {
		pid, err := uuid.Parse(id)
		if err != nil {
			writeErr(w, 400, "bad_id", "Invalid id")
			return
		}
		p, err := s.q.UpdatePreset(r.Context(), db.UpdatePresetParams{ID: pid, UserID: u.ID, Slug: in.Slug, Name: in.Name,
			Description: in.Description, ModelID: in.ModelID, FallbackModels: in.FallbackModels, SystemPrompt: in.SystemPrompt,
			Temperature: in.Temperature, MaxTokens: in.MaxTokens})
		if err != nil {
			s.presetErr(w, err)
			return
		}
		writeJSON(w, 200, p)
		return
	}
	if n, _ := s.q.CountPresets(r.Context(), u.ID); n >= 10 {
		writeErr(w, 400, "preset_limit", "You can have up to 10 presets")
		return
	}
	p, err := s.q.CreatePreset(r.Context(), db.CreatePresetParams{UserID: u.ID, Slug: in.Slug, Name: in.Name,
		Description: in.Description, ModelID: in.ModelID, FallbackModels: in.FallbackModels, SystemPrompt: in.SystemPrompt,
		Temperature: in.Temperature, MaxTokens: in.MaxTokens})
	if err != nil {
		s.presetErr(w, err)
		return
	}
	writeJSON(w, 201, p)
}

func (s *Server) presetErr(w http.ResponseWriter, err error) {
	if strings.Contains(err.Error(), "presets_user_id_slug_key") {
		writeErr(w, 409, "slug_taken", "Preset with this slug already exists")
		return
	}
	s.internal(w, err)
}

func (s *Server) deletePreset(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	n, err := s.q.DeletePreset(r.Context(), db.DeletePresetParams{ID: id, UserID: currentUser(r).ID})
	if err != nil {
		s.internal(w, err)
		return
	}
	if n == 0 {
		writeErr(w, 404, "not_found", "Preset not found")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ---------- плейграунд (сессия вместо ключа) ----------

func (s *Server) playgroundCaller(r *http.Request) gateway.Caller {
	u := currentUser(r)
	return gateway.Caller{UserID: u.ID, LogPrompts: u.LogPrompts, App: "playground"}
}

func (s *Server) playgroundChat(w http.ResponseWriter, r *http.Request) {
	var req gateway.ChatRequest
	if !readJSON(w, r, &req) {
		return
	}
	s.serveChat(w, r, s.playgroundCaller(r), req)
}

func (s *Server) playgroundImage(w http.ResponseWriter, r *http.Request) {
	s.serveImage(w, r, s.playgroundCaller(r))
}


