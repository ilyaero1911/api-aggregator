package routing

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/ilyaero1911/api-aggregator/adapters"
	"github.com/ilyaero1911/api-aggregator/apierr"
	"github.com/ilyaero1911/api-aggregator/billing"
)

// world — mock-провайдеры: на каждый эндпоинт свой ответ.
type world struct {
	errs  map[string]error // эндпоинт → ошибка; нет записи — успех
	calls []string
}

func (w *world) call(_ context.Context, e Endpoint) (adapters.Reply, error) {
	w.calls = append(w.calls, e.ID)
	if err := w.errs[e.ID]; err != nil {
		return adapters.Reply{}, err
	}
	return adapters.Reply{Text: "ответ " + e.Model, Usage: adapters.Usage{Input: 100, Output: 50}}, nil
}

var catalog = []Endpoint{
	{ID: "ds-main", Model: "deepseek-chat", Provider: "deepseek", Priority: 1},
	{ID: "ds-mirror", Model: "deepseek-chat", Provider: "deepseek-mirror", Priority: 2},
	{ID: "giga", Model: "gigachat-pro", Provider: "gigachat", Priority: 1},
	{ID: "yandex", Model: "yandexgpt", Provider: "yandexgpt", Priority: 1},
	{ID: "off", Model: "retired", Provider: "x", Disabled: true},
}

func fallbackRouter(t *testing.T) (*Router, *bytes.Buffer) {
	t.Helper()
	clock := newClock()
	r := testRouter(clock, catalog...)
	var logs bytes.Buffer
	r.Logger = slog.New(slog.NewJSONHandler(&logs, nil))
	return r, &logs
}

func lastLog(t *testing.T, logs *bytes.Buffer) map[string]any {
	t.Helper()
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	var entry map[string]any
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &entry); err != nil {
		t.Fatal(err)
	}
	return entry
}

var (
	serverError = adapters.MapDeepSeek(500, []byte(`{"error":{"message":"Server Error"}}`))
	moderation  = adapters.MapGigaChat(400, []byte(`{"status":400,"message":"Request blocked by moderation"}`))
	tooLong     = adapters.MapDeepSeek(400, []byte(`{"error":{"message":"This model's maximum context length is 65536 tokens"}}`))
	badRequest  = adapters.MapDeepSeek(400, []byte(`{"error":{"message":"temperature must be <= 2"}}`))
)

func TestFallbackToSecondEndpointOfSameModel(t *testing.T) {
	r, logs := fallbackRouter(t)
	w := &world{errs: map[string]error{"ds-main": serverError}}
	res, err := r.Complete(context.Background(), Request{Model: "deepseek-chat", Models: []string{"gigachat-pro"}}, w.call)
	if err != nil || res.Model != "deepseek-chat" || res.Endpoint.ID != "ds-mirror" {
		t.Fatalf("%+v %v", res, err)
	}
	entry := lastLog(t, logs)
	if entry["chain"] != "deepseek-chat@ds-main → deepseek-chat@ds-mirror" || !strings.Contains(entry["fallback_reasons"].(string), "provider_error") {
		t.Fatalf("лог: %v", entry)
	}
}

func TestFallbackToNextModelWhenAllEndpointsFail(t *testing.T) {
	r, logs := fallbackRouter(t)
	w := &world{errs: map[string]error{"ds-main": serverError, "ds-mirror": adapters.MapTransport("deepseek", context.DeadlineExceeded)}}
	res, err := r.Complete(context.Background(), Request{Model: "deepseek-chat", Models: []string{"gigachat-pro", "yandexgpt"}}, w.call)
	if err != nil || res.Model != "gigachat-pro" || res.Reply.Text != "ответ gigachat-pro" {
		t.Fatalf("%+v %v", res, err)
	}
	entry := lastLog(t, logs)
	if entry["model_requested"] != "deepseek-chat" || entry["model_used"] != "gigachat-pro" {
		t.Fatalf("лог: %v", entry)
	}
	reasons := entry["fallback_reasons"].(string)
	if !strings.Contains(reasons, "provider_error") || !strings.Contains(reasons, "timeout") {
		t.Fatalf("причины: %s", reasons)
	}
}

func TestFallbackOnModerationAndContextLength(t *testing.T) {
	for name, cause := range map[string]*apierr.Error{"moderation": moderation, "context": tooLong} {
		t.Run(name, func(t *testing.T) {
			r, logs := fallbackRouter(t)
			w := &world{errs: map[string]error{"ds-main": cause}}
			res, err := r.Complete(context.Background(), Request{Model: "deepseek-chat", Models: []string{"yandexgpt"}}, w.call)
			if err != nil || res.Model != "yandexgpt" {
				t.Fatalf("%+v %v", res, err)
			}
			// модерация и контекст — свойство запроса, вторую реплику той же модели не дёргаем
			if strings.Join(w.calls, ",") != "ds-main,yandex" {
				t.Fatalf("вызовы %v", w.calls)
			}
			if !strings.Contains(lastLog(t, logs)["fallback_reasons"].(string), string(cause.Code)) {
				t.Fatal("причина не записана в лог")
			}
		})
	}
}

