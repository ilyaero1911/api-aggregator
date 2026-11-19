package gateway

import (
	"bytes"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

var bufPool = sync.Pool{New: func() any { return new(bytes.Buffer) }}

// EncodePooled сериализует JSON буфером из пула.
func EncodePooled(v any) ([]byte, error) {
	buf := bufPool.Get().(*bytes.Buffer)
	buf.Reset()
	err := json.NewEncoder(buf).Encode(v)
	out := append([]byte(nil), buf.Bytes()...)
	bufPool.Put(buf)
	return out, err
}

// ProviderTransport — пул соединений к провайдерам с HTTP/2.
func ProviderTransport() *http.Transport {
	return &http.Transport{
		ForceAttemptHTTP2:   true,
		MaxIdleConns:        32,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     90 * time.Second,
	}
}
