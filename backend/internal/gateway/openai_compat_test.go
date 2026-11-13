package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func fakeOpenAI(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			w.WriteHeader(401)
			fmt.Fprint(w, `{"error":{"message":"bad key"}}`)
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["model"] == "broken" {
			w.WriteHeader(503)
			fmt.Fprint(w, `{"error":{"message":"overloaded"}}`)
			return
		}
		if body["stream"] == true {
			w.Header().Set("Content-Type", "text/event-stream")
			for _, part := range []string{"При", "вет"} {
				fmt.Fprintf(w, "data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", part)
			}
			fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n")
			fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2}}\n\n")
			fmt.Fprint(w, "data: [DONE]\n\n")
			return
		}
		fmt.Fprint(w, `{"choices":[{"message":{"content":"Привет"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":1}}}`)
	}))
}

func TestOpenAICompat(t *testing.T) {
	srv := fakeOpenAI(t)
	defer srv.Close()
	up := &OpenAICompat{Name: "test", BaseURL: srv.URL, Key: "sk-test"}
	req := ChatRequest{Messages: []Message{TextMessage("user", "hi")}}

	res, err := up.Chat(context.Background(), "m", req, nil)
	if err != nil || res.Content != "Привет" || res.Usage.PromptTokens != 5 || res.Usage.CachedTokens != 1 {
		t.Fatalf("plain: %+v %v", res, err)
	}

	var got strings.Builder
	res, err = up.Chat(context.Background(), "m", req, func(s string) error { got.WriteString(s); return nil })
	if err != nil || got.String() != "Привет" || res.Usage.CompletionTokens != 2 || res.FinishReason != "stop" {
		t.Fatalf("stream: %+v %q %v", res, got.String(), err)
	}

	_, err = up.Chat(context.Background(), "broken", req, nil)
	var ue *UpstreamError
	if err == nil || !asUp(err, &ue) || !ue.Retryable {
		t.Fatalf("503 must be retryable: %v", err)
	}

	bad := &OpenAICompat{Name: "test", BaseURL: srv.URL, Key: "wrong"}
	if _, err := bad.Chat(context.Background(), "m", req, nil); err == nil {
		t.Fatal("bad key accepted")
	}
}

func asUp(err error, target **UpstreamError) bool {
	u, ok := err.(*UpstreamError)
	if ok {
		*target = u
	}
	return ok
}
