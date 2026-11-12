// Package fx держит актуальный курс рубля.
//
// Порядок источников: ЦБ РФ (XML_daily) → зеркало cbr-xml-daily.ru (JSON) → последнее значение
// в Redis → последнее значение в Postgres → резервный курс из настроек. Фоновая горутина обновляет
// курс раз в FxRefresh, запросы читают его из памяти без обращения к сети.
package fx

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/text/encoding/charmap"

	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

var Currencies = []string{"USD", "EUR", "CNY"}

type Rate struct {
	Currency  string    `json:"currency"`
	RubMicro  int64     `json:"rub_micro"` // рублей за 1 единицу валюты, в микрорублях
	Date      time.Time `json:"date"`
	Source    string    `json:"source"`
	FetchedAt time.Time `json:"fetched_at"`
	Stale     bool      `json:"stale"` // true, если свежие источники не ответили
}

type Service struct {
	q        *db.Queries
	rdb      *redis.Client
	settings *settings.Store
	client   *http.Client
	cbrURL   string
	backup   string
	log      *slog.Logger

	mu    sync.RWMutex
	rates map[string]Rate
}

func New(q *db.Queries, rdb *redis.Client, st *settings.Store, cbrURL, backupURL string, log *slog.Logger) *Service {
	return &Service{
		q: q, rdb: rdb, settings: st, cbrURL: cbrURL, backup: backupURL, log: log,
		client: &http.Client{Timeout: 10 * time.Second},
		rates:  map[string]Rate{},
	}
}

const redisKey = "fx:rates"

// USD возвращает текущий курс доллара в микрорублях. Никогда не возвращает ноль.
func (s *Service) USD(ctx context.Context) int64 {
	if r, ok := s.Get("USD"); ok && r.RubMicro > 0 {
		return r.RubMicro
	}
	return s.settings.Int(ctx, settings.FxFallbackUSD, 95_000_000)
}

func (s *Service) Get(cur string) (Rate, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.rates[cur]
	return r, ok
}

func (s *Service) All(ctx context.Context) []Rate {
	out := make([]Rate, 0, len(Currencies))
	for _, c := range Currencies {
		if r, ok := s.Get(c); ok {
			out = append(out, r)
		} else if c == "USD" {
			out = append(out, Rate{Currency: "USD", RubMicro: s.USD(ctx), Source: "fallback", Stale: true})
		}
	}
	return out
}

// Run подгружает кэш и обновляет курс по расписанию, пока ctx жив.
func (s *Service) Run(ctx context.Context, every time.Duration) {
	s.warm(ctx)
	s.Refresh(ctx)
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.Refresh(ctx)
		}
	}
}

// warm берёт последний известный курс из Redis, затем из Postgres, чтобы не стартовать с пустым.
func (s *Service) warm(ctx context.Context) {
	if raw, err := s.rdb.Get(ctx, redisKey).Bytes(); err == nil {
		var m map[string]Rate
		if json.Unmarshal(raw, &m) == nil && len(m) > 0 {
			s.set(m)
			return
		}
	}
	m := map[string]Rate{}
	for _, c := range Currencies {
		if r, err := s.q.LatestFxRate(ctx, c); err == nil {
			m[c] = Rate{Currency: c, RubMicro: r.RubMicro, Date: r.OnDate, Source: r.Source, FetchedAt: r.FetchedAt, Stale: true}
		}
	}
	if len(m) > 0 {
		s.set(m)
	}
}

func (s *Service) set(m map[string]Rate) {
	s.mu.Lock()
	for k, v := range m {
		s.rates[k] = v
	}
	s.mu.Unlock()
}

// Refresh пробует источники по очереди и сохраняет результат в память, Redis и Postgres.
func (s *Service) Refresh(ctx context.Context) error {
	m, err := s.fetchCBR(ctx)
	if err != nil {
		s.log.Warn("fx: cbr failed, trying backup", "err", err)
		m, err = s.fetchBackup(ctx)
	}
	if err != nil {
		s.log.Error("fx: all sources failed, keeping last known rate", "err", err)
		s.mu.Lock()
		for k, v := range s.rates {
			v.Stale = true
			s.rates[k] = v
		}
		s.mu.Unlock()
		return err
	}
	s.set(m)
	if raw, err := json.Marshal(m); err == nil {
		s.rdb.Set(ctx, redisKey, raw, 7*24*time.Hour)
	}
	for _, r := range m {
		_ = s.q.UpsertFxRate(ctx, db.UpsertFxRateParams{Currency: r.Currency, OnDate: r.Date, RubMicro: r.RubMicro, Source: r.Source})
	}
	s.log.Info("fx: updated", "usd", float64(m["USD"].RubMicro)/1e6, "source", m["USD"].Source)
	return nil
}

