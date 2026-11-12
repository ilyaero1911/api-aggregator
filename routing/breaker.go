package routing

import (
	"sync"
	"time"
)

// BreakerState — состояние circuit breaker эндпоинта.
type BreakerState string

const (
	Closed   BreakerState = "closed"
	Open     BreakerState = "open"
	HalfOpen BreakerState = "half-open"
)

// BreakerConfig — пороги размыкания.
type BreakerConfig struct {
	Consecutive int           // ошибок подряд для размыкания
	Rate        float64       // доля ошибок среди последних Window вызовов
	MinCalls    int           // меньше вызовов — долю не считаем
	Window      int           // сколько последних вызовов помнить
	Cooldown    time.Duration // сколько ждать до пробного вызова
}

var DefaultBreaker = BreakerConfig{
	Consecutive: 5,
	Rate:        0.5,
	MinCalls:    10,
	Window:      20,
	Cooldown:    30 * time.Second,
}

// Breaker — circuit breaker одного эндпоинта: closed → open → half-open → closed.
type Breaker struct {
	mu          sync.Mutex
	cfg         BreakerConfig
	now         func() time.Time
	state       BreakerState
	outcomes    []bool
	consecutive int
	openedAt    time.Time
	probing     bool
}

func NewBreaker(cfg BreakerConfig, now func() time.Time) *Breaker {
	if now == nil {
		now = time.Now
	}
	return &Breaker{cfg: cfg, now: now, state: Closed}
}

// Allow — можно ли вызвать эндпоинт. В half-open пропускается один пробный вызов.
func (b *Breaker) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case Open:
		if b.now().Sub(b.openedAt) < b.cfg.Cooldown {
			return false
		}
		b.state = HalfOpen
		b.probing = true
		return true
	case HalfOpen:
		if b.probing {
			return false
		}
		b.probing = true
		return true
	}
	return true
}

// Ready — пропустит ли Allow вызов сейчас. Состояние не меняет.
func (b *Breaker) Ready() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case Open:
		return b.now().Sub(b.openedAt) >= b.cfg.Cooldown
	case HalfOpen:
		return !b.probing
	}
	return true
}

// Cancel — вызов не завершился по вине клиента: пробный слот освобождается без итога.
func (b *Breaker) Cancel() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.probing = false
}

// Record — итог разрешённого вызова.
func (b *Breaker) Record(ok bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state == HalfOpen {
		b.probing = false
		if ok {
			b.reset()
		} else {
			b.trip()
		}
		return
	}
	if b.state == Open {
		return
	}
	b.outcomes = append(b.outcomes, ok)
	if len(b.outcomes) > b.cfg.Window {
		b.outcomes = b.outcomes[len(b.outcomes)-b.cfg.Window:]
	}
	if ok {
		b.consecutive = 0
		return
	}
	b.consecutive++
	if b.cfg.Consecutive > 0 && b.consecutive >= b.cfg.Consecutive {
		b.trip()
		return
	}
	if len(b.outcomes) >= b.cfg.MinCalls {
		failed := 0
		for _, o := range b.outcomes {
			if !o {
				failed++
			}
		}
		if float64(failed)/float64(len(b.outcomes)) >= b.cfg.Rate {
			b.trip()
		}
	}
}

func (b *Breaker) State() BreakerState {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}

func (b *Breaker) trip() {
	b.state = Open
	b.openedAt = b.now()
	b.outcomes = nil
	b.consecutive = 0
}

func (b *Breaker) reset() {
	b.state = Closed
	b.outcomes = nil
	b.consecutive = 0
}
