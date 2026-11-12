package routing

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/ilyaero1911/api-aggregator/adapters"
	"github.com/ilyaero1911/api-aggregator/apierr"
)

// Call — вызов адаптера на конкретном эндпоинте.
type Call func(ctx context.Context, e Endpoint) (adapters.Reply, error)

// Attempt — одна попытка в цепочке, для логов и метаданных ответа.
type Attempt struct {
	Model    string
	Endpoint string
	Provider string
	Code     apierr.Code // пусто — успех
	Reason   string      // circuit_open, error, ok
	Latency  time.Duration
}

// Router выбирает эндпоинт модели, повторяет идемпотентные ошибки с backoff
// и не ходит в эндпоинты с разомкнутым breaker.
type Router struct {
	Registry *Registry
	Health   *Health
	Retry    RetryPolicy
	Budget   *RetryBudget
	Breaker  BreakerConfig
	Now      func() time.Time
	Sleep    func(context.Context, time.Duration) error

	mu       sync.Mutex
	breakers map[string]*Breaker
}

func NewRouter(registry *Registry, now func() time.Time) *Router {
	if now == nil {
		now = time.Now
	}
	return &Router{
		Registry: registry,
		Health:   NewHealth(now, DefaultThresholds),
		Retry:    DefaultRetry,
		Budget:   NewRetryBudget(10, 0.1),
		Breaker:  DefaultBreaker,
		Now:      now,
		Sleep:    sleepCtx,
	}
}

// BreakerFor — breaker эндпоинта, создаётся при первом обращении.
func (r *Router) BreakerFor(endpoint string) *Breaker {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.breakers == nil {
		r.breakers = map[string]*Breaker{}
	}
	b := r.breakers[endpoint]
	if b == nil {
		b = NewBreaker(r.Breaker, r.Now)
		r.breakers[endpoint] = b
	}
	return b
}

// Model вызывает модель: эндпоинты по приоритету и здоровью, ретраи только для
// повторяемых ошибок и только до первого байта клиенту. Попытки дописываются в trace.
func (r *Router) Model(ctx context.Context, model string, call Call, trace *[]Attempt) (adapters.Reply, Endpoint, error) {
	endpoints := r.ordered(model)
	if len(endpoints) == 0 {
		return adapters.Reply{}, Endpoint{}, apierr.New(apierr.ModelNotFound, "")
	}
	attempts := 0
	var last *apierr.Error
	for i := 0; attempts < r.Retry.MaxAttempts && i < r.Retry.MaxAttempts*len(endpoints); i++ {
		e := endpoints[i%len(endpoints)]
		breaker := r.BreakerFor(e.ID)
		if !breaker.Ready() {
			add(trace, Attempt{Model: model, Endpoint: e.ID, Provider: e.Provider, Code: apierr.NoAvailableProvider, Reason: "circuit_open"})
			continue
		}
		if attempts > 0 {
			if !r.Budget.Allow() {
				add(trace, Attempt{Model: model, Endpoint: e.ID, Provider: e.Provider, Code: last.Code, Reason: "retry_budget"})
				break
			}
			if err := r.Sleep(ctx, r.Retry.Backoff(attempts-1)); err != nil {
				return adapters.Reply{}, Endpoint{}, apierr.New(apierr.Timeout, "")
			}
		}
		if !breaker.Allow() {
			add(trace, Attempt{Model: model, Endpoint: e.ID, Provider: e.Provider, Code: apierr.NoAvailableProvider, Reason: "circuit_open"})
			continue
		}
		attempts++
		start := r.Now()
		reply, err := call(ctx, e)
		latency := r.Now().Sub(start)
		if err == nil {
			breaker.Record(true)
			r.Health.Observe(e.ID, Outcome{OK: true, Latency: latency, Tokens: reply.Usage.Output})
			r.Budget.Success()
			add(trace, Attempt{Model: model, Endpoint: e.ID, Provider: e.Provider, Reason: "ok", Latency: latency})
			return reply, e, nil
		}
		if ctx.Err() != nil {
			breaker.Cancel()
			return adapters.Reply{}, e, apierr.New(apierr.Timeout, "")
		}
		last = apierr.As(err)
		providerFault := last.Retryable()
		breaker.Record(!providerFault)
		r.Health.Observe(e.ID, Outcome{OK: !providerFault, Latency: latency})
		if providerFault {
			r.Budget.Failure()
		}
		add(trace, Attempt{Model: model, Endpoint: e.ID, Provider: e.Provider, Code: last.Code, Reason: "error", Latency: latency})
		if errors.Is(err, ErrAfterFirstByte) || !providerFault {
			return adapters.Reply{}, e, last
		}
	}
	if last == nil {
		last = apierr.New(apierr.NoAvailableProvider, "")
	}
	return adapters.Reply{}, Endpoint{}, last
}

// ordered — эндпоинты модели: сначала up, потом degraded, потом down;
// внутри статуса — порядок реестра. Эндпоинт, у которого истёк cooldown
// breaker или который в down и не вызывался дольше cooldown, идёт на своё
// место по приоритету: так он получает пробный вызов и после восстановления
// возвращает себе трафик.
func (r *Router) ordered(model string) []Endpoint {
	endpoints := r.Registry.For(model)
	statusRank := map[Status]int{Up: 0, Degraded: 1, Down: 2}
	rank := make(map[string]int, len(endpoints))
	for _, e := range endpoints {
		b := r.BreakerFor(e.ID)
		if b.State() != Closed && b.Ready() {
			rank[e.ID] = 0
			continue
		}
		status := r.Health.Status(e.ID)
		if status == Down && r.Health.Idle(e.ID) >= r.Breaker.Cooldown {
			rank[e.ID] = 0
			continue
		}
		rank[e.ID] = statusRank[status]
	}
	sort.SliceStable(endpoints, func(i, j int) bool {
		return rank[endpoints[i].ID] < rank[endpoints[j].ID]
	})
	return endpoints
}

func add(trace *[]Attempt, a Attempt) {
	if trace != nil {
		*trace = append(*trace, a)
	}
}
