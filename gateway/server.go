package gateway

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/ilyaero1911/api-aggregator/adapters"
	"github.com/ilyaero1911/api-aggregator/apierr"
	"github.com/ilyaero1911/api-aggregator/billing"
	"github.com/ilyaero1911/api-aggregator/routing"
)

// Config — параметры процесса. Пустой адрес и неположительный лимит тела не проходят.
type Config struct {
	Addr      string
	BodyLimit int64
}

func ConfigFrom(getenv func(string) string) (Config, error) {
	cfg := Config{Addr: ":8080", BodyLimit: 1 << 20}
	if getenv == nil {
		return cfg, nil
	}
	if addr := strings.TrimSpace(getenv("GATEWAY_ADDR")); addr != "" {
		cfg.Addr = addr
	}
	if raw := strings.TrimSpace(getenv("GATEWAY_BODY_LIMIT")); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n <= 0 {
			return Config{}, errors.New("GATEWAY_BODY_LIMIT должен быть положительным")
		}
		cfg.BodyLimit = n
	}
	return cfg, nil
}

// Key — запись ключа клиента.
type Key struct {
	Account   string
	Active    bool
	Expires   time.Time
	OrgActive bool
}

type cachedKey struct {
	key   Key
	until time.Time
}

// Keys — поиск ключа по SHA-256. Кэш сбрасывается сразу при отзыве.
type Keys struct {
	mu      sync.Mutex
	db      map[string]Key
	cache   map[string]cachedKey
	TTL     time.Duration
	dbReads int
}

func NewKeys(ttl time.Duration) *Keys {
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	return &Keys{db: map[string]Key{}, cache: map[string]cachedKey{}, TTL: ttl}
}

func HashKey(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func (k *Keys) Put(secret string, key Key) {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.db[HashKey(secret)] = key
	delete(k.cache, HashKey(secret))
}

func (k *Keys) Revoke(secret string) {
	k.mu.Lock()
	defer k.mu.Unlock()
	hash := HashKey(secret)
	rec := k.db[hash]
	rec.Active = false
	k.db[hash] = rec
	delete(k.cache, hash)
}

func (k *Keys) Reads() int {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.dbReads
}

func (k *Keys) Lookup(secret string, now time.Time) (Key, error) {
	if secret == "" {
		return Key{}, apierr.New(apierr.InvalidAPIKey, "")
	}
	hash := HashKey(secret)
	k.mu.Lock()
	defer k.mu.Unlock()
	if item, ok := k.cache[hash]; ok && now.Before(item.until) {
		return accept(item.key, now)
	}
	rec, ok := k.db[hash]
	k.dbReads++
	if !ok {
		return Key{}, apierr.New(apierr.InvalidAPIKey, "")
	}
	k.cache[hash] = cachedKey{key: rec, until: now.Add(k.TTL)}
	return accept(rec, now)
}

func accept(key Key, now time.Time) (Key, error) {
	if !key.Active || !key.OrgActive || (!key.Expires.IsZero() && !now.Before(key.Expires)) {
		return Key{}, apierr.New(apierr.InvalidAPIKey, "")
	}
	return key, nil
}

func secretFrom(r *http.Request) string {
	if key := strings.TrimSpace(r.Header.Get("x-api-key")); key != "" {
		return key
	}
	header := r.Header.Get("Authorization")
	if len(header) > 7 && strings.EqualFold(header[:7], "bearer ") {
		return strings.TrimSpace(header[7:])
	}
	return ""
}

// Mock — ответ учебного провайдера.
type Mock func(ctx context.Context, e routing.Endpoint, model string) (adapters.Reply, error)

// Service — каркас шлюза.
type Service struct {
	Keys        *Keys
	Routes      *routing.Registry
	Router      *routing.Router
	Ledger      *billing.Ledger
	Hold        int64
	CallTimeout time.Duration
	Mock        Mock
	BodyLimit   int64
	Now         func() time.Time
	requests    atomic.Int64
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Service) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(s.withMeta)
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/readyz", s.ready)
	r.Get("/metrics", s.metrics)
	r.Post("/v1/chat/completions", s.complete)
	r.Get("/v1/models/{model}/endpoints", s.endpoints)
	return r
}

