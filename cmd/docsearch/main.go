package main

import (
	"bufio"
	"encoding/json"
	"os"

	"github.com/ilyaero1911/api-aggregator/docsearch"
)

// Локальный MCP-срез: одна строка JSON-RPC на stdin, ответ на stdout.
// Подключение к Claude Code или Cursor здесь не проверялось.
func main() {
	root := "docs"
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	out := json.NewEncoder(os.Stdout)
	for in.Scan() {
		var req struct {
			ID     any    `json:"id"`
			Method string `json:"method"`
			Params struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
			} `json:"params"`
		}
		if err := json.Unmarshal(in.Bytes(), &req); err != nil {
			continue
		}
		switch req.Method {
		case "initialize":
			_ = out.Encode(map[string]any{"id": req.ID, "result": map[string]any{"server": "neurogateway-docs"}})
		case "tools/list":
			_ = out.Encode(map[string]any{"id": req.ID, "result": map[string]any{"tools": []any{map[string]string{"name": "search_docs"}}}})
		case "tools/call":
			query, _ := req.Params.Arguments["query"].(string)
			hits, err := docsearch.SearchDir(root, query)
			_ = out.Encode(map[string]any{"id": req.ID, "result": hits, "error": errString(err)})
		default:
			_ = out.Encode(map[string]any{"id": req.ID, "error": "неизвестный метод"})
		}
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
