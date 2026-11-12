package routing

import (
	"testing"
	"time"
)

// mockProvider отвечает успешно, пока не сломан.
type mockProvider struct{ broken bool }

func (m *mockProvider) call() Outcome {
	if m.broken {
		return Outcome{OK: false, Latency: 30 * time.Second}
	}
	return Outcome{OK: true, Latency: 800 * time.Millisecond, TTFT: 200 * time.Millisecond, Tokens: 120}
}

func TestMockFailureTurnsDownWithin30Seconds(t *testing.T) {
	clock := newClock()
	health := NewHealth(clock.Now, DefaultThresholds)
	mock := &mockProvider{}
	for i := 0; i < 120; i++ {
		health.Observe("deepseek-1", mock.call())
		clock.Advance(500 * time.Millisecond)
	}
	if got := health.Status("deepseek-1"); got != Up {
		t.Fatalf("до отказа %s", got)
	}

	mock.broken = true
	start := clock.Now()
	for health.Status("deepseek-1") != Down {
		if clock.Now().Sub(start) >= 30*time.Second {
			t.Fatal("не перешёл в down за 30 секунд")
		}
		health.Observe("deepseek-1", mock.call())
		clock.Advance(time.Second)
	}
	if took := clock.Now().Sub(start); took >= 30*time.Second {
		t.Fatalf("down через %s", took)
	} else {
		t.Logf("down через %s после отказа", took)
	}
}

func TestIntermittentErrorsAreDownByRate(t *testing.T) {
	clock := newClock()
	health := NewHealth(clock.Now, DefaultThresholds)
	for i := 0; i < 20; i++ {
		// чередуем: ни разу не три ошибки подряд, но доля 50%
		health.Observe("gemini-1", Outcome{OK: i%2 == 0, Latency: time.Second})
		clock.Advance(time.Second)
	}
	if got := health.Status("gemini-1"); got != Down {
		t.Fatalf("при 50%% ошибок за минуту %s", got)
	}
}

func TestDegradedByErrorsAndLatency(t *testing.T) {
	clock := newClock()
	health := NewHealth(clock.Now, DefaultThresholds)
	for i := 0; i < 40; i++ {
		health.Observe("yandex-1", Outcome{OK: i%5 != 0, Latency: time.Second})
		clock.Advance(5 * time.Second)
	}
	if got := health.Status("yandex-1"); got != Degraded {
		t.Fatalf("при 20%% ошибок за 5 минут %s", got)
	}

	slow := NewHealth(clock.Now, DefaultThresholds)
	for i := 0; i < 10; i++ {
		slow.Observe("giga-1", Outcome{OK: true, Latency: 15 * time.Second})
	}
	if got := slow.Status("giga-1"); got != Degraded {
		t.Fatalf("при p50 15 с %s", got)
	}
}

func TestRecoveryAfterSuccess(t *testing.T) {
	clock := newClock()
	health := NewHealth(clock.Now, DefaultThresholds)
	for i := 0; i < 3; i++ {
		health.Observe("e", Outcome{OK: false})
	}
	if health.Status("e") != Down {
		t.Fatal("три ошибки подряд — down")
	}
	clock.Advance(6 * time.Minute)
	health.Observe("e", Outcome{OK: true, Latency: time.Second})
	if got := health.Status("e"); got != Up {
		t.Fatalf("после успеха и выхода ошибок из окна %s", got)
	}
}

func TestWindowsAndMetrics(t *testing.T) {
	clock := newClock()
	health := NewHealth(clock.Now, DefaultThresholds)
	health.Observe("e", Outcome{OK: false})
	clock.Advance(10 * time.Minute)
	for _, ms := range []int{100, 300, 200} {
		health.Observe("e", Outcome{OK: true, Latency: time.Duration(ms) * time.Millisecond, TTFT: 50 * time.Millisecond, Tokens: 25})
	}
	one := health.Stats("e", Window1m)
	if one.Requests != 3 || one.Errors != 0 || one.P50Latency != 200*time.Millisecond || one.AvgTTFT != 50*time.Millisecond {
		t.Fatalf("%+v", one)
	}
	// 75 токенов за (50+250+150) мс
	if one.TokensPerSec < 166 || one.TokensPerSec > 167 {
		t.Fatalf("throughput %.1f", one.TokensPerSec)
	}
	thirty := health.Stats("e", Window30m)
	if thirty.Requests != 4 || thirty.Errors != 1 || thirty.ErrorRate != 0.25 {
		t.Fatalf("%+v", thirty)
	}
	clock.Advance(31 * time.Minute)
	health.Observe("e", Outcome{OK: true, Latency: time.Second})
	if got := health.Stats("e", Window30m); got.Requests != 1 || len(health.Snapshot("e")) != 1 {
		t.Fatalf("старые секунды не удалены: %+v", got)
	}
}

func TestMergeFromOtherPod(t *testing.T) {
	clock := newClock()
	podA := NewHealth(clock.Now, DefaultThresholds)
	podB := NewHealth(clock.Now, DefaultThresholds)
	for i := 0; i < 4; i++ {
		podA.Observe("e", Outcome{OK: true, Latency: time.Second})
		podB.Observe("e", Outcome{OK: i == 0, Latency: time.Second})
		clock.Advance(time.Second)
	}
	if podA.Status("e") != Up {
		t.Fatal("локально под A здоров")
	}
	podA.Merge("e", podB.Snapshot("e"))
	stats := podA.Stats("e", Window1m)
	if stats.Requests != 8 || stats.Errors != 3 {
		t.Fatalf("%+v", stats)
	}
	if got := podA.Statuses()["e"]; got != Degraded {
		t.Fatalf("с учётом пода B %s", got)
	}
}

func TestRegistryOrderAndManualDisable(t *testing.T) {
	r := NewRegistry(
		Endpoint{ID: "c", Model: "m", Priority: 2},
		Endpoint{ID: "a", Model: "m", Priority: 1, Weight: 1},
		Endpoint{ID: "b", Model: "m", Priority: 1, Weight: 5},
		Endpoint{ID: "off", Model: "m", Priority: 0, Disabled: true},
	)
	got := r.For("m")
	if len(got) != 3 || got[0].ID != "b" || got[1].ID != "a" || got[2].ID != "c" {
		t.Fatalf("%+v", got)
	}
	if len(r.For("нет")) != 0 {
		t.Fatal("чужая модель")
	}
}
