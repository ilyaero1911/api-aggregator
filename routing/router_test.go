package routing

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/ilyaero1911/api-aggregator/adapters"
	"github.com/ilyaero1911/api-aggregator/apierr"
)

// chaosProvider — mock-провайдер с заданной долей ошибок 502.
type chaosProvider struct {
	mu       sync.Mutex
	rng      *rand.Rand
	failRate float64
	calls    map[string]int
	fail     func(e Endpoint) error
}

func newChaos(seed int64, failRate float64) *chaosProvider {
	return &chaosProvider{rng: rand.New(rand.NewSource(seed)), failRate: failRate, calls: map[string]int{}}
}

func (c *chaosProvider) call(_ context.Context, e Endpoint) (adapters.Reply, error) {
	c.mu.Lock()
	c.calls[e.ID]++
	broken := e.ID == "primary" && c.rng.Float64() < c.failRate
	c.mu.Unlock()
	if c.fail != nil {
		if err := c.fail(e); err != nil {
			return adapters.Reply{}, err
		}
	}
	if broken {
		return adapters.Reply{}, adapters.MapDeepSeek(500, []byte(`{"error":{"message":"Server Error"}}`))
	}
	return adapters.Reply{Text: "ok", Usage: adapters.Usage{Output: 10}}, nil
}

func testRouter(clock *fakeClock, endpoints ...Endpoint) *Router {
	r := NewRouter(NewRegistry(endpoints...), clock.Now)
	r.Retry.Rand = func() float64 { return 0.5 }
	r.Sleep = func(_ context.Context, d time.Duration) error {
		clock.Advance(d)
		return nil
	}
	return r
}

var twoEndpoints = []Endpoint{
	{ID: "primary", Model: "deepseek-chat", Provider: "deepseek", Priority: 1},
	{ID: "secondary", Model: "deepseek-chat", Provider: "deepseek-mirror", Priority: 2},
}

func TestChaosHalfErrorsWithSecondEndpointNoClientErrors(t *testing.T) {
	clock := newClock()
	router := testRouter(clock, twoEndpoints...)
	chaos := newChaos(42, 0.5)
	clientErrors := 0
	for i := 0; i < 2000; i++ {
		if _, _, err := router.Model(context.Background(), "deepseek-chat", chaos.call, nil); err != nil {
			clientErrors++
		}
		clock.Advance(100 * time.Millisecond)
	}
	if clientErrors != 0 {
		t.Fatalf("ошибок у клиента: %d", clientErrors)
	}
	// 2000 запросов по 100 мс — 200 с, cooldown 30 с: primary должен получать пробы
	if chaos.calls["primary"] < 7 {
		t.Fatalf("primary не пробуется после cooldown: %v", chaos.calls)
	}
	if chaos.calls["primary"] == 0 || chaos.calls["secondary"] == 0 {
		t.Fatalf("вызовы %v", chaos.calls)
	}
	t.Logf("2000 запросов, 0 ошибок клиента, вызовы %v", chaos.calls)
}

func TestChaosWithoutBreakerStillNoClientErrors(t *testing.T) {
	clock := newClock()
	router := testRouter(clock, twoEndpoints...)
	router.Breaker = BreakerConfig{Window: 1, Cooldown: time.Hour} // breaker не размыкается
	router.Budget = NewRetryBudget(1000, 1)
	chaos := newChaos(7, 0.5)
	for i := 0; i < 1000; i++ {
		if _, e, err := router.Model(context.Background(), "deepseek-chat", chaos.call, nil); err != nil {
			t.Fatalf("запрос %d: %v", i, err)
		} else if e.ID == "" {
			t.Fatal("нет эндпоинта")
		}
	}
}

