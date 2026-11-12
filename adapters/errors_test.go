package adapters

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/ilyaero1911/api-aggregator/apierr"
)

type errCase struct {
	name   string
	status int
	body   string
	code   apierr.Code
	want   int
}

func checkCases(t *testing.T, provider string, mapper func(int, []byte) *apierr.Error, cases []errCase) {
	t.Helper()
	for _, c := range cases {
		t.Run(provider+"/"+c.name, func(t *testing.T) {
			e := mapper(c.status, []byte(c.body))
			if e.Code != c.code || e.Status != c.want {
				t.Fatalf("получили %d %s, ждали %d %s", e.Status, e.Code, c.want, c.code)
			}
			if e.Metadata == nil || e.Metadata.Provider != provider {
				t.Fatalf("нет провайдера в metadata: %+v", e.Metadata)
			}
			assertNoSecrets(t, e)
		})
	}
}

func assertNoSecrets(t *testing.T, e *apierr.Error) {
	t.Helper()
	body := string(e.JSON())
	for _, secret := range []string{"sk-live1234567890abcdef", "AIzaSyD0123456789abcdefghijklmnop", "AQVN1234567890abcdefghijklmnopq", "eyJhbGciOiJIUzI1NiJ9.payload.sig"} {
		if strings.Contains(body, secret) {
			t.Fatalf("секрет в ответе клиенту: %s", body)
		}
	}
}

func TestMapGemini(t *testing.T) {
	checkCases(t, "gemini", MapGemini, []errCase{
		{"bad", 400, `{"error":{"code":400,"message":"Invalid value at 'temperature'","status":"INVALID_ARGUMENT"}}`, apierr.InvalidRequest, 400},
		{"context", 400, `{"error":{"code":400,"message":"The input token count exceeds the maximum number of tokens allowed","status":"INVALID_ARGUMENT"}}`, apierr.ContextLengthExceeded, 413},
		{"key", 403, `{"error":{"code":403,"message":"API key AIzaSyD0123456789abcdefghijklmnop not valid","status":"PERMISSION_DENIED"}}`, apierr.ProviderError, 502},
		{"quota", 429, `{"error":{"code":429,"message":"Resource has been exhausted","status":"RESOURCE_EXHAUSTED"}}`, apierr.RateLimit, 429},
		{"deadline", 500, `{"error":{"code":504,"message":"Deadline exceeded","status":"DEADLINE_EXCEEDED"}}`, apierr.Timeout, 408},
		{"down", 503, `{"error":{"code":503,"message":"The model is overloaded","status":"UNAVAILABLE"}}`, apierr.ProviderError, 502},
		{"safety", 400, `{"error":{"code":400,"message":"Request blocked by safety settings","status":"INVALID_ARGUMENT"}}`, apierr.Moderation, 403},
	})
}

func TestMapDeepSeek(t *testing.T) {
	checkCases(t, "deepseek", MapDeepSeek, []errCase{
		{"bad", 400, `{"error":{"message":"Invalid request: temperature","type":"invalid_request_error","code":"invalid_request_error"}}`, apierr.InvalidRequest, 400},
		{"context", 400, `{"error":{"message":"This model's maximum context length is 65536 tokens","type":"invalid_request_error","code":"invalid_request_error"}}`, apierr.ContextLengthExceeded, 413},
		{"key", 401, `{"error":{"message":"Authentication Fails, Your api key: sk-live1234567890abcdef is invalid","type":"authentication_error"}}`, apierr.ProviderError, 502},
		{"our-balance", 402, `{"error":{"message":"Insufficient Balance","type":"unknown_error"}}`, apierr.ProviderError, 502},
		{"params", 422, `{"error":{"message":"Invalid Parameters","type":"invalid_request_error"}}`, apierr.InvalidRequest, 400},
		{"rate", 429, `{"error":{"message":"Rate Limit Reached","type":"rate_limit_error"}}`, apierr.RateLimit, 429},
		{"server", 500, `{"error":{"message":"Server Error","type":"server_error"}}`, apierr.ProviderError, 502},
		{"busy", 503, `{"error":{"message":"Server Overloaded"}}`, apierr.ProviderError, 502},
		{"not-json", 502, `<html>Bad Gateway</html>`, apierr.ProviderError, 502},
	})
}

