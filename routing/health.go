package routing

import (
	"sort"
	"sync"
	"time"
)

// Status — состояние эндпоинта для маршрутизации, метрик и статус-страницы.
type Status string

const (
	Up       Status = "up"
	Degraded Status = "degraded"
	Down     Status = "down"
)

// Окна health-трекинга.
const (
	Window1m  = time.Minute
	Window5m  = 5 * time.Minute
	Window30m = 30 * time.Minute
)

// Outcome — итог одного вызова эндпоинта.
type Outcome struct {
	OK      bool
	Latency time.Duration
	TTFT    time.Duration // время до первого токена, 0 — без стрима
	Tokens  int64         // выходные токены
}

// Thresholds — пороги статусов.
type Thresholds struct {
	DownConsecutive int           // подряд ошибок для down
	DownRate        float64       // доля ошибок за минуту для down
	DegradedRate    float64       // доля ошибок за 5 минут для degraded
	SlowP50         time.Duration // p50 задержки за 5 минут для degraded
	MinRequests     int           // меньше запросов в окне — долю ошибок не считаем
}

var DefaultThresholds = Thresholds{
	DownConsecutive: 3,
	DownRate:        0.5,
	DegradedRate:    0.1,
	SlowP50:         10 * time.Second,
	MinRequests:     5,
}

// Stats — агрегаты одного окна.
type Stats struct {
	Requests     int64
	Errors       int64
	ErrorRate    float64
	P50Latency   time.Duration
	AvgTTFT      time.Duration
	TokensPerSec float64
}

// Bucket — секунда наблюдений. Экспортируется, чтобы поды могли обмениваться
// снимками через общее хранилище (Redis) и сливать их через Merge.
type Bucket struct {
	Second    int64
	Requests  int64
	Errors    int64
	Latencies []time.Duration
	TTFTSum   time.Duration
	TTFTCount int64
	Tokens    int64
	TokenTime time.Duration
}

type track struct {
	buckets     map[int64]*Bucket
	consecutive int
}

// Health — health-трекинг эндпоинтов пода со скользящими окнами 1/5/30 минут.
type Health struct {
	mu     sync.Mutex
	now    func() time.Time
	limits Thresholds
	tracks map[string]*track
}

func NewHealth(now func() time.Time, limits Thresholds) *Health {
	if now == nil {
		now = time.Now
	}
	return &Health{now: now, limits: limits, tracks: map[string]*track{}}
}

// Observe записывает итог вызова эндпоинта.
func (h *Health) Observe(endpoint string, o Outcome) {
	h.mu.Lock()
	defer h.mu.Unlock()
	t := h.track(endpoint)
	sec := h.now().Unix()
	b := t.buckets[sec]
	if b == nil {
		b = &Bucket{Second: sec}
		t.buckets[sec] = b
	}
	b.Requests++
	if o.OK {
		t.consecutive = 0
		b.Latencies = append(b.Latencies, o.Latency)
		if o.TTFT > 0 {
			b.TTFTSum += o.TTFT
			b.TTFTCount++
		}
		if o.Tokens > 0 && o.Latency > o.TTFT {
			b.Tokens += o.Tokens
			b.TokenTime += o.Latency - o.TTFT
		}
	} else {
		t.consecutive++
		b.Errors++
	}
	h.prune(t, sec)
}

// Stats — агрегаты эндпоинта за окно.
func (h *Health) Stats(endpoint string, window time.Duration) Stats {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.stats(h.track(endpoint), window)
}

// Status — up, degraded или down.
func (h *Health) Status(endpoint string) Status {
	h.mu.Lock()
	defer h.mu.Unlock()
	t := h.track(endpoint)
	l := h.limits
	if l.DownConsecutive > 0 && t.consecutive >= l.DownConsecutive {
		return Down
	}
	minute := h.stats(t, Window1m)
	if minute.Requests >= int64(l.MinRequests) && minute.ErrorRate >= l.DownRate {
		return Down
	}
	five := h.stats(t, Window5m)
	if five.Requests >= int64(l.MinRequests) && five.ErrorRate >= l.DegradedRate {
		return Degraded
	}
	if l.SlowP50 > 0 && five.P50Latency > l.SlowP50 {
		return Degraded
	}
	return Up
}

// Statuses — снимок статусов для метрик, статус-страницы и каталога моделей.
func (h *Health) Statuses() map[string]Status {
	h.mu.Lock()
	ids := make([]string, 0, len(h.tracks))
	for id := range h.tracks {
		ids = append(ids, id)
	}
	h.mu.Unlock()
	out := make(map[string]Status, len(ids))
	for _, id := range ids {
		out[id] = h.Status(id)
	}
	return out
}

// Snapshot — секунды эндпоинта за 30 минут для публикации другим подам.
func (h *Health) Snapshot(endpoint string) []Bucket {
	h.mu.Lock()
	defer h.mu.Unlock()
	t := h.track(endpoint)
	out := make([]Bucket, 0, len(t.buckets))
	for _, b := range t.buckets {
		c := *b
		c.Latencies = append([]time.Duration(nil), b.Latencies...)
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Second < out[j].Second })
	return out
}

// Merge добавляет снимок другого пода к локальным данным.
func (h *Health) Merge(endpoint string, remote []Bucket) {
	h.mu.Lock()
	defer h.mu.Unlock()
	t := h.track(endpoint)
	for _, r := range remote {
		b := t.buckets[r.Second]
		if b == nil {
			b = &Bucket{Second: r.Second}
			t.buckets[r.Second] = b
		}
		b.Requests += r.Requests
		b.Errors += r.Errors
		b.Latencies = append(b.Latencies, r.Latencies...)
		b.TTFTSum += r.TTFTSum
		b.TTFTCount += r.TTFTCount
		b.Tokens += r.Tokens
		b.TokenTime += r.TokenTime
	}
	h.prune(t, h.now().Unix())
}

func (h *Health) track(endpoint string) *track {
	t := h.tracks[endpoint]
	if t == nil {
		t = &track{buckets: map[int64]*Bucket{}}
		h.tracks[endpoint] = t
	}
	return t
}

func (h *Health) prune(t *track, now int64) {
	edge := now - int64(Window30m/time.Second)
	for sec := range t.buckets {
		if sec <= edge {
			delete(t.buckets, sec)
		}
	}
}

func (h *Health) stats(t *track, window time.Duration) Stats {
	edge := h.now().Unix() - int64(window/time.Second)
	var s Stats
	var latencies []time.Duration
	var ttftSum, tokenTime time.Duration
	var ttftCount, tokens int64
	for sec, b := range t.buckets {
		if sec <= edge {
			continue
		}
		s.Requests += b.Requests
		s.Errors += b.Errors
		latencies = append(latencies, b.Latencies...)
		ttftSum += b.TTFTSum
		ttftCount += b.TTFTCount
		tokens += b.Tokens
		tokenTime += b.TokenTime
	}
	if s.Requests > 0 {
		s.ErrorRate = float64(s.Errors) / float64(s.Requests)
	}
	if len(latencies) > 0 {
		sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
		s.P50Latency = latencies[(len(latencies)-1)/2]
	}
	if ttftCount > 0 {
		s.AvgTTFT = ttftSum / time.Duration(ttftCount)
	}
	if tokenTime > 0 {
		s.TokensPerSec = float64(tokens) / tokenTime.Seconds()
	}
	return s
}
