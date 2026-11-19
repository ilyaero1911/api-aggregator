package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ilyaero1911/api-aggregator/adapters"
	"github.com/ilyaero1911/api-aggregator/apierr"
	"github.com/ilyaero1911/api-aggregator/billing"
	"github.com/ilyaero1911/api-aggregator/routing"
)

func testService(mock Mock) (*Service, *Keys, *billing.Ledger) {
	keys := NewKeys(time.Minute)
	keys.Put("secret", Key{Account: "acc", Active: true, OrgActive: true})
	ledger := billing.NewLedger()
	if err := ledger.Deposit("acc", 10*billing.MinorPerRuble); err != nil {
		panic(err)
	}
	routes := routing.NewRegistry(routing.Endpoint{
		ID: "ep1", Model: "gpt", Provider: "mock", Priority: 1, Weight: 1, Status: "up",
	}, routing.Endpoint{
		ID: "ep2", Model: "gpt", Provider: "backup", Priority: 2, Weight: 1, Status: "up",
	})
	router := routing.NewRouter(routes, time.Now)
	router.Retry.MaxAttempts = 1
	router.Sleep = func(context.Context, time.Duration) error { return nil }
	return &Service{
		Keys: keys, Routes: routes, Router: router, Ledger: ledger,
		Hold: billing.Kopeck, CallTimeout: 40 * time.Millisecond, Mock: mock, BodyLimit: 256,
	}, keys, ledger
}

func call(s *Service, method, path, key, gen, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	if gen != "" {
		req.Header.Set("X-Generation-Id", gen)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

func TestHealthConfigAndAuth(t *testing.T) {
	cfg, err := ConfigFrom(func(k string) string {
		if k == "GATEWAY_BODY_LIMIT" {
			return "0"
		}
		return ""
	})
	if err == nil || cfg.Addr != "" {
		t.Fatal("нулевой лимит должен отклоняться")
	}
	cfg, err = ConfigFrom(func(string) string { return "" })
	if err != nil || cfg.Addr != ":8080" || cfg.BodyLimit != 1<<20 {
		t.Fatalf("%+v %v", cfg, err)
	}
	svc, keys, _ := testService(nil)
	health := call(svc, http.MethodGet, "/healthz", "", "", "")
	if health.Code != 200 || health.Header().Get("X-Request-Id") == "" {
		t.Fatal(health.Code, health.Header().Get("X-Request-Id"))
	}
	if !strings.Contains(call(svc, http.MethodGet, "/metrics", "", "", "").Body.String(), "gateway_requests_total") {
		t.Fatal("нет метрики")
	}
	ready := call(svc, http.MethodGet, "/readyz", "", "", "")
	if ready.Code != 200 {
		t.Fatal(ready.Code)
	}
	denied := call(svc, http.MethodPost, "/v1/chat/completions", "", "", `{"model":"gpt","messages":[{"role":"user","content":"a"}]}`)
	if denied.Code != 401 || !strings.Contains(denied.Body.String(), "invalid_api_key") {
		t.Fatal(denied.Code, denied.Body.String())
	}
	keys.Revoke("secret")
	revoked := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "", `{"model":"gpt","messages":[{"role":"user","content":"a"}]}`)
	if revoked.Code != 401 {
		t.Fatal(revoked.Code, revoked.Body.String())
	}
	alt := NewKeys(time.Minute)
	alt.Put("k", Key{Account: "acc", Active: true, OrgActive: true})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("x-api-key", "k")
	if _, err := alt.Lookup("k", time.Now()); err != nil {
		t.Fatal(err)
	}
	if alt.Reads() != 1 {
		t.Fatal(alt.Reads())
	}
	if _, err := alt.Lookup("k", time.Now()); err != nil || alt.Reads() != 1 {
		t.Fatal("кэш не сработал", alt.Reads(), err)
	}
}

func TestChatCompletionsAndEndpoints(t *testing.T) {
	calls := 0
	svc, _, ledger := testService(func(ctx context.Context, e routing.Endpoint, model string) (adapters.Reply, error) {
		calls++
		return adapters.Reply{Text: "ок", Usage: adapters.Usage{Input: 3, Output: 2, CacheRead: 1, Reasoning: 4}}, nil
	})
	body := `{"model":"gpt","messages":[{"role":"user","content":"привет"}]}`
	first := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "gen-1", body)
	if first.Code != 200 {
		t.Fatal(first.Code, first.Body.String())
	}
	var parsed map[string]any
	if err := json.Unmarshal(first.Body.Bytes(), &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed["id"] != "gen-1" || parsed["provider"] != "mock" {
		t.Fatal(parsed)
	}
	second := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "gen-1", body)
	if second.Code != 200 || calls != 1 {
		t.Fatal(second.Code, calls)
	}
	if ledger.Revenue() != billing.Kopeck {
		t.Fatal(ledger.Revenue())
	}
	empty := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "gen-2", `{"model":"gpt"}`)
	if empty.Code != 400 {
		t.Fatal(empty.Code, empty.Body.String())
	}
	missing := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "gen-3", `{"model":"nope","messages":[{"role":"user","content":"a"}]}`)
	if missing.Code != 404 {
		t.Fatal(missing.Code, missing.Body.String())
	}
	svc.Mock = func(context.Context, routing.Endpoint, string) (adapters.Reply, error) {
		return adapters.Reply{}, apierr.New(apierr.ProviderError, "upstream")
	}
	failed := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "gen-4", body)
	if failed.Code != 502 {
		t.Fatal(failed.Code, failed.Body.String())
	}
	svc.Mock = func(ctx context.Context, _ routing.Endpoint, _ string) (adapters.Reply, error) {
		<-ctx.Done()
		return adapters.Reply{}, ctx.Err()
	}
	svc.Router.Sleep = func(ctx context.Context, _ time.Duration) error { return ctx.Err() }
	slow := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "gen-5", body)
	if slow.Code != 408 {
		t.Fatal(slow.Code, slow.Body.String())
	}
	if !ledger.Balanced() {
		t.Fatal("проводки разъехались")
	}
	list := call(svc, http.MethodGet, "/v1/models/gpt/endpoints", "secret", "", "")
	if list.Code != 200 || !strings.Contains(list.Body.String(), "backup") {
		t.Fatal(list.Code, list.Body.String())
	}
	if !svc.Routes.Disable("gpt", "ep2") {
		t.Fatal("не выключился")
	}
	if len(svc.Routes.For("gpt")) != 1 || len(svc.Routes.All("gpt")) != 2 {
		t.Fatal(len(svc.Routes.For("gpt")), len(svc.Routes.All("gpt")))
	}
	big := call(svc, http.MethodPost, "/v1/chat/completions", "secret", "gen-6", strings.Repeat("x", 400))
	if big.Code != 400 {
		t.Fatal(big.Code, io.LimitReader(big.Body, 80))
	}
}
