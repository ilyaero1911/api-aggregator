package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/ilyaero1911/api-aggregator/internal/mockprovider"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8089"
	}
	bind := os.Getenv("BIND_ADDRESS")
	if bind == "" {
		bind = "127.0.0.1"
	}
	s := &http.Server{Addr: bind + ":" + port, Handler: mockprovider.Handler(), ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(s.ListenAndServe())
}
