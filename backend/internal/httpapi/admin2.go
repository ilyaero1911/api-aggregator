package httpapi

import (
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/money"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

// Расширенная админка: подробные пользователи, подписки, ключи, транзакции, возвраты, аналитика.

func (s *Server) adminStats2(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	days := int32(qInt(r, "days", 30, 365))
	if days < 7 {
		days = 7
	}
	st, err := s.q.AdminStats(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	since := time.Now().AddDate(0, 0, -int(days))
	daily, _ := s.q.AdminDailyFull(ctx, days)
	top, _ := s.q.GlobalModelRanking(ctx, since)
	users, _ := s.q.AdminTopUsers(ctx, since)
	plans, _ := s.q.AdminPlanStats(ctx)
	totals, _ := s.q.AdminTotals(ctx)
	pays, _ := s.q.AdminPaymentTotals(ctx, since)
	writeJSON(w, 200, map[string]any{"stats": st, "totals": totals, "daily": daily, "top_models": top, "top_users": users,
		"plans": plans, "payment_totals": pays, "fx": s.fx.All(ctx), "days": days})
}

type adminUserRow struct {
	db.AdminUsersFullRow
	LastRequestAt *time.Time `json:"last_request_at"`
}

func (s *Server) adminUsers2(w http.ResponseWriter, r *http.Request) {
	qp := r.URL.Query()
	p := db.AdminUsersFullParams{Q: strings.TrimSpace(qp.Get("q")), Role: qp.Get("role"), Status: qp.Get("status"), Plan: qp.Get("plan"),
		Sort: qp.Get("sort"), Lim: int32(qInt(r, "limit", 50, 200)), Off: int32(qInt(r, "offset", 0, 0))}
	rows, err := s.q.AdminUsersFull(r.Context(), p)
	if err != nil {
		s.internal(w, err)
		return
	}
	total, _ := s.q.AdminUsersCount(r.Context(), db.AdminUsersCountParams{Q: p.Q, Role: p.Role, Status: p.Status, Plan: p.Plan})
	out := make([]adminUserRow, len(rows))
	for i, x := range rows {
		out[i] = adminUserRow{AdminUsersFullRow: x}
		if x.LastRequestAt.Year() > 1970 {
			t := x.LastRequestAt
			out[i].LastRequestAt = &t
		}
	}
	writeJSON(w, 200, map[string]any{"data": out, "total": total})
}

func (s *Server) adminCreateUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email     string  `json:"email"`
		Name      string  `json:"name"`
		Password  string  `json:"password"`
		Role      string  `json:"role"`
		BalanceRb float64 `json:"balance_rub"`
		PlanID    string  `json:"plan_id"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if _, err := mail.ParseAddress(in.Email); err != nil {
		writeErr(w, 400, "bad_email", "Invalid email")
		return
	}
	if len(in.Password) < 8 {
		writeErr(w, 400, "weak_password", "Password must be at least 8 characters")
		return
	}
	if _, err := s.q.GetUserByEmail(r.Context(), in.Email); err == nil {
		writeErr(w, 409, "email_taken", "This email is already registered")
		return
	}
	hash, _ := auth.HashPassword(in.Password)
	role := "user"
	if in.Role == "admin" {
		role = "admin"
	}
	u, err := s.createUser(r.Context(), db.CreateUserParams{Email: in.Email, Name: in.Name, PasswordHash: &hash, Role: role})
	if err != nil {
		s.internal(w, err)
		return
	}
	if in.BalanceRb != 0 {
		_, _ = s.billing.Adjust(r.Context(), u.ID, int64(in.BalanceRb*1e6), "Начислено администратором при создании")
	}
	if in.PlanID != "" {
		_, _ = s.billing.GrantPlan(r.Context(), u.ID, in.PlanID)
	}
	s.audit(r.Context(), currentUser(r).ID, "user.create", u.ID.String(), map[string]any{"email": u.Email, "role": role})
	writeJSON(w, 201, userDTO(u))
}

func (s *Server) adminUser2(w http.ResponseWriter, r *http.Request) {
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
	txs, _ := s.q.ListTransactions(ctx, db.ListTransactionsParams{UserID: id, Limit: 100})
	subs, _ := s.q.ListSubscriptions(ctx, id)
	keys, _ := s.q.AdminListKeys(ctx, db.AdminListKeysParams{UserID: id.String(), Revoked: true, Lim: 100})
	pays, _ := s.q.ListUserPayments(ctx, id)
	all, _ := s.q.UsageTotals(ctx, db.UsageTotalsParams{UserID: id, Since: time.Unix(0, 0)})
	month, _ := s.q.UsageTotals(ctx, db.UsageTotalsParams{UserID: id, Since: time.Now().AddDate(0, 0, -30)})
	series, _ := s.q.UsageDaily(ctx, db.UsageDailyParams{UserID: id, Since: time.Now().AddDate(0, 0, -30), Bucket: "day"})
	models, _ := s.q.UsageByModel(ctx, db.UsageByModelParams{UserID: id, Since: time.Now().AddDate(0, 0, -30)})
	reqs, _ := s.q.ListRequests(ctx, db.ListRequestsParams{UserID: id, Since: time.Unix(0, 0), Lim: 50})
	sessions, _ := s.q.AdminUserSessions(ctx, id)
	presets, _ := s.q.ListPresets(ctx, id)
	writeJSON(w, 200, map[string]any{
		"user": userDTO(u), "admin_note": u.AdminNote, "wallet": wal, "transactions": txs, "subscriptions": subs, "keys": adminKeyDTOs(keys),
		"payments": pays, "usage": all, "usage_30d": month, "series": series, "models": models, "requests": reqs,
		"sessions": sessions, "presets": presets,
	})
}

func (s *Server) adminPatchUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	u, err := s.q.GetUser(r.Context(), id)
	if err != nil {
		s.internal(w, err)
		return
	}
	var in struct {
		Name      *string `json:"name"`
		Email     *string `json:"email"`
		Role      *string `json:"role"`
		Status    *string `json:"status"`
		Locale    *string `json:"locale"`
		AdminNote *string `json:"admin_note"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	p := db.AdminUpdateUserParams{ID: id, Name: u.Name, Email: u.Email, Role: u.Role, Status: u.Status, Locale: u.Locale, AdminNote: u.AdminNote}
	if in.Name != nil {
		p.Name = truncate(strings.TrimSpace(*in.Name), 100)
	}
	if in.Email != nil {
		e := strings.ToLower(strings.TrimSpace(*in.Email))
		if _, err := mail.ParseAddress(e); err != nil {
			writeErr(w, 400, "bad_email", "Invalid email")
			return
		}
		if other, err := s.q.GetUserByEmail(r.Context(), e); err == nil && other.ID != id {
			writeErr(w, 409, "email_taken", "This email belongs to another user")
			return
		}
		p.Email = e
	}
	self := id == currentUser(r).ID
	if in.Role != nil && (*in.Role == "user" || *in.Role == "admin") {
		if self && *in.Role != "admin" {
			writeErr(w, 400, "self", "You cannot remove your own admin role")
			return
		}
		p.Role = *in.Role
	}
	if in.Status != nil && (*in.Status == "active" || *in.Status == "blocked") {
		if self && *in.Status == "blocked" {
			writeErr(w, 400, "self", "You cannot block yourself")
			return
		}
		p.Status = *in.Status
	}
	if in.Locale != nil && (*in.Locale == "ru" || *in.Locale == "en") {
		p.Locale = *in.Locale
	}
	if in.AdminNote != nil {
		p.AdminNote = truncate(*in.AdminNote, 4000)
	}
	nu, err := s.q.AdminUpdateUser(r.Context(), p)
	if err != nil {
		s.internal(w, err)
		return
	}
	if nu.Status == "blocked" {
		_ = s.q.DeleteUserSessions(r.Context(), id)
	}
	s.audit(r.Context(), currentUser(r).ID, "user.update", id.String(), in)
	writeJSON(w, 200, userDTO(nu))
}

func (s *Server) adminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	if id == currentUser(r).ID {
		writeErr(w, 400, "self", "You cannot delete yourself")
		return
	}
	u, err := s.q.GetUser(r.Context(), id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if _, err := s.pool.Exec(r.Context(), "DELETE FROM users WHERE id = $1", id); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "user.delete", id.String(), map[string]string{"email": u.Email})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminUserPassword(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if len(in.Password) < 8 {
		writeErr(w, 400, "weak_password", "Password must be at least 8 characters")
		return
	}
	hash, _ := auth.HashPassword(in.Password)
	if err := s.q.SetPassword(r.Context(), db.SetPasswordParams{ID: id, PasswordHash: &hash}); err != nil {
		s.internal(w, err)
		return
	}
	_ = s.q.DeleteUserSessions(r.Context(), id)
	s.audit(r.Context(), currentUser(r).ID, "user.password", id.String(), nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminUserLogout(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	_ = s.q.DeleteUserSessions(r.Context(), id)
	s.audit(r.Context(), currentUser(r).ID, "user.logout", id.String(), nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminSubscriptions(w http.ResponseWriter, r *http.Request) {
	qp := r.URL.Query()
	rows, err := s.q.AdminListSubscriptions(r.Context(), db.AdminListSubscriptionsParams{Status: qp.Get("status"), Plan: qp.Get("plan"),
		Q: strings.TrimSpace(qp.Get("q")), Lim: int32(qInt(r, "limit", 100, 500)), Off: int32(qInt(r, "offset", 0, 0))})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (s *Server) adminPatchSubscription(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	sub, err := s.q.AdminGetSubscription(r.Context(), id)
	if err != nil {
		s.internal(w, err)
		return
	}
	var in struct {
		PlanID     *string    `json:"plan_id"`
		Status     *string    `json:"status"`
		EndsAt     *time.Time `json:"ends_at"`
		TokensUsed *int64     `json:"tokens_used"`
		ExtendDays *int       `json:"extend_days"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	p := db.AdminUpdateSubscriptionParams{ID: id, PlanID: sub.PlanID, Status: sub.Status, EndsAt: sub.EndsAt, TokensUsed: sub.TokensUsed}
	if in.PlanID != nil {
		if _, err := s.q.GetPlan(r.Context(), *in.PlanID); err != nil {
			writeErr(w, 404, "plan_not_found", "Plan not found")
			return
		}
		p.PlanID = *in.PlanID
	}
	if in.Status != nil {
		switch *in.Status {
		case "active":
			// активной у пользователя может быть только одна подписка
			if sub.Status != "active" {
				_ = s.q.CancelActiveSubscription(r.Context(), sub.UserID)
			}
			p.Status = "active"
		case "canceled", "expired":
			p.Status = *in.Status
		}
	}
	if in.EndsAt != nil {
		p.EndsAt = *in.EndsAt
	}
	if in.ExtendDays != nil {
		base := p.EndsAt
		if base.Before(time.Now()) {
			base = time.Now()
		}
		p.EndsAt = base.Add(time.Duration(*in.ExtendDays) * 24 * time.Hour)
	}
	if in.TokensUsed != nil && *in.TokensUsed >= 0 {
		p.TokensUsed = *in.TokensUsed
	}
	out, err := s.q.AdminUpdateSubscription(r.Context(), p)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "subscription.update", id.String(), in)
	writeJSON(w, 200, out)
}

func (s *Server) adminKeys(w http.ResponseWriter, r *http.Request) {
	qp := r.URL.Query()
	rows, err := s.q.AdminListKeys(r.Context(), db.AdminListKeysParams{UserID: qp.Get("user_id"), Q: strings.TrimSpace(qp.Get("q")),
		Revoked: qp.Get("revoked") == "1", Lim: int32(qInt(r, "limit", 100, 500)), Off: int32(qInt(r, "offset", 0, 0))})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": adminKeyDTOs(rows)})
}

func (s *Server) adminPatchKey(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in keyInput
	if !readJSON(w, r, &in) {
		return
	}
	limit, reset, err := in.validate()
	if err != nil {
		writeErr(w, 400, "bad_input", err.Error())
		return
	}
	k, err := s.q.AdminUpdateKey(r.Context(), db.AdminUpdateKeyParams{ID: id, Name: in.Name, LimitMicro: limit, LimitReset: reset,
		RpmLimit: in.RpmLimit, Disabled: in.Disabled, ExpiresAt: in.ExpiresAt})
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "key.update", id.String(), in)
	writeJSON(w, 200, keyDTO(k))
}

func (s *Server) adminRevokeKey(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	if err := s.q.AdminRevokeKey(r.Context(), id); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "key.revoke", id.String(), nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminTransactions(w http.ResponseWriter, r *http.Request) {
	qp := r.URL.Query()
	rows, err := s.q.AdminListTransactions(r.Context(), db.AdminListTransactionsParams{Kind: qp.Get("kind"), UserID: qp.Get("user_id"),
		Q: strings.TrimSpace(qp.Get("q")), Lim: int32(qInt(r, "limit", 100, 500)), Off: int32(qInt(r, "offset", 0, 0))})
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (s *Server) adminPayments2(w http.ResponseWriter, r *http.Request) {
	qp := r.URL.Query()
	rows, err := s.q.AdminListPaymentsFull(r.Context(), db.AdminListPaymentsFullParams{Status: qp.Get("status"), UserID: qp.Get("user_id"),
		Q: strings.TrimSpace(qp.Get("q")), Lim: int32(qInt(r, "limit", 100, 500)), Off: int32(qInt(r, "offset", 0, 0))})
	if err != nil {
		s.internal(w, err)
		return
	}
	totals, _ := s.q.AdminPaymentTotals(r.Context(), time.Now().AddDate(0, 0, -30))
	writeJSON(w, 200, map[string]any{"data": rows, "totals": totals})
}

func (s *Server) adminCancelPayment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	if err := s.billing.FailPayment(r.Context(), id, "canceled"); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "payment.cancel", id.String(), nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// adminRefundPayment помечает оплаченный платёж возвращённым и списывает сумму с баланса.
// Деньги клиенту возвращает платёжный провайдер; для fake это только запись в учёте.
func (s *Server) adminRefundPayment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	p, err := s.q.GetPayment(r.Context(), id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if p.Status != "succeeded" {
		writeErr(w, 400, "not_paid", "Only succeeded payments can be refunded")
		return
	}
	if _, err := s.billing.Credit(r.Context(), p.UserID, "refund", -money.FromKopecks(p.AmountKopecks), "Возврат платежа "+p.ExternalID, p.ID.String()); err != nil {
		s.internal(w, err)
		return
	}
	if err := s.q.AdminSetPaymentStatus(r.Context(), db.AdminSetPaymentStatusParams{ID: id, Status: "refunded"}); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "payment.refund", id.String(), map[string]int64{"kopecks": p.AmountKopecks})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminDeletePlan(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chiParam(r, "id"))
	n, _ := s.q.CountPlanSubscriptions(r.Context(), id)
	if n > 0 {
		writeErr(w, 409, "plan_in_use", "Plan has subscriptions; deactivate it instead")
		return
	}
	if err := s.q.DeletePlan(r.Context(), id); err != nil {
		s.internal(w, err)
		return
	}
	s.audit(r.Context(), currentUser(r).ID, "plan.delete", id, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

type adminKeyDTO struct {
	KeyDTO
	UserID    uuid.UUID  `json:"user_id"`
	Email     string     `json:"email"`
	RevokedAt *time.Time `json:"revoked_at"`
}

// adminKeys убирает secret_hash: даже хеш секрета не отдаём наружу.
func adminKeyDTOs(rows []db.AdminListKeysRow) []adminKeyDTO {
	out := make([]adminKeyDTO, len(rows))
	for i, k := range rows {
		out[i] = adminKeyDTO{
			KeyDTO: keyDTO(db.ApiKey{ID: k.ID, UserID: k.UserID, Kind: k.Kind, Name: k.Name, Prefix: k.Prefix, LimitMicro: k.LimitMicro,
				LimitReset: k.LimitReset, PeriodSpentMicro: k.PeriodSpentMicro, PeriodStartedAt: k.PeriodStartedAt, TotalSpentMicro: k.TotalSpentMicro,
				RpmLimit: k.RpmLimit, Disabled: k.Disabled, ExpiresAt: k.ExpiresAt, LastUsedAt: k.LastUsedAt, CreatedAt: k.CreatedAt}),
			UserID: k.UserID, Email: k.Email, RevokedAt: k.RevokedAt,
		}
	}
	return out
}
