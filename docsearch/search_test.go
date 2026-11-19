package docsearch

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSearchFindsLine(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "note.md"), []byte("каталог моделей\nдругое\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	hits, err := SearchDir(dir, "моделей")
	if err != nil || len(hits) != 1 || hits[0].File != "note.md" {
		t.Fatal(hits, err)
	}
}
