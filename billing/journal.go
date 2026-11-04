package billing

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/csv"
	"io"
	"sort"
	"strings"
	"time"
)

// Event — факт запроса, который проходит конвейер учёта.
type Event struct {
	GenerationID, Account, Tenant, Org, Key string
	Model, Provider, Endpoint, Status       string
	Finish, ErrorCode                       string
	Usage                                   Usage
	LatencyMs, TTFTMs                       int64
	Stream, Cancelled, CacheHit             bool
	At                                      time.Time
	Referer, Title                          string
	IPHash                                  string
	Content                                 string
	OptIn                                   bool
	RetainDays                              int
	AppPublic                               bool
	Fail                                    bool
}

func (e Event) app() string {
	if e.Title != "" {
		return e.Title
	}
	return e.Referer
}

func (e Event) tokens() int64 {
	return e.Usage.Input + e.Usage.Output + e.Usage.CacheRead + e.Usage.CacheWrite + e.Usage.Reasoning
}

// Record — строка журнала. Текст запроса хранится только при явном согласии.
type Record struct {
	GenerationID, Org, Key, Model, Provider, Status string
	Finish, ErrorCode, App, Referer, Title          string
	Amount, Tokens, LatencyMs, TTFTMs               int64
	At                                              time.Time
	Stream, Cancelled, CacheHit, PublicApp          bool
	Content                                         string
	sealed                                          string
	OptIn                                           bool
	RetainDays                                      int
	Deleted                                         bool
}

// Filter — отбор журнала.
type Filter struct {
	From, To                     time.Time
	Key, Model, Provider, Status string
	MinCost                      int64
}

// Journal — журнал и агрегаты организации.
type Journal struct {
	rows []Record
	keys map[string]string
}

func (j *Journal) SetKey(org, key string) {
	if j.keys == nil {
		j.keys = map[string]string{}
	}
	j.keys[org] = key
}

func seal(key, plain string) (string, error) {
	sum := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	out := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

func openSeal(key, blob string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(blob)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", ErrState
	}
	nonce, cipherText := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, cipherText, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func (j *Journal) Add(e Event, amount int64, status string) {
	if status == "" {
		status = e.Status
	}
	rec := Record{
		GenerationID: e.GenerationID, Org: e.Org, Key: e.Key, Model: e.Model, Provider: e.Provider,
		Status: status, Finish: e.Finish, ErrorCode: e.ErrorCode,
		App: e.app(), Referer: e.Referer, Title: e.Title,
		Amount: amount, Tokens: e.tokens(), LatencyMs: e.LatencyMs, TTFTMs: e.TTFTMs,
		At: e.At, Stream: e.Stream, Cancelled: e.Cancelled, CacheHit: e.CacheHit,
		PublicApp: e.AppPublic, OptIn: e.OptIn, RetainDays: e.RetainDays,
	}
	if e.OptIn && e.Content != "" {
		if blob, err := seal(j.keys[e.Org], e.Content); err == nil {
			rec.sealed = blob
		}
	}
	j.rows = append(j.rows, rec)
}

func (j *Journal) DeleteContent(org, generation string) {
	for i := range j.rows {
		if j.rows[i].Org == org && j.rows[i].GenerationID == generation {
			j.rows[i].sealed = ""
			j.rows[i].Deleted = true
		}
	}
}

func (r Record) match(f Filter) bool {
	if !f.From.IsZero() && r.At.Before(f.From) {
		return false
	}
	if !f.To.IsZero() && !r.At.Before(f.To) {
		return false
	}
	if f.Key != "" && r.Key != f.Key {
		return false
	}
	if f.Model != "" && r.Model != f.Model {
		return false
	}
	if f.Provider != "" && r.Provider != f.Provider {
		return false
	}
	if f.Status != "" && r.Status != f.Status {
		return false
	}
	if r.Amount < f.MinCost {
		return false
	}
	return true
}

func (j *Journal) visible(r Record, org string, now time.Time) Record {
	out := r
	out.sealed = ""
	out.Content = ""
	if !r.OptIn || r.Deleted || r.sealed == "" || j.keys[org] == "" {
		return out
	}
	if r.RetainDays > 0 && !now.Before(r.At.AddDate(0, 0, r.RetainDays)) {
		return out
	}
	text, err := openSeal(j.keys[org], r.sealed)
	if err != nil {
		return out
	}
	out.Content = text
	return out
}

// List возвращает страницу журнала только своей организации.
func (j *Journal) List(org string, f Filter, offset, limit int, now time.Time) []Record {
	var matched []Record
	for _, row := range j.rows {
		if row.Org != org || !row.match(f) {
			continue
		}
		matched = append(matched, j.visible(row, org, now))
	}
	if offset > len(matched) {
		return nil
	}
	matched = matched[offset:]
	if limit > 0 && limit < len(matched) {
		matched = matched[:limit]
	}
	return matched
}

// Bucket — агрегат за час или день.
type Bucket struct {
	Start            time.Time
	Requests, Errors int64
	Tokens, Cost     int64
	LatencySum       int64
}

func (b Bucket) AvgLatency() int64 {
	if b.Requests == 0 {
		return 0
	}
	return b.LatencySum / b.Requests
}

func (j *Journal) Aggregate(org string, from, to time.Time, step time.Duration) []Bucket {
	if step <= 0 {
		step = 24 * time.Hour
	}
	index := map[int64]*Bucket{}
	var order []int64
	for _, row := range j.rows {
		if row.Org != org || row.At.Before(from) || !row.At.Before(to) {
			continue
		}
		start := from.Add(row.At.Sub(from) / step * step)
		key := start.UnixNano()
		item := index[key]
		if item == nil {
			item = &Bucket{Start: start}
			index[key] = item
			order = append(order, key)
		}
		item.Requests++
		if row.Status != "ok" {
			item.Errors++
		}
		item.Tokens += row.Tokens
		item.Cost += row.Amount
		item.LatencySum += row.LatencyMs
	}
	sort.Slice(order, func(i, k int) bool { return order[i] < order[k] })
	out := make([]Bucket, 0, len(order))
	for _, key := range order {
		out = append(out, *index[key])
	}
	return out
}

func (j *Journal) CSV(org string, f Filter, now time.Time) string {
	var buf strings.Builder
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"generation_id", "model", "provider", "status", "amount", "tokens", "latency_ms"})
	for _, row := range j.List(org, f, 0, 0, now) {
		_ = w.Write([]string{
			row.GenerationID, row.Model, row.Provider, row.Status,
			signed(row.Amount), signed(row.Tokens), signed(row.LatencyMs),
		})
	}
	w.Flush()
	return buf.String()
}

