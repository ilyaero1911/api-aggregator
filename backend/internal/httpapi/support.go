package httpapi

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"github.com/ilyaero1911/api-aggregator/backend/internal/notify"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

// Чат поддержки: пользователь пишет из кабинета, админ отвечает в админке, новые сообщения уходят в Telegram.

func cleanBody(s string) (string, bool) {
	s = strings.TrimSpace(s)
	return s, s != "" && utf8.RuneCountInString(s) <= 5000
}

func (s *Server) supportUserRoutes(r chi.Router) {
	r.Get("/support", func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		rows, err := s.q.ListUserTickets(r.Context(), u.ID)
		if err != nil {
			s.internal(w, err)
			return
		}
		unread, _ := s.q.UserSupportUnread(r.Context(), u.ID)
		writeJSON(w, 200, map[string]any{"data": rows, "unread": unread})
	})
	r.Post("/support", func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		var in struct {
			Subject string `json:"subject"`
			Body    string `json:"body"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		body, ok := cleanBody(in.Body)
		if !ok {
			writeErr(w, 400, "bad_body", "Message must be 1-5000 characters")
			return
		}
		if s.loginThrottled(r.Context(), "support:"+u.ID.String()) {
			writeErr(w, 429, "too_many_attempts", "Too many new tickets, try later")
			return
		}
		subj := strings.TrimSpace(in.Subject)
		if subj == "" {
			subj = truncate(strings.SplitN(body, "\n", 2)[0], 80)
		}
		t, err := s.q.CreateTicket(r.Context(), db.CreateTicketParams{UserID: u.ID, Subject: truncate(subj, 120)})
		if err != nil {
			s.internal(w, err)
			return
		}
		if _, err := s.q.AddMessage(r.Context(), db.AddMessageParams{TicketID: t.ID, Author: "user", AuthorID: &u.ID, Body: body}); err != nil {
			s.internal(w, err)
			return
		}
		s.notifySupport(r, u.Email, t.ID.String(), t.Subject, body, true)
		writeJSON(w, 201, t)
	})
	r.Get("/support/{id}", func(w http.ResponseWriter, r *http.Request) {
		t, ok := s.userTicket(w, r)
		if !ok {
			return
		}
		after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
		msgs, err := s.q.ListMessages(r.Context(), db.ListMessagesParams{TicketID: t.ID, After: after})
		if err != nil {
			s.internal(w, err)
			return
		}
		_ = s.q.MarkTicketReadByUser(r.Context(), t.ID)
		writeJSON(w, 200, map[string]any{"ticket": t, "messages": msgs})
	})
	r.Post("/support/{id}/messages", func(w http.ResponseWriter, r *http.Request) {
		t, ok := s.userTicket(w, r)
		if !ok {
			return
		}
		var in struct {
			Body string `json:"body"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		body, ok := cleanBody(in.Body)
		if !ok {
			writeErr(w, 400, "bad_body", "Message must be 1-5000 characters")
			return
		}
		u := currentUser(r)
		m, err := s.q.AddMessage(r.Context(), db.AddMessageParams{TicketID: t.ID, Author: "user", AuthorID: &u.ID, Body: body})
		if err != nil {
			s.internal(w, err)
			return
		}
		_ = s.q.TouchTicketByUser(r.Context(), t.ID)
		s.notifySupport(r, u.Email, t.ID.String(), t.Subject, body, false)
		writeJSON(w, 201, m)
	})
	r.Post("/support/{id}/close", func(w http.ResponseWriter, r *http.Request) {
		t, ok := s.userTicket(w, r)
		if !ok {
			return
		}
		_ = s.q.SetTicketStatus(r.Context(), db.SetTicketStatusParams{ID: t.ID, Status: "closed"})
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
}

func (s *Server) userTicket(w http.ResponseWriter, r *http.Request) (db.GetTicketRow, bool) {
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return db.GetTicketRow{}, false
	}
	t, err := s.q.GetTicket(r.Context(), id)
	if err != nil || t.UserID != currentUser(r).ID {
		writeErr(w, 404, "not_found", "Ticket not found")
		return db.GetTicketRow{}, false
	}
	return t, true
}

