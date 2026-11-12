package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

const sessionCookie = "ng_session"

type ctxKey int

const userKey ctxKey = 1

func currentUser(r *http.Request) *db.User {
	u, _ := r.Context().Value(userKey).(*db.User)
	return u
}

// UserDTO — то, что видит фронтенд (без хеша пароля).
type UserDTO struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	AvatarURL   string     `json:"avatar_url"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	Locale      string     `json:"locale"`
	LogPrompts  bool       `json:"log_prompts"`
	HasPassword bool       `json:"has_password"`
	HasGoogle   bool       `json:"has_google"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

func userDTO(u db.User) UserDTO {
	return UserDTO{ID: u.ID, Email: u.Email, Name: u.Name, AvatarURL: u.AvatarUrl, Role: u.Role, Status: u.Status,
		Locale: u.Locale, LogPrompts: u.LogPrompts, HasPassword: u.PasswordHash != nil, HasGoogle: u.GoogleSub != nil,
		CreatedAt: u.CreatedAt, LastLoginAt: u.LastLoginAt}
}

func (s *Server) sessionUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
			if u, err := s.q.GetSessionUser(r.Context(), auth.HashToken(c.Value)); err == nil && u.Status == "active" {
				r = r.WithContext(context.WithValue(r.Context(), userKey, &u))
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r) == nil {
			writeErr(w, 401, "unauthorized", "Sign in required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		if u == nil {
			writeErr(w, 401, "unauthorized", "Sign in required")
			return
		}
		if u.Role != "admin" {
			writeErr(w, 403, "forbidden", "Admins only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) authRoutes(r chi.Router) {
	r.Post("/auth/register", s.register)
	r.Post("/auth/login", s.login)
	r.Post("/auth/logout", s.logout)
	r.Get("/auth/me", s.me)
	r.Get("/auth/google", s.googleStart)
	r.Get("/auth/google/callback", s.googleCallback)
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u db.User) error {
	token := auth.RandomToken(32)
	exp := time.Now().Add(s.cfg.SessionTTL)
	if err := s.q.CreateSession(r.Context(), db.CreateSessionParams{
		TokenHash: auth.HashToken(token), UserID: u.ID, UserAgent: truncate(r.UserAgent(), 300), Ip: clientIP(r), ExpiresAt: exp,
	}); err != nil {
		return err
	}
	_ = s.q.TouchLogin(r.Context(), u.ID)
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", Expires: exp, HttpOnly: true,
		Secure: s.cfg.SecureCookies, SameSite: http.SameSiteLaxMode})
	return nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// createUser создаёт пользователя, кошелёк и стартовый бонус.
func (s *Server) createUser(ctx context.Context, p db.CreateUserParams) (db.User, error) {
	if s.cfg.IsAdminEmail(p.Email) {
		p.Role = "admin"
	} else if n, _ := s.q.CountUsers(ctx); n == 0 {
		p.Role = "admin" // первый пользователь локальной установки — админ
	}
	if p.Role == "" {
		p.Role = "user"
	}
	if p.Locale != "en" {
		p.Locale = "ru"
	}
	u, err := s.q.CreateUser(ctx, p)
	if err != nil {
		return u, err
	}
	if err := s.q.EnsureWallet(ctx, u.ID); err != nil {
		return u, err
	}
	if bonus := s.settings.Int(ctx, settings.SignupBonusMicro, 0); bonus > 0 {
		_, _ = s.billing.Credit(ctx, u.ID, "bonus", bonus, "Приветственный бонус", "signup")
	}
	return u, nil
}

func (s *Server) loginThrottled(ctx context.Context, key string) bool {
	k := "login:" + key
	n, err := s.rdb.Incr(ctx, k).Result()
	if err != nil {
		return false
	}
	if n == 1 {
		s.rdb.Expire(ctx, k, 15*time.Minute)
	}
	return n > 10
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
		Locale   string `json:"locale"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if !s.settings.Bool(r.Context(), settings.RegistrationOpen, true) {
		writeErr(w, 403, "registration_closed", "Registration is closed")
		return
	}
	in.Email = strings.TrimSpace(strings.ToLower(in.Email))
	if _, err := mail.ParseAddress(in.Email); err != nil || len(in.Email) > 200 {
		writeErr(w, 400, "bad_email", "Invalid email")
		return
	}
	if len(in.Password) < 8 || len(in.Password) > 200 {
		writeErr(w, 400, "weak_password", "Password must be at least 8 characters")
		return
	}
	if s.loginThrottled(r.Context(), "reg:"+clientIP(r)) {
		writeErr(w, 429, "too_many_attempts", "Too many attempts, try later")
		return
	}
	if _, err := s.q.GetUserByEmail(r.Context(), in.Email); err == nil {
		writeErr(w, 409, "email_taken", "This email is already registered")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		s.internal(w, err)
		return
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = strings.Split(in.Email, "@")[0]
	}
	u, err := s.createUser(r.Context(), db.CreateUserParams{Email: in.Email, Name: truncate(name, 100), PasswordHash: &hash, Locale: in.Locale})
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.startSession(w, r, u); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 201, userDTO(u))
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Email = strings.TrimSpace(strings.ToLower(in.Email))
	if s.loginThrottled(r.Context(), clientIP(r)+":"+in.Email) {
		writeErr(w, 429, "too_many_attempts", "Too many attempts, try again in 15 minutes")
		return
	}
	u, err := s.q.GetUserByEmail(r.Context(), in.Email)
	if err != nil || u.PasswordHash == nil || !auth.CheckPassword(*u.PasswordHash, in.Password) {
		writeErr(w, 401, "bad_credentials", "Wrong email or password")
		return
	}
	if u.Status != "active" {
		writeErr(w, 403, "account_blocked", "Account is blocked")
		return
	}
	if err := s.startSession(w, r, u); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, userDTO(u))
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = s.q.DeleteSession(r.Context(), auth.HashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	if u == nil {
		writeJSON(w, 200, map[string]any{"user": nil, "google_enabled": s.google != nil})
		return
	}
	writeJSON(w, 200, map[string]any{"user": userDTO(*u), "google_enabled": s.google != nil})
}

func safeNext(next string) string {
	if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") {
		return "/dashboard"
	}
	return next
}

func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	if s.google == nil {
		http.Redirect(w, r, s.cfg.PublicURL+"/login?error=google_disabled", http.StatusFound)
		return
	}
	http.Redirect(w, r, s.google.AuthURL(s.google.State(safeNext(r.URL.Query().Get("next")))), http.StatusFound)
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	fail := func(code string) {
		http.Redirect(w, r, s.cfg.PublicURL+"/login?error="+url.QueryEscape(code), http.StatusFound)
	}
	if s.google == nil {
		fail("google_disabled")
		return
	}
	next, err := s.google.CheckState(r.URL.Query().Get("state"))
	if err != nil {
		fail("bad_state")
		return
	}
	prof, err := s.google.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		s.log.Warn("google exchange", "err", err)
		fail("google_failed")
		return
	}
	u, err := s.q.GetUserByGoogleSub(r.Context(), &prof.Sub)
	if errors.Is(err, pgx.ErrNoRows) {
		u, err = s.q.GetUserByEmail(r.Context(), prof.Email)
		if err == nil {
			// email подтверждён Google — привязываем аккаунт
			err = s.q.LinkGoogle(r.Context(), db.LinkGoogleParams{ID: u.ID, GoogleSub: &prof.Sub, AvatarUrl: prof.Picture})
		} else if errors.Is(err, pgx.ErrNoRows) {
			if !s.settings.Bool(r.Context(), settings.RegistrationOpen, true) {
				fail("registration_closed")
				return
			}
			u, err = s.createUser(r.Context(), db.CreateUserParams{Email: strings.ToLower(prof.Email), Name: prof.Name,
				GoogleSub: &prof.Sub, AvatarUrl: prof.Picture})
		}
	}
	if err != nil {
		s.log.Error("google login", "err", err)
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
	http.Redirect(w, r, s.cfg.PublicURL+next, http.StatusFound)
}

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		Name       *string `json:"name"`
		Locale     *string `json:"locale"`
		LogPrompts *bool   `json:"log_prompts"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	p := db.UpdateProfileParams{ID: u.ID, Name: u.Name, Locale: u.Locale, LogPrompts: u.LogPrompts}
	if in.Name != nil {
		p.Name = truncate(strings.TrimSpace(*in.Name), 100)
	}
	if in.Locale != nil && (*in.Locale == "ru" || *in.Locale == "en") {
		p.Locale = *in.Locale
	}
	if in.LogPrompts != nil {
		p.LogPrompts = *in.LogPrompts
	}
	nu, err := s.q.UpdateProfile(r.Context(), p)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, userDTO(nu))
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if u.PasswordHash != nil && !auth.CheckPassword(*u.PasswordHash, in.Current) {
		writeErr(w, 400, "bad_current_password", "Current password is wrong")
		return
	}
	if len(in.New) < 8 {
		writeErr(w, 400, "weak_password", "Password must be at least 8 characters")
		return
	}
	hash, _ := auth.HashPassword(in.New)
	if err := s.q.SetPassword(r.Context(), db.SetPasswordParams{ID: u.ID, PasswordHash: &hash}); err != nil {
		s.internal(w, err)
		return
	}
	// выходим из всех сессий, кроме текущей: проще — из всех и сразу заводим новую
	_ = s.q.DeleteUserSessions(r.Context(), u.ID)
	if err := s.startSession(w, r, *u); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}