func TestBreakerOpensAndProbesAfterCooldown(t *testing.T) {
	clock := newClock()
	router := testRouter(clock, twoEndpoints...)
	router.Health = NewHealth(clock.Now, Thresholds{}) // порядок не меняется, проверяем breaker
	chaos := newChaos(1, 1)
	for i := 0; i < 5; i++ {
		router.Model(context.Background(), "deepseek-chat", chaos.call, nil)
	}
	if got := router.BreakerFor("primary").State(); got != Open {
		t.Fatalf("после 5 ошибок подряд %s", got)
	}
	before := chaos.calls["primary"]
	var trace []Attempt
	router.Model(context.Background(), "deepseek-chat", chaos.call, &trace)
	if chaos.calls["primary"] != before || trace[0].Reason != "circuit_open" {
		t.Fatalf("разомкнутый эндпоинт вызван: %+v", trace)
	}

	chaos.failRate = 0
	clock.Advance(DefaultBreaker.Cooldown)
	router.Model(context.Background(), "deepseek-chat", chaos.call, nil)
	if chaos.calls["primary"] != before+1 || router.BreakerFor("primary").State() != Closed {
		t.Fatalf("пробный вызов: %v %s", chaos.calls, router.BreakerFor("primary").State())
	}
}

func TestRecoveredEndpointGetsTrafficBack(t *testing.T) {
	clock := newClock()
	router := testRouter(clock, twoEndpoints...)
	chaos := newChaos(3, 1)
	for i := 0; i < 20; i++ {
		router.Model(context.Background(), "deepseek-chat", chaos.call, nil)
		clock.Advance(time.Second)
	}
	chaos.failRate = 0
	clock.Advance(time.Minute)
	before := chaos.calls["primary"]
	_, e, _ := router.Model(context.Background(), "deepseek-chat", chaos.call, nil)
	if e.ID != "primary" || chaos.calls["primary"] != before+1 {
		t.Fatalf("простаивающий down-эндпоинт не получил пробу: %s %v", e.ID, chaos.calls)
	}
	clock.Advance(5 * time.Minute)
	if _, e, _ = router.Model(context.Background(), "deepseek-chat", chaos.call, nil); e.ID != "primary" {
		t.Fatalf("после выхода ошибок из окна трафик на %s, вызовы %v", e.ID, chaos.calls)
	}
}

func TestHalfOpenLetsOneProbe(t *testing.T) {
	clock := newClock()
	b := NewBreaker(DefaultBreaker, clock.Now)
	for i := 0; i < 5; i++ {
		b.Record(false)
	}
	if b.Allow() {
		t.Fatal("open до cooldown")
	}
	clock.Advance(DefaultBreaker.Cooldown)
	if !b.Allow() || b.Allow() || b.State() != HalfOpen {
		t.Fatal("в half-open пропускается ровно один вызов")
	}
	b.Record(false)
	if b.State() != Open || b.Allow() {
		t.Fatal("неудачная проба снова размыкает")
	}
}

func TestBreakerOpensByRate(t *testing.T) {
	b := NewBreaker(DefaultBreaker, newClock().Now)
	for i := 0; i < 10; i++ {
		b.Record(i%2 == 0)
	}
	if b.State() != Open {
		t.Fatal("50% ошибок из 10 вызовов размыкают breaker")
	}
}

func TestOnlyRetryableErrorsAreRetried(t *testing.T) {
	cases := []struct {
		err   error
		calls int
	}{
		{adapters.MapDeepSeek(500, nil), 3},
		{adapters.MapDeepSeek(429, nil), 3},
		{adapters.MapTransport("deepseek", context.DeadlineExceeded), 3},
		{adapters.MapDeepSeek(400, []byte(`{"error":{"message":"bad"}}`)), 1},
		{adapters.MapDeepSeek(400, []byte(`{"error":{"message":"maximum context length"}}`)), 1},
		{fmt.Errorf("%w: %w", ErrAfterFirstByte, adapters.MapDeepSeek(500, nil)), 1},
	}
	for _, c := range cases {
		t.Run(apierr.As(c.err).Code.String(), func(t *testing.T) {
			clock := newClock()
			router := testRouter(clock, Endpoint{ID: "only", Model: "m", Provider: "p"})
			calls := 0
			_, _, err := router.Model(context.Background(), "m", func(context.Context, Endpoint) (adapters.Reply, error) {
				calls++
				return adapters.Reply{}, c.err
			}, nil)
			if err == nil || calls != c.calls {
				t.Fatalf("вызовов %d, ждали %d, ошибка %v", calls, c.calls, err)
			}
		})
	}
}

