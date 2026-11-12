package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ilyaero1911/api-aggregator/backend/internal/billing"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

func (s *Server) adminRoutes(r chi.Router) {
	r.Get("/stats", s.adminStats)

	r.Get("/users", s.adminUsers)
	r.Get("/users/{id}", s.adminUser)
	r.Post("/users/{id}/balance", s.adminAdjust)
	r.Post("/users/{id}/status", s.adminUserStatus)
	r.Post("/users/{id}/role", s.adminUserRole)
	r.Post("/users/{id}/plan", s.adminGrantPlan)

	r.Get("/payments", s.adminPayments)
	r.Post("/payments/{id}/complete", s.adminCompletePayment)
	r.Get("/requests", s.adminRequests)

	r.Get("/models", s.adminModels)
	r.Put("/models", s.adminSaveModel)
	r.Delete("/models/{author}/{slug}", s.adminDeleteModel)
	r.Put("/endpoints", s.adminSaveEndpoint)
	r.Delete("/endpoints", s.adminDeleteEndpoint)

	r.Get("/providers", s.adminProviders)
	r.Put("/providers", s.adminSaveProvider)
	r.Delete("/providers/{id}", s.adminDeleteProvider)

	r.Get("/plans", s.adminPlans)
	r.Put("/plans", s.adminSavePlan)

	r.Get("/settings", s.adminSettings)
	r.Put("/settings", s.adminSaveSettings)
	r.Post("/fx/refresh", s.adminFxRefresh)
	r.Get("/fx/history", s.adminFxHistory)

	r.Get("/promos", s.adminPromos)
	r.Post("/promos", s.adminCreatePromo)
	r.Delete("/promos/{code}", s.adminDeletePromo)

	r.Get("/audit", s.adminAudit)
}

func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) {
	st, err := s.q.AdminStats(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	daily, _ := s.q.AdminDaily(r.Context())
	top, _ := s.q.GlobalModelRanking(r.Context(), time.Now().AddDate(0, 0, -7))
	writeJSON(w, 200, map[string]any{"stats": st, "daily": daily, "top_models": top, "fx": s.fx.All(r.Context())})
}

func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	rows, err := s.q.AdminListUsers(r.Context(), db.AdminListUsersParams{Q: q, Lim: int32(qInt(r, "limit", 50, 200)), Off: int32(qInt(r, "offset", 0, 0))})
	if err != nil {
		s.internal(w, err)
		return
	}
	total, _ := s.q.AdminCountUsers(r.Context(), q)
	type row struct {
		UserDTO
		BalanceMicro int64  `json:"balance_micro"`
		PlanID       string `json:"plan_id"`
	}
	out := make([]row, len(rows))
	for i, x := range rows {
		u := db.User{ID: x.ID, Email: x.Email, Name: x.Name, PasswordHash: x.PasswordHash, GoogleSub: x.GoogleSub, AvatarUrl: x.AvatarUrl,
			Role: x.Role, Status: x.Status, Locale: x.Locale, LogPrompts: x.LogPrompts, CreatedAt: x.CreatedAt, LastLoginAt: x.LastLoginAt}
		out[i] = row{UserDTO: userDTO(u), BalanceMicro: x.BalanceMicro, PlanID: x.PlanID}
	}
	writeJSON(w, 200, map[string]any{"data": out, "total": total})
}

func (s *Server) adminUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	ctx := r.Context()
	u, err := s.q.GetUser(ctx, id)
	if err != nil {
		s.internal(w, err)
		return
	}
	_ = s.q.EnsureWallet(ctx, id)
	wal, _ := s.q.GetWallet(ctx, id)
	txs, _ := s.q.ListTransactions(ctx, db.ListTransactionsParams{UserID: id, Limit: 50})
	subs, _ := s.q.ListSubscriptions(ctx, id)
	keys, _ := s.q.ListKeys(ctx, db.ListKeysParams{UserID: id, Kind: "inference"})
	pays, _ := s.q.ListUserPayments(ctx, id)
	tot, _ := s.q.UsageTotals(ctx, db.UsageTotalsParams{UserID: id, Since: time.Unix(0, 0)})
	kd := make([]KeyDTO, len(keys))
	for i, k := range keys {
		kd[i] = keyDTO(k)
	}
	writeJSON(w, 200, map[string]any{"user": userDTO(u), "wallet": wal, "transactions": txs, "subscriptions": subs,
		"keys": kd, "payments": pays, "usage": tot})
}