func TestMapYandex(t *testing.T) {
	checkCases(t, "yandexgpt", MapYandex, []errCase{
		{"bad", 400, `{"error":{"grpcCode":3,"httpCode":400,"message":"Invalid modelUri","httpStatus":"Bad Request"}}`, apierr.InvalidRequest, 400},
		{"context", 400, `{"error":{"grpcCode":3,"httpCode":400,"message":"Number of input tokens must be no more than 8000, got 9500: token limit","httpStatus":"Bad Request"}}`, apierr.ContextLengthExceeded, 413},
		{"key", 401, `{"error":{"grpcCode":16,"httpCode":401,"message":"Unknown api key 'AQVN1234567890abcdefghijklmnopq'"}}`, apierr.ProviderError, 502},
		{"rate", 429, `{"error":{"grpcCode":8,"httpCode":429,"message":"ai.languageModels.requestCount.rate exceeded"}}`, apierr.RateLimit, 429},
		{"status-from-body", 0, `{"error":{"grpcCode":4,"httpCode":504,"message":"Deadline exceeded"}}`, apierr.Timeout, 408},
		{"internal", 500, `{"error":{"grpcCode":13,"httpCode":500,"message":"Internal"}}`, apierr.ProviderError, 502},
	})
}

func TestMapGigaChat(t *testing.T) {
	checkCases(t, "gigachat", MapGigaChat, []errCase{
		{"bad", 400, `{"status":400,"message":"Invalid params: temperature"}`, apierr.InvalidRequest, 400},
		{"token", 401, `{"status":401,"message":"Token has expired: eyJhbGciOiJIUzI1NiJ9.payload.sig"}`, apierr.ProviderError, 502},
		{"long", 413, `{"status":413,"message":"Payload Too Large"}`, apierr.ContextLengthExceeded, 413},
		{"context", 422, `{"status":422,"message":"Tokens limit exceeded"}`, apierr.ContextLengthExceeded, 413},
		{"rate", 429, `{"status":429,"message":"Too Many Requests"}`, apierr.RateLimit, 429},
		{"status-from-body", 0, `{"status":500,"message":"Internal Server Error"}`, apierr.ProviderError, 502},
	})
}

func TestMapTransport(t *testing.T) {
	e := MapTransport("deepseek", fmt.Errorf("read: %w", context.DeadlineExceeded))
	if e.Code != apierr.Timeout || e.Status != 408 || !e.Retryable() {
		t.Fatalf("%+v", e)
	}
	e = MapTransport("gemini", fmt.Errorf("dial tcp: connection refused, key=AIzaSyD0123456789abcdefghijklmnop"))
	if e.Code != apierr.ProviderError || !e.Retryable() {
		t.Fatalf("%+v", e)
	}
	assertNoSecrets(t, e)
}

func TestProviderRateLimitIsRetryableGatewayIsNot(t *testing.T) {
	provider := MapDeepSeek(429, []byte(`{}`))
	if !provider.Retryable() || provider.Metadata.LimitSource != apierr.LimitProvider {
		t.Fatalf("%+v", provider.Metadata)
	}
	own := apierr.New(apierr.RateLimit, "")
	own.Metadata = &apierr.Metadata{LimitSource: apierr.LimitGateway}
	if own.Retryable() {
		t.Fatal("наш лимит повторять на другом эндпоинте нельзя")
	}
}

func TestErrorBodyShape(t *testing.T) {
	e := MapGemini(400, []byte(`{"error":{"message":"The input token count exceeds the maximum number of tokens allowed"}}`))
	var body map[string]map[string]any
	if err := json.Unmarshal(e.JSON(), &body); err != nil {
		t.Fatal(err)
	}
	got := body["error"]
	for _, key := range []string{"message", "type", "code", "param", "metadata"} {
		if _, ok := got[key]; !ok {
			t.Fatalf("нет поля %s: %v", key, got)
		}
	}
	if got["param"] != "messages" || got["code"] != "context_length_exceeded" {
		t.Fatalf("%v", got)
	}
	if long := MapDeepSeek(500, []byte(strings.Repeat("я", 1000))); len(long.Metadata.Raw) > rawLimit {
		t.Fatalf("raw не обрезан: %d", len(long.Metadata.Raw))
	}
}
