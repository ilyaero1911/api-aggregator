package auth

import (
	"strings"
	"testing"
)

func TestAPIKey(t *testing.T) {
	s, p, h := NewAPIKey("inference")
	if !strings.HasPrefix(s, "ng-v1-") || HashToken(s) != h || !strings.Contains(p, "…") {
		t.Fatal(s, p)
	}
	m, _, _ := NewAPIKey("management")
	if !strings.HasPrefix(m, "ng-mgmt-") {
		t.Fatal(m)
	}
}

func TestSealer(t *testing.T) {
	s := NewSealer("x")
	blob := s.Seal("sk-provider")
	if blob == "sk-provider" {
		t.Fatal("not sealed")
	}
	got, err := s.Open(blob)
	if err != nil || got != "sk-provider" {
		t.Fatal(got, err)
	}
}

func TestGoogleState(t *testing.T) {
	g := NewGoogle("id", "sec", "http://x/cb", "secret")
	st := g.State("/dashboard")
	next, err := g.CheckState(st)
	if err != nil || next != "/dashboard" {
		t.Fatal(next, err)
	}
	if _, err := g.CheckState(st + "x"); err == nil {
		t.Fatal("tampered state accepted")
	}
}