func (s *Server) adminAdjust(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		AmountRub float64 `json:"amount_rub"`
		Reason    string  `json:"reason"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.AmountRub == 0 || strings.TrimSpace(in.Reason) == "" {
		writeErr(w, 400, "bad_input", "Amount and reason are required")
		return
	}
	bal, err := s.billing.Adjust(r.Context(), id, int64(in.AmountRub*1e6), in.Reason)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "balance.adjust", id.String(), in)
	writeJSON(w, 200, map[string]int64{"balance_micro": bal})
}

func (s *Server) adminUserStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Status != "active" && in.Status != "blocked" {
		writeErr(w, 400, "bad_status", "status must be active|blocked")
		return
	}
	if id == currentUser(r).ID {
		writeErr(w, 400, "self", "You cannot block yourself")
		return
	}
	if err := s.q.AdminSetUserStatus(r.Context(), db.AdminSetUserStatusParams{ID: id, Status: in.Status}); err != nil {
		s.internal(w, err)
		return
	}
	if in.Status == "blocked" {
		_ = s.q.DeleteUserSessions(r.Context(), id)
	}
	s.audit(r.Context(), currentUser(r).ID, "user.status", id.String(), in)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminUserRole(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Role != "user" && in.Role != "admin" {
		writeErr(w, 400, "bad_role", "role must be user|admin")
		return
	}
	if id == currentUser(r).ID {
		writeErr(w, 400, "self", "You cannot change your own role")
		return
	}
	if err := s.q.AdminSetUserRole(r.Context(), db.AdminSetUserRoleParams{ID: id, Role: in.Role}); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "user.role", id.String(), in)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminGrantPlan(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		PlanID string `json:"plan_id"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.PlanID == "" {
		_ = s.q.CancelActiveSubscription(r.Context(), id)
		s.audit(r.Context(), currentUser(r).ID, "plan.cancel", id.String(), nil)
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	sub, err := s.billing.GrantPlan(r.Context(), id, in.PlanID)
	if errors.Is(err, billing.ErrPlanNotFound) {
		writeErr(w, 404, "plan_not_found", "Plan not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "plan.grant", id.String(), in)
	writeJSON(w, 200, sub)
}

func (s *Server) adminPayments(w http.ResponseWriter, r *http.Request) {
	rows, err := s.q.AdminListPayments(r.Context(), db.AdminListPaymentsParams{Status: r.URL.Query().Get("status"),
		Lim: int32(qInt(r, "limit", 50, 200)), Off: int32(qInt(r, "offset", 0, 0))})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (s *Server) adminCompletePayment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	p, err := s.billing.CompletePayment(r.Context(), id)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "payment.complete", id.String(), nil)
	writeJSON(w, 200, p)
}

func (s *Server) adminRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := s.q.AdminListRequests(r.Context(), db.AdminListRequestsParams{Q: strings.TrimSpace(r.URL.Query().Get("q")),
		Lim: int32(qInt(r, "limit", 50, 200)), Off: int32(qInt(r, "offset", 0, 0))})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (s *Server) adminModels(w http.ResponseWriter, r *http.Request) {
	ms, err := s.modelDTOs(r, true)
	if err != nil {
		s.internal(w, err)
		return
	}
	eps, _ := s.q.ListAllEndpoints(r.Context())
	writeJSON(w, 200, map[string]any{"data": ms, "endpoints": eps})
}

func (s *Server) adminSaveModel(w http.ResponseWriter, r *http.Request) {
	var in db.UpsertModelParams
	if !readJSON(w, r, &in) {
		return
	}
	in.ID = strings.TrimSpace(in.ID)
	if !strings.Contains(in.ID, "/") || in.Name == "" || in.Author == "" {
		writeErr(w, 400, "bad_input", "id must look like author/model; name and author are required")
		return
	}
	if in.Modality == "" {
		in.Modality = "text"
	}
	if in.Capabilities == nil {
		in.Capabilities = []string{}
	}
	if in.Categories == nil {
		in.Categories = []string{}
	}
	if in.ReleasedAt.IsZero() {
		in.ReleasedAt = time.Now()
	}
	m, err := s.q.UpsertModel(r.Context(), in)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "model.save", m.ID, nil)
	writeJSON(w, 200, m)
}

func (s *Server) adminDeleteModel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "author") + "/" + chi.URLParam(r, "slug")
	if err := s.q.DeleteModel(r.Context(), id); err != nil {
		writeErr(w, 409, "in_use", "Model is used by presets; disable it instead")
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "model.delete", id, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminSaveEndpoint(w http.ResponseWriter, r *http.Request) {
	var in db.UpsertEndpointParams
	if !readJSON(w, r, &in) {
		return
	}
	if in.UpstreamModel == "" {
		in.UpstreamModel = in.ModelID
	}
	if err := s.q.UpsertEndpoint(r.Context(), in); err != nil {
		writeErr(w, 400, "bad_input", "Unknown model or provider")
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "endpoint.save", in.ModelID+"@"+in.ProviderID, in)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminDeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	p := db.DeleteEndpointParams{ModelID: r.URL.Query().Get("model_id"), ProviderID: r.URL.Query().Get("provider_id")}
	if err := s.q.DeleteEndpoint(r.Context(), p); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

type providerDTO struct {
	db.Provider
	HasKey bool `json:"has_key"`
}

func (s *Server) adminProviders(w http.ResponseWriter, r *http.Request) {
	ps, err := s.q.ListProviders(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	out := make([]providerDTO, len(ps))
	for i, p := range ps {
		has := p.ApiKeyEnc != ""
		p.ApiKeyEnc = ""
		out[i] = providerDTO{Provider: p, HasKey: has}
	}
	writeJSON(w, 200, map[string]any{"data": out})
}

func (s *Server) adminSaveProvider(w http.ResponseWriter, r *http.Request) {
	var in struct {
		db.UpsertProviderParams
		APIKey string `json:"api_key"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	p := in.UpsertProviderParams
	if p.ID == "" || p.Name == "" {
		writeErr(w, 400, "bad_input", "id and name are required")
		return
	}
	if p.Kind == "" {
		p.Kind = "mock"
	}
	p.ApiKeyEnc = s.sealer.Seal(in.APIKey)
	out, err := s.q.UpsertProvider(r.Context(), p)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "provider.save", p.ID, map[string]any{"kind": p.Kind, "enabled": p.Enabled, "key_changed": in.APIKey != ""})
	has := out.ApiKeyEnc != ""
	out.ApiKeyEnc = ""
	writeJSON(w, 200, providerDTO{Provider: out, HasKey: has})
}

func (s *Server) adminDeleteProvider(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.q.DeleteProvider(r.Context(), id); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "provider.delete", id, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminPlans(w http.ResponseWriter, r *http.Request) {
	ps, err := s.q.ListPlans(r.Context(), true)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": ps})
}

func (s *Server) adminSavePlan(w http.ResponseWriter, r *http.Request) {
	var in db.UpsertPlanParams
	if !readJSON(w, r, &in) {
		return
	}
	if in.ID == "" || in.NameRu == "" || in.PeriodDays <= 0 || in.PriceKopecks < 0 {
		writeErr(w, 400, "bad_input", "id, name_ru, positive period_days and non-negative price are required")
		return
	}
	if in.NameEn == "" {
		in.NameEn = in.NameRu
	}
	if in.FeaturesRu == nil {
		in.FeaturesRu = []string{}
	}
	if in.FeaturesEn == nil {
		in.FeaturesEn = []string{}
	}
	if in.Concurrency <= 0 {
		in.Concurrency = 1
	}
	p, err := s.q.UpsertPlan(r.Context(), in)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "plan.save", p.ID, nil)
	writeJSON(w, 200, p)
}

func (s *Server) adminSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"data": s.settings.All(r.Context())})
}

var editableSettings = map[string]bool{
	"markup_bps": true, "signup_bonus_micro": true, "fx_fallback_usd_rub_micro": true,
	"free_daily_requests": true, "min_topup_kopecks": true, "registration_open": true,
}

func (s *Server) adminSaveSettings(w http.ResponseWriter, r *http.Request) {
	var in map[string]json.RawMessage
	if !readJSON(w, r, &in) {
		return
	}
	for k, v := range in {
		if !editableSettings[k] {
			writeErr(w, 400, "unknown_setting", "Unknown setting "+k)
			return
		}
		var any_ any
		if json.Unmarshal(v, &any_) != nil {
			writeErr(w, 400, "bad_value", "Bad value for "+k)
			return
		}
		if err := s.settings.Set(r.Context(), k, any_); err != nil {
			s.internal(w, err)
			return
		}
	}
	s.audit(r.Context(), currentUser(r).ID, "settings.save", "", in)
	writeJSON(w, 200, map[string]any{"data": s.settings.All(r.Context())})
}

func (s *Server) adminFxRefresh(w http.ResponseWriter, r *http.Request) {
	err := s.fx.Refresh(r.Context())
	resp := map[string]any{"data": s.fx.All(r.Context())}
	if err != nil {
		resp["error"] = err.Error()
	}
	writeJSON(w, 200, resp)
}

func (s *Server) adminFxHistory(w http.ResponseWriter, r *http.Request) {
	cur := r.URL.Query().Get("currency")
	if cur == "" {
		cur = "USD"
	}
	rows, err := s.q.ListFxRates(r.Context(), db.ListFxRatesParams{Currency: cur, Limit: 60})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (s *Server) adminPromos(w http.ResponseWriter, r *http.Request) {
	ps, err := s.q.ListPromos(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": ps})
}

func (s *Server) adminCreatePromo(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code      string     `json:"code"`
		AmountRub float64    `json:"amount_rub"`
		MaxUses   int32      `json:"max_uses"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	if in.Code == "" || in.AmountRub <= 0 {
		writeErr(w, 400, "bad_input", "code and positive amount are required")
		return
	}
	if in.MaxUses <= 0 {
		in.MaxUses = 1
	}
	p, err := s.q.CreatePromo(r.Context(), db.CreatePromoParams{Code: in.Code, AmountMicro: int64(in.AmountRub * 1e6), MaxUses: in.MaxUses, ExpiresAt: in.ExpiresAt})
	if err != nil {
		writeErr(w, 409, "exists", "Promo code already exists")
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "promo.create", p.Code, in)
	writeJSON(w, 201, p)
}

func (s *Server) adminDeletePromo(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if err := s.q.DeletePromo(r.Context(), code); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "promo.delete", code, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminAudit(w http.ResponseWriter, r *http.Request) {
	rows, err := s.q.ListAudit(r.Context(), int32(qInt(r, "limit", 100, 500)))
	if err != nil {
		s.internal(w, err)
		return
	}
	type row struct {
		db.ListAuditRow
		Details json.RawMessage `json:"details"`
	}
	out := make([]row, len(rows))
	for i, r := range rows {
		out[i] = row{ListAuditRow: r, Details: json.RawMessage(r.Details)}
		if len(r.Details) == 0 {
			out[i].Details = json.RawMessage("null")
		}
	}
	writeJSON(w, 200, map[string]any{"data": out})
}
