package apierr

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestTableMatchesSpec(t *testing.T) {
	want := map[Code]int{
		InvalidRequest: 400, InvalidAPIKey: 401, InsufficientBalance: 402, Forbidden: 403,
		Moderation: 403, ModelNotFound: 404, Timeout: 408, ContextLengthExceeded: 413,
		RateLimit: 429, ProviderError: 502, NoAvailableProvider: 503,
	}
	if len(Table) != len(want) {
		t.Fatalf("в таблице %d кодов, ждали %d", len(Table), len(want))
	}
	for code, status := range want {
		if got := New(code, "").Status; got != status {
			t.Fatalf("%s: %d, ждали %d", code, got, status)
		}
	}
}

func TestRedact(t *testing.T) {
	cases := map[string]string{
		"Authorization: Bearer abc.def-123":            "Authorization: ***",
		"retry with Bearer abc.def-123":                "Bearer ***",
		"jwt eyJhbGciOiJIUzI1NiJ9.e30.sig":             "jwt ***",
		"key sk-or-v1-0123456789abcdef":                "key ***",
		"url?api_key=AIza0123456789abcdefghijklmn&x=1": "url?api_key=***&x=1",
		`{"token": "secret-value"}`:                    `{"token": "***"}`,
	}
	for in, want := range cases {
		if got := Redact(in); !strings.Contains(got, want) || strings.Contains(got, "secret-value") || strings.Contains(got, "abc.def") {
			t.Fatalf("Redact(%q) = %q, ждали %q", in, got, want)
		}
	}
}

func TestAsWrapsForeignErrors(t *testing.T) {
	if As(nil) != nil {
		t.Fatal("nil должен остаться nil")
	}
	own := New(ModelNotFound, "")
	if As(fmt.Errorf("обёртка: %w", own)) != own {
		t.Fatal("потеряли исходную ошибку")
	}
	if got := As(errors.New("panic: internal db password=hunter2")); got.Code != ProviderError || strings.Contains(got.Message, "hunter2") {
		t.Fatalf("%+v", got)
	}
}

func TestFallbackable(t *testing.T) {
	if !New(Moderation, "").Fallbackable() || New(Moderation, "").Retryable() {
		t.Fatal("модерация: другая модель — да, повтор того же — нет")
	}
	if New(InvalidRequest, "").Fallbackable() || New(InsufficientBalance, "").Fallbackable() {
		t.Fatal("ошибки клиента не переходят на другую модель")
	}
}
