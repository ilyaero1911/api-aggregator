// Package httpapi — HTTP-слой: /api/* для кабинета и админки (сессия в cookie), /v1/* — OpenAI-совместимый шлюз.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/billing"
	"github.com/ilyaero1911/api-aggregator/backend/internal/config"
	"github.com/ilyaero1911/api-aggregator/backend/internal/fx"
	"github.com/ilyaero1911/api-aggregator/backend/internal/gateway"
	"github.com/ilyaero1911/api-aggregator/backend/internal/payments"
	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

type Server struct {
	cfg      config.Config
	pool     *pgxpool.Pool
	q        *db.Queries
	rdb      *redis.Client
	billing  *billing.Service
	fx       *fx.Service
	settings *settings.Store
	engine   *gateway.Engine
	payments *payments.Registry
	google   *auth.Google
	sealer   *auth.Sealer
	log      *slog.Logger
}

type Deps struct {
	Cfg      config.Config
	Pool     *pgxpool.Pool
	Redis    *redis.Client
	Billing  *billing.Service
	FX       *fx.Service
	Settings *settings.Store
	Engine   *gateway.Engine
	Payments *payments.Registry
	Sealer   *auth.Sealer
	Log      *slog.Logger
}

func New(d Deps) *Server {
	s := &Server{
		cfg: d.Cfg, pool: d.Pool, q: db.New(d.Pool), rdb: d.Redis, billing: d.Billing, fx: d.FX,
		settings: d.Settings, engine: d.Engine, payments: d.Payments, sealer: d.Sealer, log: d.Log,
	}
	if d.Cfg.GoogleEnabled() {
		s.google = auth.NewGoogle(d.Cfg.GoogleClientID, d.Cfg.GoogleClientSecret, d.Cfg.PublicURL+"/api/auth/google/callback", d.Cfg.SecretKey)
	}
	return s
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP, middleware.RequestID, middleware.Recoverer, s.accessLog)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.pool.Ping(ctx); err != nil {
			writeErr(w, 503, "db_down", err.Error())
			return
		}
		if err := s.rdb.Ping(ctx).Err(); err != nil {
			writeErr(w, 503, "redis_down", err.Error())
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.Timeout(60 * time.Second))
		r.Use(s.sessionUser)
		s.publicRoutes(r)
		s.authRoutes(r)
		r.Group(func(r chi.Router) {
			r.Use(s.requireUser)
			s.accountRoutes(r)
		})
		r.Route("/admin", func(r chi.Router) {
			r.Use(s.requireAdmin)
			s.adminRoutes(r)
		})
	})

	r.Route("/v1", s.v1Routes)
	return r
}

func (s *Server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()
		next.ServeHTTP(ww, r)
		if r.URL.Path == "/healthz" {
			return
		}
		s.log.Info("http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "ms", time.Since(start).Milliseconds())
	})
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": msg, "type": errType(status)}})
}

func errType(status int) string {
	switch {
	case status == 401:
		return "authentication_error"
	case status == 402:
		return "insufficient_quota"
	case status == 429:
		return "rate_limit_error"
	case status >= 500:
		return "server_error"
	}
	return "invalid_request_error"
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20))
	if err := dec.Decode(v); err != nil {
		writeErr(w, 400, "bad_json", "Invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func (s *Server) internal(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 404, "not_found", "Not found")
		return
	}
	s.log.Error("internal error", "err", err)
	writeErr(w, 500, "internal", "Internal error")
}

func pathUUID(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		writeErr(w, 400, "bad_id", "Invalid id")
		return uuid.Nil, false
	}
	return id, true
}

func qInt(r *http.Request, name string, def, max int) int {
	v, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || v < 0 {
		return def
	}
	if max > 0 && v > max {
		return max
	}
	return v
}

// since: 24h | 7d | 30d | all
func since(r *http.Request) (time.Time, string) {
	switch r.URL.Query().Get("range") {
	case "24h":
		return time.Now().Add(-24 * time.Hour), "hour"
	case "30d":
		return time.Now().AddDate(0, 0, -30), "day"
	case "all":
		return time.Unix(0, 0), "day"
	}
	return time.Now().AddDate(0, 0, -7), "day"
}

func (s *Server) audit(ctx context.Context, actor uuid.UUID, action, target string, details any) {
	raw, _ := json.Marshal(details)
	_ = s.q.InsertAudit(ctx, db.InsertAuditParams{ActorID: &actor, Action: action, Target: target, Details: raw})
}

func clientIP(r *http.Request) string {
	ip := r.RemoteAddr
	if i := strings.LastIndex(ip, ":"); i > 0 && !strings.Contains(ip[i:], "]") {
		ip = ip[:i]
	}
	return ip
}

func chiParam(r *http.Request, name string) string { return chi.URLParam(r, name) }
