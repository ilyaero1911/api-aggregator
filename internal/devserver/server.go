// Package devserver exposes honest liveness endpoints for the foundation scaffold.
// Provider routing, authentication and billing are separate implementation tasks.
package devserver

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

func Handler(service string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"service": service, "status": "alive", "phase": "foundation"})
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "Foundation scaffold: this operation is not implemented", "type": "not_implemented", "param": nil, "code": "not_implemented"}})
	})
	return mux
}

func Run(service, defaultPort string) {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	address := os.Getenv("BIND_ADDRESS")
	if address == "" {
		address = "127.0.0.1"
	}
	server := &http.Server{Addr: address + ":" + port, Handler: Handler(service), ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(server.ListenAndServe())
}