func (s *Server) notifySupport(r *http.Request, email, ticketID, subject, body string, isNew bool) {
	if !s.settings.Bool(r.Context(), "tg_notify_support", true) {
		return
	}
	head := "💬 Новое сообщение в поддержку"
	if isNew {
		head = "🆕 Новое обращение в поддержку"
	}
	if utf8.RuneCountInString(body) > 700 {
		body = string([]rune(body)[:700]) + "…"
	}
	s.tg.Send(r.Context(), fmt.Sprintf("<b>%s</b>\n<b>От:</b> %s\n<b>Тема:</b> %s\n\n%s\n\n<a href=\"%s/admin/support?t=%s\">Ответить в админке</a>",
		head, notify.Esc(email), notify.Esc(subject), notify.Esc(body), s.cfg.PublicURL, ticketID))
}

func (s *Server) supportAdminRoutes(r chi.Router) {
	r.Get("/support", func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.q.AdminListTickets(r.Context(), db.AdminListTicketsParams{Status: r.URL.Query().Get("status"), Q: strings.TrimSpace(r.URL.Query().Get("q"))})
		if err != nil {
			s.internal(w, err)
			return
		}
		c, _ := s.q.SupportCounters(r.Context())
		writeJSON(w, 200, map[string]any{"data": rows, "counters": c})
	})
	r.Get("/support/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathUUID(w, r, "id")
		if !ok {
			return
		}
		t, err := s.q.GetTicket(r.Context(), id)
		if err != nil {
			s.internal(w, err)
			return
		}
		after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
		msgs, _ := s.q.ListMessages(r.Context(), db.ListMessagesParams{TicketID: id, After: after})
		_ = s.q.MarkTicketReadByAdmin(r.Context(), id)
		wal, _ := s.q.GetWallet(r.Context(), t.UserID)
		var plan any
		if sub, err := s.q.GetActiveSubscription(r.Context(), t.UserID); err == nil {
			plan = sub.NameRu
		}
		writeJSON(w, 200, map[string]any{"ticket": t, "messages": msgs, "balance_micro": wal.BalanceMicro, "plan": plan})
	})
	r.Post("/support/{id}/messages", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathUUID(w, r, "id")
		if !ok {
			return
		}
		var in struct {
			Body string `json:"body"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		body, ok := cleanBody(in.Body)
		if !ok {
			writeErr(w, 400, "bad_body", "Message must be 1-5000 characters")
			return
		}
		a := currentUser(r)
		m, err := s.q.AddMessage(r.Context(), db.AddMessageParams{TicketID: id, Author: "admin", AuthorID: &a.ID, Body: body})
		if err != nil {
			s.internal(w, err)
			return
		}
		_ = s.q.TouchTicketByAdmin(r.Context(), id)
		writeJSON(w, 201, m)
	})
	r.Post("/support/{id}/status", func(w http.ResponseWriter, r *http.Request) {
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
		if in.Status != "open" && in.Status != "answered" && in.Status != "closed" {
			writeErr(w, 400, "bad_status", "status must be open|answered|closed")
			return
		}
		_ = s.q.SetTicketStatus(r.Context(), db.SetTicketStatusParams{ID: id, Status: in.Status})
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
	r.Get("/telegram", func(w http.ResponseWriter, r *http.Request) {
		chats, err := s.tg.RecentChats()
		resp := map[string]any{"enabled": s.tg.Enabled(), "env_chat": s.cfg.TelegramChatID != "", "recent": chats}
		if err != nil {
			resp["error"] = err.Error()
		}
		writeJSON(w, 200, resp)
	})
	r.Post("/telegram/test", func(w http.ResponseWriter, r *http.Request) {
		if err := s.tg.SendNow(r.Context(), "✅ Тестовое уведомление: бот подключён к админке."); err != nil {
			writeErr(w, 400, "telegram_error", err.Error())
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
}
