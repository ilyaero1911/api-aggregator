// Package mockprovider implements deterministic local-only provider fixtures.
package mockprovider

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func failure(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": code, "type": "mock_error", "param": nil, "code": code}})
}

func Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","provider":"local-mock"}`))
	})
	handler := func(w http.ResponseWriter, r *http.Request) {
		scenario := r.Header.Get("X-Mock-Scenario")
		if scenario == "rate_limit" {
			w.Header().Set("Retry-After", "1")
			failure(w, 429, "rate_limit")
			return
		}
		if scenario == "server_error" {
			failure(w, 500, "server_error")
			return
		}
		if scenario == "timeout" {
			select {
			case <-r.Context().Done():
				return
			case <-time.After(30 * time.Second):
				failure(w, 504, "timeout")
				return
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			failure(w, 400, "invalid_json")
			return
		}
		var model string
		if err := json.Unmarshal(body["model"], &model); err != nil || model != "mock/chat" {
			failure(w, 404, "unknown_model")
			return
		}
		isResponse := strings.HasSuffix(r.URL.Path, "/responses")
		if isResponse && len(body["input"]) == 0 || !isResponse && len(body["messages"]) == 0 {
			failure(w, 422, "missing_input")
			return
		}
		if !isResponse {
			var messages []json.RawMessage
			if err := json.Unmarshal(body["messages"], &messages); err != nil || len(messages) == 0 {
				failure(w, 422, "missing_input")
				return
			}
		}
		w.Header().Set("X-Request-Id", "mock-request")
		var stream bool
		_ = json.Unmarshal(body["stream"], &stream)
		if stream && !isResponse {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("data: {\"id\":\"mock-gen\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"mock/chat\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"mock response\"},\"finish_reason\":null}]}\n\ndata: {\"id\":\"mock-gen\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"mock/chat\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if isResponse {
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "mock-response", "object": "response", "created_at": 1, "status": "completed", "model": model, "output": []any{map[string]any{"id": "mock-message", "type": "message", "status": "completed", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": "mock response", "annotations": []any{}}}}}, "usage": map[string]int{"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}})
			return
		}
		tokens := 1
		if scenario == "bad_usage" {
			tokens = -1
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "mock-gen", "object": "chat.completion", "created": 1, "model": model, "choices": []any{map[string]any{"index": 0, "message": map[string]string{"role": "assistant", "content": "mock response"}, "finish_reason": "stop"}}, "usage": map[string]int{"prompt_tokens": tokens, "completion_tokens": 1, "total_tokens": 2}})
	}
	mux.HandleFunc("POST /v1/chat/completions", handler)
	mux.HandleFunc("POST /v1/responses", handler)
	return mux
}
