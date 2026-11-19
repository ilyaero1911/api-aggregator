package gateway

import (
	"strings"

	"github.com/ilyaero1911/api-aggregator/routing"
)

// Prefs — параметры provider из запроса.
type Prefs struct {
	Order             []string `json:"order"`
	Only              []string `json:"only"`
	Ignore            []string `json:"ignore"`
	AllowFallbacks    *bool    `json:"allow_fallbacks"`
	Sort              string   `json:"sort"`
	MaxPrice          int64    `json:"max_price"`
	DataCollection    string   `json:"data_collection"`
	RequireParameters []string `json:"require_parameters"`
	Quantizations     []string `json:"quantizations"`
}

type Need struct {
	Tools   bool
	JSON    bool
	Image   bool
	Tokens  int
	Prefs   Prefs
	Variant string
}

func SplitVariant(model string) (base, variant string) {
	for _, suffix := range []string{":free", ":nitro", ":floor", ":online", ":thinking"} {
		if strings.HasSuffix(model, suffix) {
			return strings.TrimSuffix(model, suffix), strings.TrimPrefix(suffix, ":")
		}
	}
	return model, ""
}

func Filter(list []routing.Endpoint, need Need) []routing.Endpoint {
	var out []routing.Endpoint
	for _, e := range list {
		if e.Disabled {
			continue
		}
		if need.Tools && !e.Tools {
			continue
		}
		if need.JSON && !e.JSON {
			continue
		}
		if need.Image && !e.Image {
			continue
		}
		if need.Tokens > 0 && e.Context > 0 && need.Tokens > e.Context {
			continue
		}
		if need.Variant == "free" && !e.Free {
			continue
		}
		if need.Variant == "online" && !e.Online {
			continue
		}
		if need.Variant == "thinking" && !e.Thinking {
			continue
		}
		if need.Prefs.MaxPrice > 0 && e.PromptPrice > need.Prefs.MaxPrice {
			continue
		}
		if need.Prefs.DataCollection == "deny" && e.DataPolicy == "allow" {
			continue
		}
		if len(need.Prefs.Only) > 0 && !contains(need.Prefs.Only, e.Provider) {
			continue
		}
		if contains(need.Prefs.Ignore, e.Provider) {
			continue
		}
		if len(need.Prefs.Quantizations) > 0 && !contains(need.Prefs.Quantizations, e.Quantization) {
			continue
		}
		if missingParam(e.Params, need.Prefs.RequireParameters) {
			continue
		}
		out = append(out, e)
	}
	sortEndpoints(out, need)
	return out
}

func missingParam(have, need []string) bool {
	for _, n := range need {
		if !contains(have, n) {
			return true
		}
	}
	return false
}

func sortEndpoints(list []routing.Endpoint, need Need) {
	order := map[string]int{}
	for i, p := range need.Prefs.Order {
		order[p] = i
	}
	for i := 1; i < len(list); i++ {
		j := i
		for j > 0 && lessEndpoint(list[j], list[j-1], need.Variant, need.Prefs.Sort, order) {
			list[j], list[j-1] = list[j-1], list[j]
			j--
		}
	}
}

func lessEndpoint(a, b routing.Endpoint, variant, mode string, order map[string]int) bool {
	if len(order) > 0 {
		ai, aok := order[a.Provider]
		bi, bok := order[b.Provider]
		if aok || bok {
			if !aok {
				return false
			}
			if !bok {
				return true
			}
			if ai != bi {
				return ai < bi
			}
		}
	}
	switch {
	case variant == "nitro" || mode == "throughput":
		return a.Throughput > b.Throughput
	case variant == "floor" || mode == "price":
		return a.PromptPrice < b.PromptPrice
	case mode == "latency":
		return a.Priority < b.Priority
	default:
		if a.Priority != b.Priority {
			return a.Priority < b.Priority
		}
		return a.Weight > b.Weight
	}
}

// AutoChoice — грубый выбор модели по виду запроса. Это не офлайн-оценка качества.
func AutoChoice(text string, allow []string, cards map[string]ModelCard) string {
	kind := "simple"
	lower := strings.ToLower(text)
	switch {
	case strings.Contains(text, "```") || strings.Contains(lower, "func ") || strings.Contains(lower, "код"):
		kind = "code"
	case strings.Contains(lower, "докажи") || strings.Contains(lower, "рассужд"):
		kind = "reason"
	}
	best := ""
	bestPrice := int64(1 << 62)
	for _, id := range allow {
		card := cards[id]
		if card.ID == "" {
			continue
		}
		if kind == "code" && !contains(card.Parameters, "code") && !strings.Contains(id, "code") {
			continue
		}
		if kind == "reason" && !contains(card.Parameters, "reasoning") && !strings.Contains(id, "reason") {
			continue
		}
		price := card.Pricing["prompt"]
		if price < bestPrice {
			best, bestPrice = id, price
		}
	}
	if best == "" && len(allow) > 0 {
		return allow[0]
	}
	return best
}
