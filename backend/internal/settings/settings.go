// Package settings — настройки площадки из таблицы settings с кэшем в памяти.
package settings

import (
	"context"
	"encoding/json"
	"strconv"
	"sync"
	"time"

	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

type Store struct {
	q   *db.Queries
	mu  sync.RWMutex
	at  time.Time
	val map[string]json.RawMessage
}

func New(q *db.Queries) *Store { return &Store{q: q, val: map[string]json.RawMessage{}} }

const ttl = 15 * time.Second

func (s *Store) load(ctx context.Context) map[string]json.RawMessage {
	s.mu.RLock()
	if time.Since(s.at) < ttl {
		v := s.val
		s.mu.RUnlock()
		return v
	}
	s.mu.RUnlock()
	rows, err := s.q.GetSettings(ctx)
	if err != nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.val
	}
	m := make(map[string]json.RawMessage, len(rows))
	for _, r := range rows {
		m[r.Key] = r.Value
	}
	s.mu.Lock()
	s.val, s.at = m, time.Now()
	s.mu.Unlock()
	return m
}

func (s *Store) Invalidate() {
	s.mu.Lock()
	s.at = time.Time{}
	s.mu.Unlock()
}

func (s *Store) All(ctx context.Context) map[string]json.RawMessage { return s.load(ctx) }

func (s *Store) Int(ctx context.Context, key string, def int64) int64 {
	raw, ok := s.load(ctx)[key]
	if !ok {
		return def
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n
	}
	var str string
	if json.Unmarshal(raw, &str) == nil {
		if v, err := strconv.ParseInt(str, 10, 64); err == nil {
			return v
		}
	}
	return def
}

func (s *Store) Bool(ctx context.Context, key string, def bool) bool {
	raw, ok := s.load(ctx)[key]
	if !ok {
		return def
	}
	var b bool
	if json.Unmarshal(raw, &b) == nil {
		return b
	}
	return def
}

func (s *Store) Set(ctx context.Context, key string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := s.q.SetSetting(ctx, db.SetSettingParams{Key: key, Value: raw}); err != nil {
		return err
	}
	s.Invalidate()
	return nil
}

// Ключи настроек, которыми пользуется код.
const (
	MarkupBps          = "markup_bps"
	SignupBonusMicro   = "signup_bonus_micro"
	FxFallbackUSD      = "fx_fallback_usd_rub_micro"
	FreeDailyRequests  = "free_daily_requests"
	MinTopupKopecks    = "min_topup_kopecks"
	RegistrationOpen   = "registration_open"
)
