package gateway

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

type stored struct {
	body    []byte
	gen     string
	until   time.Time
	pending bool
	stream  bool
}

// Idem — повтор с тем же ключом возвращает тот же ответ и не вызывает провайдера снова.
type Idem struct {
	mu    sync.Mutex
	items map[string]*stored
	TTL   time.Duration
}

func NewIdem(ttl time.Duration) *Idem {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return &Idem{items: map[string]*stored{}, TTL: ttl}
}

func (d *Idem) Begin(account, key string, stream bool, now time.Time) (body []byte, gen string, replay bool, conflict bool) {
	if key == "" {
		return nil, "", false, false
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	slot := d.items[account+"\n"+key]
	if slot != nil && now.Before(slot.until) {
		if slot.pending {
			return nil, "", false, true
		}
		return append([]byte(nil), slot.body...), slot.gen, true, false
	}
	d.items[account+"\n"+key] = &stored{until: now.Add(d.TTL), pending: true, stream: stream}
	return nil, "", false, false
}

func (d *Idem) Abort(account, key string) {
	if key == "" {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	slot := d.items[account+"\n"+key]
	if slot != nil && slot.pending {
		delete(d.items, account+"\n"+key)
	}
}

func (d *Idem) Finish(account, key, gen string, body []byte, now time.Time) {
	if key == "" {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.items[account+"\n"+key] = &stored{body: append([]byte(nil), body...), gen: gen, until: now.Add(d.TTL)}
}

type cacheItem struct {
	body  []byte
	until time.Time
}

// ResponseCache — точное совпадение запроса внутри организации.
type ResponseCache struct {
	mu    sync.Mutex
	items map[string]cacheItem
}

func NewResponseCache() *ResponseCache { return &ResponseCache{items: map[string]cacheItem{}} }

func CacheKey(account, model string, temperature float64, raw string) string {
	sum := sha256.Sum256([]byte(account + "\n" + model + "\n" + raw))
	return hex.EncodeToString(sum[:]) + ":" + account
}

func (c *ResponseCache) Get(key string, now time.Time) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	item, ok := c.items[key]
	if !ok || !now.Before(item.until) {
		return nil, false
	}
	return append([]byte(nil), item.body...), true
}

func (c *ResponseCache) Put(key string, body []byte, ttl time.Duration, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = cacheItem{body: append([]byte(nil), body...), until: now.Add(ttl)}
}

// Generation — оперативный след запроса для GET /v1/generation.
type Generation struct {
	ID        string
	Account   string
	Model     string
	Provider  string
	Endpoint  string
	Tokens    int64
	Cost      int64
	LatencyMS int64
	TTFTMS    int64
	Finish    string
	Status    string
	Attempts  int
	Reason    string
	CacheHit  bool
}

type Generations struct {
	mu    sync.Mutex
	items map[string]Generation
}

func NewGenerations() *Generations { return &Generations{items: map[string]Generation{}} }

func (g *Generations) Put(item Generation) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.items[item.ID] = item
}

func (g *Generations) Get(account, id string) (Generation, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	item, ok := g.items[id]
	if !ok || item.Account != account {
		return Generation{}, false
	}
	return item, true
}
