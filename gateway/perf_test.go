package gateway

import (
	"encoding/json"
	"testing"
	"time"
)

func TestEncodePooledMatchesMarshal(t *testing.T) {
	body := map[string]string{"status": "ok"}
	got, err := EncodePooled(body)
	if err != nil {
		t.Fatal(err)
	}
	want, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	var a, b map[string]string
	if err := json.Unmarshal(got, &a); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(want, &b); err != nil {
		t.Fatal(err)
	}
	if a["status"] != b["status"] {
		t.Fatal(a, b)
	}
	tr := ProviderTransport()
	if !tr.ForceAttemptHTTP2 || tr.MaxIdleConnsPerHost != 8 {
		t.Fatal("транспорт")
	}
}

func TestModelDeadlineOverride(t *testing.T) {
	svc := &Service{Deadlines: map[string]ModelDeadline{
		"slow": {Connect: time.Millisecond, FirstToken: 15 * time.Millisecond, Idle: time.Millisecond, Max: 40 * time.Millisecond},
	}}
	got := svc.deadline("slow")
	if got.FirstToken != 15*time.Millisecond || got.Max != 40*time.Millisecond {
		t.Fatal(got)
	}
	if svc.deadline("other").Max != 2*time.Second {
		t.Fatal(svc.deadline("other"))
	}
}

func TestAbuseBlocksKey(t *testing.T) {
	keys := NewKeys(time.Minute)
	keys.Put("secret", Key{Account: "acc", Active: true, OrgActive: true})
	book := &Abuse{}
	book.Report("acc", "key-1", "жалоба", keys, "secret")
	if _, err := keys.Lookup("secret", time.Now()); err == nil {
		t.Fatal("ключ после жалобы ещё работает")
	}
	if len(book.Journal()) != 1 {
		t.Fatal(book.Journal())
	}
}
