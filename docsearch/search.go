package docsearch

import (
	"os"
	"path/filepath"
	"strings"
)

type Hit struct {
	File string `json:"file"`
	Line string `json:"line"`
}

func SearchDir(root, query string) ([]Hit, error) {
	query = strings.ToLower(strings.TrimSpace(query))
	var hits []Hit
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		if !strings.HasSuffix(path, ".md") && !strings.HasSuffix(path, ".txt") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, line := range strings.Split(string(raw), "\n") {
			if query == "" || strings.Contains(strings.ToLower(line), query) {
				rel, _ := filepath.Rel(root, path)
				hits = append(hits, Hit{File: rel, Line: strings.TrimSpace(line)})
				if len(hits) == 8 {
					return filepath.SkipAll
				}
			}
		}
		return nil
	})
	return hits, err
}
