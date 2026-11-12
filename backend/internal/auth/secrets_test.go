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

func TestState(t *testing.T) {
	st := SignState("secret", "/dashboard")
	next, err := CheckState("secret", st)
	if err != nil || next != "/dashboard" {
		t.Fatal(next, err)
	}
	if _, err := CheckState("secret", st+"x"); err == nil {
		t.Fatal("tampered state accepted")
	}
}

func TestPasswordProblem(t *testing.T) {
	cases := map[string]string{"short": "too_short", "alllowercase1": "weak", "Qwerty123x": "common", "Ivanov2024x": "", "Пароль2024Ок": "common", "СложнаяФраза7": ""}
	for p, want := range cases {
		if got := PasswordProblem(p, "user@example.com"); got != want {
			t.Errorf("%s: got %q want %q", p, got, want)
		}
	}
	if PasswordProblem("Maksim1234", "maksim@mail.ru") != "contains_email" {
		t.Error("email in password")
	}
}