func signed(v int64) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// ModelStat — публичная сводка модели.
type ModelStat struct {
	Model        string
	Requests, OK int64
	P50, Tokens  int64
	ShareBps     int64
}

func (j *Journal) ModelStats(from, to time.Time) []ModelStat {
	type acc struct {
		ok, tokens int64
		latency    []int64
	}
	by := map[string]*acc{}
	var names []string
	totalTokens := int64(0)
	for _, row := range j.rows {
		if row.At.Before(from) || !row.At.Before(to) {
			continue
		}
		item := by[row.Model]
		if item == nil {
			item = &acc{}
			by[row.Model] = item
			names = append(names, row.Model)
		}
		item.latency = append(item.latency, row.LatencyMs)
		item.tokens += row.Tokens
		totalTokens += row.Tokens
		if row.Status == "ok" {
			item.ok++
		}
	}
	sort.Strings(names)
	out := make([]ModelStat, 0, len(names))
	for _, name := range names {
		item := by[name]
		share := int64(0)
		if totalTokens > 0 {
			share = item.tokens * Bps / totalTokens
		}
		out = append(out, ModelStat{
			Model: name, Requests: int64(len(item.latency)), OK: item.ok,
			P50: percentile(item.latency, 50), Tokens: item.tokens, ShareBps: share,
		})
	}
	return out
}

func percentile(values []int64, p int) int64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]int64(nil), values...)
	sort.Slice(sorted, func(i, k int) bool { return sorted[i] < sorted[k] })
	idx := (len(sorted) - 1) * p / 100
	return sorted[idx]
}

// AppRank — публичный рейтинг приложений, которые сами это разрешили.
type AppRank struct {
	App    string
	Tokens int64
}

func (j *Journal) AppRank() []AppRank {
	totals := map[string]int64{}
	for _, row := range j.rows {
		if !row.PublicApp || row.App == "" {
			continue
		}
		totals[row.App] += row.Tokens
	}
	out := make([]AppRank, 0, len(totals))
	for app, tokens := range totals {
		out = append(out, AppRank{App: app, Tokens: tokens})
	}
	sort.Slice(out, func(i, k int) bool {
		if out[i].Tokens == out[k].Tokens {
			return out[i].App < out[k].App
		}
		return out[i].Tokens > out[k].Tokens
	})
	return out
}

// Deliver повторяет отправку, пока приёмник не примет тело.
func Deliver(send func(string) error, body string, tries int) error {
	var err error
	for i := 0; i < tries; i++ {
		err = send(body)
		if err == nil {
			return nil
		}
	}
	return err
}
