package gateway

import (
	"os"
	"strings"
	"testing"
)

func TestDocsMentionRoutes(t *testing.T) {
	raw, err := os.ReadFile("../docs/api/README.md")
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, path := range []string{"/v1/models", "/v1/chat/completions", "/v1/generation", "/v1/keys", "/v1/key"} {
		if !strings.Contains(text, path) {
			t.Fatal(path)
		}
	}
	for _, name := range []string{"../docs/llms.txt", "../docs/llms-full.txt", "../docs/policy/retention.md", "../docs/policy/dpa.md", "../docs/policy/abuse.md", "../docs/security/threat-model.md"} {
		if _, err := os.Stat(name); err != nil {
			t.Fatal(name, err)
		}
	}
}
