package routing

import (
	"context"
	"errors"
	"math/rand"
	"sync"
	"time"
)

// ErrAfterFirstByte — клиент уже получил часть ответа, повторять нельзя.
// Адаптер оборачивает им ошибку стрима: fmt.Errorf("%w: %w", ErrAfterFirstByte, err).
var ErrAfterFirstByte = errors.New("ответ уже начал отдаваться клиенту")

// RetryPolicy — экспоненциальная задержка с полным джиттером.
type RetryPolicy struct {
	MaxAttempts int // попыток на запрос, включая первую
	Base        time.Duration
	Max         time.Duration
	Rand        func() float64 // [0, 1); nil — math/rand
}

var DefaultRetry = RetryPolicy{MaxAttempts: 3, Base: 100 * time.Millisecond, Max: 2 * time.Second}

// Backoff — задержка перед повтором номер retry (с нуля): случайная в [0, min(Max, Base·2^retry)).
func (p RetryPolicy) Backoff(retry int) time.Duration {
	ceiling := p.Base
	for i := 0; i < retry && ceiling < p.Max; i++ {
		ceiling *= 2
	}
	if ceiling > p.Max {
		ceiling = p.Max
	}
	random := p.Rand
	if random == nil {
		random = rand.Float64
	}
	return time.Duration(random() * float64(ceiling))
}

// RetryBudget — общий бюджет ретраев шлюза, чтобы повторы не усиливали инцидент.
// Схема как у retry throttling в gRPC: ошибка тратит токен, успех возвращает Ratio
// токена; ретраи разрешены, пока токенов больше половины.
type RetryBudget struct {
	mu     sync.Mutex
	max    float64
	ratio  float64
	tokens float64
}

func NewRetryBudget(max, ratio float64) *RetryBudget {
	return &RetryBudget{max: max, ratio: ratio, tokens: max}
}

func (b *RetryBudget) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.tokens > b.max/2
}

func (b *RetryBudget) Failure() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.tokens -= 1; b.tokens < 0 {
		b.tokens = 0
	}
}

func (b *RetryBudget) Success() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.tokens += b.ratio; b.tokens > b.max {
		b.tokens = b.max
	}
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
