package httpapi

import (
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

// Строгая проверка адреса: латиница, домен с точкой и зоной от двух букв, без пробелов.
var emailRe = regexp.MustCompile(`^[a-z0-9._%+\-]{1,64}@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,24}$`)

func validEmail(e string) bool {
	return len(e) <= 200 && emailRe.MatchString(e) && !strings.Contains(e, "..")
}

// oauthList — провайдеры входа и настроены ли они на этом сервере.
func (s *Server) oauthList() []map[string]any {
	out := []map[string]any{}
	for _, name := range []string{"github", "yandex", "vk"} {
		_, ok := s.oauth[name]
		out = append(out, map[string]any{"id": name, "enabled": ok})
	}
	return out
}

func (s *Server) event(r *http.Request, user uuid.UUID, kind, details string) {
	_ = s.q.AddUserEvent(r.Context(), db.AddUserEventParams{UserID: user, Kind: kind, Details: truncate(details, 300), Ip: clientIP(r)})
}

// recordConsent сохраняет факт согласия на обработку ПД и версию документа согласия.
func (s *Server) recordConsent(r *http.Request, user uuid.UUID) {
	ver := "1"
	if p, err := s.q.GetPage(r.Context(), "consent"); err == nil {
		ver = p.UpdatedAt.Format("2006-01-02") + "#" + itoa(int(p.Version))
	}
	_ = s.q.SetConsent(r.Context(), db.SetConsentParams{ID: user, PdConsentVersion: ver})
}

func itoa(n int) string { return strconv.Itoa(n) }

// checkEmail подсказывает при регистрации, свободен ли адрес.
func (s *Server) checkEmail(w http.ResponseWriter, r *http.Request) {
	e := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("email")))
	if !validEmail(e) {
		writeJSON(w, 200, map[string]any{"valid": false, "taken": false})
		return
	}
	if s.loginThrottled(r.Context(), "check:"+clientIP(r)) {
		writeJSON(w, 200, map[string]any{"valid": true, "taken": false})
		return
	}
	_, err := s.q.GetUserByEmail(r.Context(), e)
	writeJSON(w, 200, map[string]any{"valid": true, "taken": err == nil})
}

func (s *Server) oauthStart(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "provider")
	p, ok := s.oauth[name]
	if !ok {
		http.Redirect(w, r, s.cfg.PublicURL+"/login?error=oauth_disabled&provider="+url.QueryEscape(name), http.StatusFound)
		return
	}
	http.Redirect(w, r, p.AuthURL(auth.SignState(s.cfg.SecretKey, safeNext(r.URL.Query().Get("next")))), http.StatusFound)
}

func (s *Server) oauthCallback(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "provider")
	fail := func(code string) {
		http.Redirect(w, r, s.cfg.PublicURL+"/login?error="+url.QueryEscape(code), http.StatusFound)
	}
	p, ok := s.oauth[name]
	if !ok {
		fail("oauth_disabled")
		return
	}
	next, err := auth.CheckState(s.cfg.SecretKey, r.URL.Query().Get("state"))
	if err != nil {
		fail("bad_state")
		return
	}
	prof, err := p.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		s.log.Warn("oauth exchange", "provider", name, "err", err)
		fail("oauth_failed")
		return
	}
	ctx := r.Context()
	var u db.User
	id, err := s.q.GetIdentity(ctx, db.GetIdentityParams{Provider: name, Subject: prof.Subject})
	switch {
	case err == nil:
		u, err = s.q.GetUser(ctx, id.UserID)
	case errors.Is(err, pgx.ErrNoRows) && currentUser(r) != nil:
		// пользователь уже вошёл и привязывает сервис к своему аккаунту
		u = *currentUser(r)
		err = s.q.CreateIdentity(ctx, db.CreateIdentityParams{Provider: name, Subject: prof.Subject, UserID: u.ID, Email: prof.Email})
		s.event(r, u.ID, "link", name)
	case errors.Is(err, pgx.ErrNoRows):
		email := strings.ToLower(prof.Email)
		if email != "" && validEmail(email) {
			u, err = s.q.GetUserByEmail(ctx, email)
		} else {
			// провайдер не отдал почту: заводим служебный адрес, пользователь сможет сменить его позже
			email = name + "_" + prof.Subject + "@users.strelka.local"
			err = pgx.ErrNoRows
		}
		if errors.Is(err, pgx.ErrNoRows) {
			if !s.settings.Bool(ctx, settings.RegistrationOpen, true) {
				fail("registration_closed")
				return
			}
			u, err = s.createUser(ctx, db.CreateUserParams{Email: email, Name: truncate(prof.Name, 100), AvatarUrl: prof.Avatar})
			if err == nil {
				// вход через сервис означает принятие оферты и согласия, текст об этом показан под кнопками
				s.recordConsent(r, u.ID)
				s.event(r, u.ID, "signup", name)
			}
		}
		if err == nil {
			_ = s.q.CreateIdentity(ctx, db.CreateIdentityParams{Provider: name, Subject: prof.Subject, UserID: u.ID, Email: prof.Email})
		}
	}
	if err != nil {
		s.log.Error("oauth login", "provider", name, "err", err)
		fail("internal")
		return
	}
	if u.Status != "active" {
		fail("account_blocked")
		return
	}
	if err := s.startSession(w, r, u); err != nil {
		fail("internal")
		return
	}
	s.event(r, u.ID, "login", name)
	http.Redirect(w, r, s.cfg.PublicURL+next, http.StatusFound)
}
