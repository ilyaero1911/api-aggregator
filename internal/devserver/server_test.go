package devserver

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLiveness(t *testing.T) {
	r := httptest.NewRecorder()
	Handler("gateway").ServeHTTP(r, httptest.NewRequest("GET", "/healthz", nil))
	if r.Code != 200 || !strings.Contains(r.Body.String(), "foundation") {
		t.Fatalf("%d %s", r.Code, r.Body.String())
	}
}

func TestUnimplementedRoutesAreExplicit(t *testing.T) {
	for _, path := range []string{"/v1/chat/completions", "/api/internal/auth/login", "/readyz"} {
		r := httptest.NewRecorder()
		Handler("gateway").ServeHTTP(r, httptest.NewRequest("POST", path, nil))
		if r.Code != 501 {
			t.Fatalf("%s: %d", path, r.Code)
		}
	}
}