func TestBackoffIsExponentialWithJitter(t *testing.T) {
	p := RetryPolicy{Base: 100 * time.Millisecond, Max: time.Second, Rand: func() float64 { return 0.999 }}
	want := []time.Duration{100, 200, 400, 800, 1000, 1000}
	for retry, ms := range want {
		got := p.Backoff(retry)
		ceiling := ms * time.Millisecond
		if got >= ceiling || got < ceiling*99/100 {
			t.Fatalf("retry %d: %s, потолок %s", retry, got, ceiling)
		}
	}
	p.Rand = func() float64 { return 0 }
	if p.Backoff(3) != 0 {
		t.Fatal("полный джиттер может дать ноль")
	}
	var slept []time.Duration
	clock := newClock()
	router := testRouter(clock, Endpoint{ID: "only", Model: "m"})
	router.Retry.Rand = func() float64 { return 0.5 }
	router.Sleep = func(_ context.Context, d time.Duration) error { slept = append(slept, d); return nil }
	router.Model(context.Background(), "m", func(context.Context, Endpoint) (adapters.Reply, error) {
		return adapters.Reply{}, adapters.MapDeepSeek(503, nil)
	}, nil)
	if len(slept) != 2 || slept[0] != 50*time.Millisecond || slept[1] != 100*time.Millisecond {
		t.Fatalf("задержки %v", slept)
	}
}

func TestRetryBudgetStopsRetryStorm(t *testing.T) {
	clock := newClock()
	router := testRouter(clock, Endpoint{ID: "only", Model: "m"})
	router.Breaker = BreakerConfig{Window: 1, Cooldown: time.Hour} // проверяем именно бюджет
	calls := 0
	for i := 0; i < 100; i++ {
		router.Model(context.Background(), "m", func(context.Context, Endpoint) (adapters.Reply, error) {
			calls++
			return adapters.Reply{}, adapters.MapDeepSeek(500, nil)
		}, nil)
	}
	// без бюджета было бы 300 вызовов; с бюджетом ретраи кончаются почти сразу
	if calls > 110 {
		t.Fatalf("вызовов %d при 100 запросах", calls)
	}
	b := NewRetryBudget(10, 0.1)
	for i := 0; i < 6; i++ {
		b.Failure()
	}
	if b.Allow() {
		t.Fatal("4 токена из 10 — ретраи запрещены")
	}
	for i := 0; i < 20; i++ {
		b.Success()
	}
	if !b.Allow() {
		t.Fatal("успехи возвращают бюджет")
	}
}

func TestNoEndpointsAndCancelledContext(t *testing.T) {
	clock := newClock()
	router := testRouter(clock, Endpoint{ID: "only", Model: "m"})
	if _, _, err := router.Model(context.Background(), "нет", nil, nil); apierr.As(err).Code != apierr.ModelNotFound {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	_, _, err := router.Model(ctx, "m", func(ctx context.Context, _ Endpoint) (adapters.Reply, error) {
		calls++
		cancel()
		return adapters.Reply{}, ctx.Err()
	}, nil)
	if calls != 1 || apierr.As(err).Code != apierr.Timeout {
		t.Fatalf("%d %v", calls, err)
	}
	if router.BreakerFor("only").State() != Closed {
		t.Fatal("отмена клиентом не ломает эндпоинт")
	}
}
