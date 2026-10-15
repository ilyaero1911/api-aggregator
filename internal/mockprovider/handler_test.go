package mockprovider

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScenarios(t *testing.T) {
	for _, c := range []struct {
		path, body, scenario string
		status               int
		contains             string
	}{
		{"/v1/chat/completions", `{"model":"mock/chat","messages":[{"role":"user","content":"hello"}]}`, "", 200, "mock response"},
		{"/v1/responses", `{"model":"mock/chat","input":"hello"}`, "", 200, "output_text"},
		{"/v1/chat/completions", `{"model":"mock/chat","messages":[{"role":"user","content":"hello"}],"stream":true}`, "", 200, "[DONE]"},
		{"/v1/chat/completions", `{`, "", 400, "invalid_json"},
		{"/v1/chat/completions", `{"model":"unknown"}`, "", 404, "unknown_model"},
		{"/v1/chat/completions", `{"model":"mock/chat"}`, "", 422, "missing_input"},
		{"/v1/chat/completions", `{}`, "rate_limit", 429, "rate_limit"},
		{"/v1/chat/completions", `{}`, "server_error", 500, "server_error"},
		{"/v1/chat/completions", `{"model":"mock/chat","messages":[{"role":"user","content":"hello"}]}`, "bad_usage", 200, "-1"},
		{"/v1/chat/completions", `{"model":"mock/chat","messages":[]}`, "", 422, "missing_input"},
	} {
		t.Run(c.scenario+c.body, func(t *testing.T) {
			r := httptest.NewRequest("POST", c.path, strings.NewReader(c.body))
			r.Header.Set("X-Mock-Scenario", c.scenario)
			w := httptest.NewRecorder()
			Handler().ServeHTTP(w, r)
			if w.Code != c.status || !strings.Contains(w.Body.String(), c.contains) {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	Handler().ServeHTTP(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
}

func TestCanceledTimeout(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := httptest.NewRequest("POST", "/v1/chat/completions", nil).WithContext(ctx)
	r.Header.Set("X-Mock-Scenario", "timeout")
	Handler().ServeHTTP(httptest.NewRecorder(), r)
}