func TestClientErrorDoesNotFallback(t *testing.T) {
	r, logs := fallbackRouter(t)
	w := &world{errs: map[string]error{"ds-main": badRequest}}
	_, err := r.Complete(context.Background(), Request{Model: "deepseek-chat", Models: []string{"gigachat-pro"}}, w.call)
	if apierr.As(err).Code != apierr.InvalidRequest || len(w.calls) != 1 {
		t.Fatalf("%v вызовы %v", err, w.calls)
	}
	if entry := lastLog(t, logs); entry["level"] != "WARN" || entry["error"] != "invalid_request" {
		t.Fatalf("лог: %v", entry)
	}
}

func TestAllModelsFailReturnsLastError(t *testing.T) {
	r, _ := fallbackRouter(t)
	w := &world{errs: map[string]error{"ds-main": serverError, "ds-mirror": serverError, "giga": moderation}}
	res, err := r.Complete(context.Background(), Request{Model: "deepseek-chat", Models: []string{"gigachat-pro"}}, w.call)
	if apierr.As(err).Code != apierr.Moderation || res.Model != "" {
		t.Fatalf("%+v %v", res, err)
	}
	if len(res.Attempts) < 3 {
		t.Fatalf("цепочка %+v", res.Attempts)
	}
}

func TestDisabledModelFallsThrough(t *testing.T) {
	r, _ := fallbackRouter(t)
	w := &world{}
	res, err := r.Complete(context.Background(), Request{Model: "retired", Models: []string{"yandexgpt"}}, w.call)
	if err != nil || res.Model != "yandexgpt" || res.Attempts[0].Reason != "all_disabled" {
		t.Fatalf("%+v %v", res, err)
	}
}

func TestRequestValidation(t *testing.T) {
	r, _ := fallbackRouter(t)
	w := &world{}
	cases := []struct {
		q     Request
		code  apierr.Code
		param string
	}{
		{Request{}, apierr.InvalidRequest, "model"},
		{Request{Model: "нет"}, apierr.ModelNotFound, "model"},
		{Request{Model: "deepseek-chat", Models: []string{"нет"}}, apierr.ModelNotFound, "models"},
		{Request{Model: "deepseek-chat", Models: []string{"a", "b", "c", "d", "e", "f"}}, apierr.InvalidRequest, "models"},
	}
	for _, c := range cases {
		_, err := r.Complete(context.Background(), c.q, w.call)
		e := apierr.As(err)
		if e.Code != c.code || e.Param == nil || *e.Param != c.param {
			t.Fatalf("%+v: %v", c.q, err)
		}
	}
	if len(w.calls) != 0 {
		t.Fatal("при ошибке валидации провайдер не вызывается")
	}
	if got := (Request{Model: "a", Models: []string{"a", "b", "a"}}).Chain(); strings.Join(got, ",") != "a,b" {
		t.Fatal(got)
	}
}

func TestBillingChargesActualModel(t *testing.T) {
	r, _ := fallbackRouter(t)
	w := &world{errs: map[string]error{"ds-main": serverError, "ds-mirror": serverError}}
	res, err := r.Complete(context.Background(), Request{Model: "deepseek-chat", Models: []string{"gigachat-pro"}}, w.call)
	if err != nil {
		t.Fatal(err)
	}
	prices := billing.Catalog{
		Versions: []billing.Version{{ID: "v1", From: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Currency: "RUB",
			Rates: billing.Rates{Input: 10_000, Output: 20_000}}},
		ModelBps: map[string]int64{"deepseek-chat": 0, "gigachat-pro": 5_000},
	}
	usage := billing.Usage{Input: res.Reply.Usage.Input, Output: res.Reply.Usage.Output}
	at := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	actual, err := prices.Quote(at, res.Endpoint.Provider, res.Model, "acc", usage)
	if err != nil {
		t.Fatal(err)
	}
	requested, _ := prices.Quote(at, "deepseek", "deepseek-chat", "acc", usage)
	if actual.Amount <= requested.Amount {
		t.Fatalf("списали по запрошенной модели: %d, ждали наценку gigachat-pro > %d", actual.Amount, requested.Amount)
	}
	if res.Endpoint.Provider != "gigachat" {
		t.Fatal(res.Endpoint)
	}
}
