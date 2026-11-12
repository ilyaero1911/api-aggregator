package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/money"
	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

// Команды: владелец приглашает участников, их ключи списывают деньги с его баланса в пределах бюджета.
// Оплата по счёту для юрлиц.

func (s *Server) teamRoutes(r chi.Router) {
	r.Get("/team", s.teamOverview)
	r.Post("/team/invites", s.teamInvite)
	r.Delete("/team/invites/{id}", s.teamInviteDelete)
	r.Patch("/team/members/{id}", s.teamMemberUpdate)
	r.Delete("/team/members/{id}", s.teamMemberRemove)
	r.Post("/team/leave/{owner}", s.teamLeave)
	r.Get("/team/join/{token}", s.teamInviteInfo)
	r.Post("/team/join/{token}", s.teamInviteAccept)
	r.Post("/billing/invoice", s.createInvoice)
}

func (s *Server) teamOverview(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	members, err := s.q.ListTeamMembers(r.Context(), u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	invites, _ := s.q.ListInvites(r.Context(), u.ID)
	mine, _ := s.q.ListMyTeams(r.Context(), u.ID)
	type inv struct {
		ID          uuid.UUID `json:"id"`
		Email       string    `json:"email"`
		Role        string    `json:"role"`
		BudgetMicro *int64    `json:"budget_micro"`
		CreatedAt   string    `json:"created_at"`
	}
	out := make([]inv, len(invites))
	for i, x := range invites {
		out[i] = inv{ID: x.ID, Email: x.Email, Role: x.Role, BudgetMicro: x.BudgetMicro, CreatedAt: x.CreatedAt.Format("2006-01-02T15:04:05Z07:00")}
	}
	writeJSON(w, 200, map[string]any{"members": members, "invites": out, "teams": mine})
}

func budgetMicro(rub *float64) *int64 {
	if rub == nil || *rub <= 0 {
		return nil
	}
	v := int64(*rub * float64(money.Micro))
	return &v
}

func (s *Server) teamInvite(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		Email     string   `json:"email"`
		Role      string   `json:"role"`
		BudgetRub *float64 `json:"budget_rub"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if !validEmail(in.Email) {
		writeErr(w, 400, "bad_email", "Invalid email")
		return
	}
	if in.Email == strings.ToLower(u.Email) {
		writeErr(w, 400, "self", "You cannot invite yourself")
		return
	}
	if in.Role != "admin" {
		in.Role = "member"
	}
	token := auth.RandomToken(24)
	inv, err := s.q.CreateInvite(r.Context(), db.CreateInviteParams{OwnerID: u.ID, Email: in.Email, Role: in.Role, BudgetMicro: budgetMicro(in.BudgetRub), TokenHash: auth.HashToken(token)})
	if err != nil {
		s.internal(w, err)
		return
	}
	s.event(r, u.ID, "team.invite", in.Email)
	// Письма пока не отправляем: ссылку владелец передаёт сам.
	writeJSON(w, 201, map[string]any{"id": inv.ID, "link": s.cfg.PublicURL + "/join/" + token})
}

func (s *Server) teamInviteDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	_ = s.q.DeleteInvite(r.Context(), db.DeleteInviteParams{ID: id, OwnerID: currentUser(r).ID})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) teamMemberUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Role      string   `json:"role"`
		BudgetRub *float64 `json:"budget_rub"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Role != "admin" {
		in.Role = "member"
	}
	owner := currentUser(r).ID
	if _, err := s.q.GetMembership(r.Context(), db.GetMembershipParams{OwnerID: owner, MemberID: id}); err != nil {
		writeErr(w, 404, "not_found", "Member not found")
		return
	}
	if err := s.q.UpdateMember(r.Context(), db.UpdateMemberParams{OwnerID: owner, MemberID: id, Role: in.Role, BudgetMicro: budgetMicro(in.BudgetRub)}); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) teamMemberRemove(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	owner := currentUser(r).ID
	_ = s.q.RemoveMember(r.Context(), db.RemoveMemberParams{OwnerID: owner, MemberID: id})
	_ = s.q.RevokeTeamKeys(r.Context(), db.RevokeTeamKeysParams{UserID: id, BillingUserID: &owner})
	s.event(r, owner, "team.remove", id.String())
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) teamLeave(w http.ResponseWriter, r *http.Request) {
	owner, err := uuid.Parse(chi.URLParam(r, "owner"))
	if err != nil {
		writeErr(w, 400, "bad_id", "Invalid id")
		return
	}
	me := currentUser(r).ID
	_ = s.q.RemoveMember(r.Context(), db.RemoveMemberParams{OwnerID: owner, MemberID: me})
	_ = s.q.RevokeTeamKeys(r.Context(), db.RevokeTeamKeysParams{UserID: me, BillingUserID: &owner})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) teamInviteInfo(w http.ResponseWriter, r *http.Request) {
	inv, err := s.q.GetInviteByToken(r.Context(), auth.HashToken(chi.URLParam(r, "token")))
	if err != nil {
		writeErr(w, 404, "invite_not_found", "Invite is invalid or expired")
		return
	}
	writeJSON(w, 200, map[string]any{"owner_email": inv.OwnerEmail, "owner_name": inv.OwnerName, "email": inv.Email, "role": inv.Role, "budget_micro": inv.BudgetMicro})
}

func (s *Server) teamInviteAccept(w http.ResponseWriter, r *http.Request) {
	inv, err := s.q.GetInviteByToken(r.Context(), auth.HashToken(chi.URLParam(r, "token")))
	if err != nil {
		writeErr(w, 404, "invite_not_found", "Invite is invalid or expired")
		return
	}
	u := currentUser(r)
	if u.ID == inv.OwnerID {
		writeErr(w, 400, "self", "This is your own team")
		return
	}
	if err := s.q.AddMember(r.Context(), db.AddMemberParams{OwnerID: inv.OwnerID, MemberID: u.ID, Role: inv.Role, BudgetMicro: inv.BudgetMicro}); err != nil {
		s.internal(w, err)
		return
	}
	_ = s.q.AcceptInvite(r.Context(), inv.ID)
	s.event(r, u.ID, "team.join", inv.OwnerEmail)
	writeJSON(w, 200, map[string]any{"owner_id": inv.OwnerID})
}

// createInvoice выставляет счёт юрлицу: платёж в статусе pending, реквизиты покупателя в meta.
// Админ зачисляет его вручную, когда деньги придут на расчётный счёт.
func (s *Server) createInvoice(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		AmountRub float64 `json:"amount_rub"`
		Company   string  `json:"company"`
		INN       string  `json:"inn"`
		KPP       string  `json:"kpp"`
		Address   string  `json:"address"`
		Email     string  `json:"email"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.INN = strings.TrimSpace(in.INN)
	if strings.TrimSpace(in.Company) == "" || !(len(in.INN) == 10 || len(in.INN) == 12) || strings.Trim(in.INN, "0123456789") != "" {
		writeErr(w, 400, "bad_company", "Company name and a 10 or 12 digit INN are required")
		return
	}
	kop := int64(in.AmountRub*100 + 0.5)
	if min := s.settings.Int(r.Context(), settings.MinTopupKopecks, 10000); kop < min || kop > 1_000_000_000 {
		writeErr(w, 400, "bad_amount", fmt.Sprintf("Amount must be at least %d ₽", min/100))
		return
	}
	num, _ := s.q.NextInvoiceNumber(r.Context())
	p, err := s.q.CreatePayment(r.Context(), db.CreatePaymentParams{UserID: u.ID, Provider: "invoice", Purpose: "topup", AmountKopecks: kop})
	if err != nil {
		s.internal(w, err)
		return
	}
	meta, _ := json.Marshal(map[string]string{"number": fmt.Sprint(num), "company": in.Company, "inn": in.INN, "kpp": in.KPP, "address": in.Address, "email": in.Email})
	_ = s.q.SetPaymentMeta(r.Context(), db.SetPaymentMetaParams{ID: p.ID, Meta: meta})
	_, _ = s.q.SetPaymentExternal(r.Context(), db.SetPaymentExternalParams{ID: p.ID, ExternalID: fmt.Sprintf("СЧ-%d", num), ConfirmationUrl: s.cfg.PublicURL + "/invoice/" + p.ID.String()})
	s.event(r, u.ID, "invoice", fmt.Sprintf("СЧ-%d", num))
	s.tg.Send(r.Context(), fmt.Sprintf("🧾 <b>Выставлен счёт</b> СЧ-%d на %.2f ₽\n%s, ИНН %s", num, float64(kop)/100, in.Company, in.INN))
	pay, _ := s.q.GetPayment(r.Context(), p.ID)
	writeJSON(w, 201, pay)
}
