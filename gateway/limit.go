package gateway

import (
	"sync"
	"time"
)

// Tier — уровень аккаунта.
type Tier string

const (
	TierNew        Tier = "new"
	TierVerified   Tier = "verified"
	TierPaying     Tier = "paying"
	TierEnterprise Tier = "enterprise"
)

func TierOf(verified bool, paidMinor int64, contract bool) Tier {
	switch {
	case contract:
		return TierEnterprise
	case paidMinor >= 100*1_000_000:
		return TierPaying
	case verified:
		return TierVerified
	default:
		return TierNew
	}
}

func TierLimits(t Tier) (rpm, tpm int, expensive bool) {
	switch t {
	case TierEnterprise:
		return 600, 2_000_000, true
	case TierPaying:
		return 120, 400_000, true
	case TierVerified:
		return 60, 100_000, false
	default:
		return 20, 20_000, false
	}
}

// Bucket — скользящее окно на минуту. Это локальный лимитер, не Redis Lua.
type Bucket struct {
	When   []time.Time
	Tokens []int
}

type LimitDecision struct {
	OK        bool
	Limit     int
	Remaining int
	Reset     time.Time
	Source    string
}

type Limiter struct {
	mu       sync.Mutex
	keys     map[string]*Bucket
	RedisUp  bool
	LocalRPM int
}

func NewLimiter() *Limiter {
	return &Limiter{keys: map[string]*Bucket{}, RedisUp: true, LocalRPM: 5}
}

func (l *Limiter) Allow(scope string, rpm, tokens int, now time.Time) LimitDecision {
	l.mu.Lock()
	defer l.mu.Unlock()
	source := "redis"
	if !l.RedisUp {
		source = "local"
		if rpm <= 0 || rpm > l.LocalRPM {
			rpm = l.LocalRPM
		}
	}
	if rpm <= 0 {
		rpm = 1
	}
	b := l.keys[scope]
	if b == nil {
		b = &Bucket{}
		l.keys[scope] = b
	}
	cut := now.Add(-time.Minute)
	var when []time.Time
	var toks []int
	used := 0
	for i, t := range b.When {
		if t.After(cut) {
			when = append(when, t)
			toks = append(toks, b.Tokens[i])
			used += b.Tokens[i]
		}
	}
	b.When, b.Tokens = when, toks
	if len(b.When) >= rpm || (tokens > 0 && used+tokens > rpm*1000 && rpm < 100) {
		return LimitDecision{OK: false, Limit: rpm, Remaining: 0, Reset: now.Add(time.Minute), Source: source}
	}
	b.When = append(b.When, now)
	b.Tokens = append(b.Tokens, tokens)
	return LimitDecision{OK: true, Limit: rpm, Remaining: rpm - len(b.When), Reset: now.Add(time.Minute), Source: source}
}

// TPM резервирует оценку и потом поправляет факт.
func (l *Limiter) ReserveTPM(scope string, estimate, actual, cap int, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.keys["tpm:"+scope]
	if b == nil {
		b = &Bucket{}
		l.keys["tpm:"+scope] = b
	}
	used := 0
	for _, n := range b.Tokens {
		used += n
	}
	if used+estimate > cap {
		return false
	}
	b.When = append(b.When, now)
	b.Tokens = append(b.Tokens, actual)
	return true
}

// Fair — доля слотов провайдера на клиента. Чужой пик не забирает все слоты.
type Fair struct {
	mu       sync.Mutex
	Capacity int
	Share    int
	held     map[string]int
	used     int
}

func NewFair(capacity, share int) *Fair {
	if share <= 0 {
		share = 1
	}
	return &Fair{Capacity: capacity, Share: share, held: map[string]int{}}
}

func (f *Fair) Acquire(account string, priority int) (waited bool, ok bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.held[account] >= f.Share && priority < 2 {
		return false, false
	}
	if f.used >= f.Capacity {
		if priority >= 2 {
			return true, true
		}
		return false, false
	}
	f.held[account]++
	f.used++
	return false, true
}

func (f *Fair) Release(account string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.held[account] > 0 {
		f.held[account]--
		f.used--
	}
}

// Degrade — что делать, когда Redis недоступен.
func Degrade(kind string, redisUp bool) string {
	if redisUp {
		return "normal"
	}
	switch kind {
	case "hold":
		return "reject"
	case "key_cache", "limit":
		return "local"
	default:
		return "local"
	}
}

// FreeQuota — дневная квота бесплатных моделей, отдельно от платного трафика.
type FreeQuota struct {
	mu    sync.Mutex
	Daily int
	Bonus int
	used  map[string]int
	day   string
}

func NewFreeQuota(daily, bonus int) *FreeQuota {
	return &FreeQuota{Daily: daily, Bonus: bonus, used: map[string]int{}}
}

func (q *FreeQuota) Allow(account string, free, toppedUp bool, now time.Time) (ok bool, left int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	day := now.Format("2006-01-02")
	if q.day != day {
		q.day = day
		q.used = map[string]int{}
	}
	cap := q.Daily
	if toppedUp {
		cap += q.Bonus
	}
	if !free {
		return true, cap
	}
	if q.used[account] >= cap {
		return false, 0
	}
	q.used[account]++
	return true, cap - q.used[account]
}