type cbrDoc struct {
	Date   string `xml:"Date,attr"`
	Valute []struct {
		CharCode string `xml:"CharCode"`
		Nominal  string `xml:"Nominal"`
		Value    string `xml:"Value"`
	} `xml:"Valute"`
}

func (s *Service) get(ctx context.Context, url string) ([]byte, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "api-aggregator-fx/1.0")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

func (s *Service) fetchCBR(ctx context.Context) (map[string]Rate, error) {
	body, err := s.get(ctx, s.cbrURL)
	if err != nil {
		return nil, err
	}
	return ParseCBR(body)
}

// ParseCBR разбирает XML_daily.asp (кодировка windows-1251).
func ParseCBR(body []byte) (map[string]Rate, error) {
	dec := xml.NewDecoder(strings.NewReader(string(body)))
	dec.CharsetReader = func(label string, in io.Reader) (io.Reader, error) {
		if strings.EqualFold(label, "windows-1251") {
			return charmap.Windows1251.NewDecoder().Reader(in), nil
		}
		return in, nil
	}
	var doc cbrDoc
	if err := dec.Decode(&doc); err != nil {
		return nil, err
	}
	date, err := time.Parse("02.01.2006", doc.Date)
	if err != nil {
		date = time.Now().UTC().Truncate(24 * time.Hour)
	}
	out := map[string]Rate{}
	for _, v := range doc.Valute {
		if !wanted(v.CharCode) {
			continue
		}
		val, err1 := parseDecimalMicro(v.Value)
		nom, err2 := strconv.ParseInt(strings.TrimSpace(v.Nominal), 10, 64)
		if err1 != nil || err2 != nil || nom <= 0 || val <= 0 {
			continue
		}
		out[v.CharCode] = Rate{Currency: v.CharCode, RubMicro: val / nom, Date: date, Source: "cbr.ru", FetchedAt: time.Now()}
	}
	if _, ok := out["USD"]; !ok {
		return nil, errors.New("cbr: no USD in response")
	}
	return out, nil
}

func (s *Service) fetchBackup(ctx context.Context) (map[string]Rate, error) {
	body, err := s.get(ctx, s.backup)
	if err != nil {
		return nil, err
	}
	return ParseBackup(body)
}

// ParseBackup разбирает daily_json.js с cbr-xml-daily.ru (те же данные ЦБ в JSON).
func ParseBackup(body []byte) (map[string]Rate, error) {
	var doc struct {
		Date   time.Time `json:"Date"`
		Valute map[string]struct {
			Nominal float64 `json:"Nominal"`
			Value   float64 `json:"Value"`
		} `json:"Valute"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, err
	}
	out := map[string]Rate{}
	for code, v := range doc.Valute {
		if !wanted(code) || v.Nominal <= 0 || v.Value <= 0 {
			continue
		}
		out[code] = Rate{Currency: code, RubMicro: int64(v.Value / v.Nominal * 1e6), Date: doc.Date, Source: "cbr-xml-daily.ru", FetchedAt: time.Now()}
	}
	if _, ok := out["USD"]; !ok {
		return nil, errors.New("backup: no USD in response")
	}
	return out, nil
}

func wanted(code string) bool {
	for _, c := range Currencies {
		if c == code {
			return true
		}
	}
	return false
}

// parseDecimalMicro: "95,1234" -> 95123400.
func parseDecimalMicro(s string) (int64, error) {
	s = strings.ReplaceAll(strings.TrimSpace(s), ",", ".")
	intPart, frac, _ := strings.Cut(s, ".")
	i, err := strconv.ParseInt(intPart, 10, 64)
	if err != nil {
		return 0, err
	}
	frac = (frac + "000000")[:6]
	f, err := strconv.ParseInt(frac, 10, 64)
	if err != nil {
		return 0, err
	}
	return i*1_000_000 + f, nil
}