func (s *Service) withMeta(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.requests.Add(1)
		id := r.Header.Get("X-Request-Id")
		if id == "" {
			id = randID()
		}
		w.Header().Set("X-Request-Id", id)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		defer func() {
			if rec := recover(); rec != nil {
				writeErr(w, apierr.New(apierr.ProviderError, "внутренняя ошибка"))
			}
		}()
		limit := s.BodyLimit
		if limit <= 0 {
			limit = 1 << 20
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

func (s *Service) ready(w http.ResponseWriter, _ *http.Request) {
	if s.Routes == nil {
		writeErr(w, apierr.New(apierr.NoAvailableProvider, "каталог не готов"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Service) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = io.WriteString(w, "gateway_requests_total "+strconv.FormatInt(s.requests.Load(), 10)+"\n")
}

type chatRequest struct {
	Model    string `json:"model"`
	Messages []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"messages"`
}

type chatResponse struct {
	ID       string `json:"id"`
	Model    string `json:"model"`
	Provider string `json:"provider"`
	Choices  []struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int64 `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
		CachedTokens     int64 `json:"cached_tokens"`
		ReasoningTokens  int64 `json:"reasoning_tokens"`
	} `json:"usage"`
}

func (s *Service) complete(w http.ResponseWriter, r *http.Request) {
	key, err := s.Keys.Lookup(secretFrom(r), s.now())
	if err != nil {
		writeErr(w, apierr.As(err))
		return
	}
	var body chatRequest
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&body); err != nil {
		writeErr(w, apierr.New(apierr.InvalidRequest, "тело не JSON"))
		return
	}
	if body.Model == "" || len(body.Messages) == 0 {
		writeErr(w, apierr.New(apierr.InvalidRequest, "нужны model и messages").WithParam("model"))
		return
	}
	gen := r.Header.Get("X-Generation-Id")
	if gen == "" {
		gen = randID()
	}
	hold := s.Hold
	if hold <= 0 {
		hold = billing.Kopeck
	}
	if err := s.Ledger.Authorize(key.Account, gen, body.Model, hold, s.now()); err != nil {
		if errors.Is(err, billing.ErrFunds) {
			writeErr(w, apierr.New(apierr.InsufficientBalance, ""))
			return
		}
		writeErr(w, apierr.New(apierr.InvalidRequest, err.Error()))
		return
	}
	if _, ok := s.Ledger.Captured(gen); ok {
		var replay chatResponse
		replay.ID = gen
		replay.Model = body.Model
		w.Header().Set("X-Generation-Id", gen)
		writeJSON(w, http.StatusOK, replay)
		return
	}
	timeout := s.CallTimeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()
	var trace []routing.Attempt
	reply, endpoint, callErr := s.Router.Model(ctx, body.Model, func(ctx context.Context, e routing.Endpoint) (adapters.Reply, error) {
		if s.Mock == nil {
			return adapters.Reply{}, apierr.New(apierr.NoAvailableProvider, "")
		}
		return s.Mock(ctx, e, body.Model)
	}, &trace)
	if callErr != nil {
		_ = s.Ledger.Release(key.Account, gen)
		writeErr(w, apierr.As(callErr))
		return
	}
	if err := s.Ledger.Capture(key.Account, gen, hold); err != nil {
		writeErr(w, apierr.New(apierr.ProviderError, ""))
		return
	}
	var out chatResponse
	out.ID = gen
	out.Model = body.Model
	out.Provider = endpoint.Provider
	out.Choices = []struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	}{{Message: struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}{Role: "assistant", Content: reply.Text}}}
	out.Usage.PromptTokens = reply.Usage.Input
	out.Usage.CompletionTokens = reply.Usage.Output
	out.Usage.CachedTokens = reply.Usage.CacheRead
	out.Usage.ReasoningTokens = reply.Usage.Reasoning
	w.Header().Set("X-Generation-Id", gen)
	writeJSON(w, http.StatusOK, out)
}

func (s *Service) endpoints(w http.ResponseWriter, r *http.Request) {
	if _, err := s.Keys.Lookup(secretFrom(r), s.now()); err != nil {
		writeErr(w, apierr.As(err))
		return
	}
	model := chi.URLParam(r, "model")
	if s.Routes == nil || !s.Routes.Has(model) {
		writeErr(w, apierr.New(apierr.ModelNotFound, ""))
		return
	}
	writeJSON(w, http.StatusOK, s.Routes.All(model))
}

func writeErr(w http.ResponseWriter, err *apierr.Error) {
	if err == nil {
		err = apierr.New(apierr.ProviderError, "")
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Status)
	_, _ = w.Write(err.JSON())
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func randID() string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return hex.EncodeToString(buf[:])
}
