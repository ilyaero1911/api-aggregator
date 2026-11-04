package adapters

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
)

// Usage — токены, которые биллинг берёт из ответа провайдера.
type Usage struct {
	Input, Output, CacheRead, CacheWrite, Reasoning int64
}

// Reply — канонический ответ адаптера.
type Reply struct {
	Text, Finish, Reasoning string
	Usage                   Usage
	InRussia                bool
}

func ParseGemini(raw []byte) (Reply, error) {
	var body struct {
		Candidates []struct {
			FinishReason string `json:"finishReason"`
			Content      struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount        int64 `json:"promptTokenCount"`
			CandidatesTokenCount    int64 `json:"candidatesTokenCount"`
			CachedContentTokenCount int64 `json:"cachedContentTokenCount"`
			ThoughtsTokenCount      int64 `json:"thoughtsTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return Reply{}, err
	}
	reply := Reply{Usage: Usage{
		Input:     body.UsageMetadata.PromptTokenCount,
		Output:    body.UsageMetadata.CandidatesTokenCount,
		CacheRead: body.UsageMetadata.CachedContentTokenCount,
		Reasoning: body.UsageMetadata.ThoughtsTokenCount,
	}}
	if len(body.Candidates) > 0 {
		reply.Finish = body.Candidates[0].FinishReason
		if strings.EqualFold(reply.Finish, "SAFETY") {
			reply.Finish = "content_filter"
		}
		if len(body.Candidates[0].Content.Parts) > 0 {
			reply.Text = body.Candidates[0].Content.Parts[0].Text
		}
	}
	return reply, nil
}

func ParseDeepSeek(raw []byte) (Reply, error) {
	var body struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens          int64 `json:"prompt_tokens"`
			CompletionTokens      int64 `json:"completion_tokens"`
			PromptCacheHitTokens  int64 `json:"prompt_cache_hit_tokens"`
			PromptCacheMissTokens int64 `json:"prompt_cache_miss_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return Reply{}, err
	}
	input := body.Usage.PromptTokens
	if body.Usage.PromptCacheHitTokens > 0 || body.Usage.PromptCacheMissTokens > 0 {
		input = body.Usage.PromptCacheMissTokens
	}
	reply := Reply{Usage: Usage{
		Input:     input,
		Output:    body.Usage.CompletionTokens,
		CacheRead: body.Usage.PromptCacheHitTokens,
	}}
	if len(body.Choices) > 0 {
		reply.Text = body.Choices[0].Message.Content
		reply.Reasoning = body.Choices[0].Message.ReasoningContent
		reply.Finish = body.Choices[0].FinishReason
	}
	return reply, nil
}

func ParseYandex(raw []byte) (Reply, error) {
	var body struct {
		Result struct {
			Alternatives []struct {
				Message struct {
					Text string `json:"text"`
				} `json:"message"`
			} `json:"alternatives"`
			Usage struct {
				InputTextTokens  string `json:"inputTextTokens"`
				CompletionTokens string `json:"completionTokens"`
			} `json:"usage"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return Reply{}, err
	}
	in, err := parseInt(body.Result.Usage.InputTextTokens)
	if err != nil {
		return Reply{}, err
	}
	out, err := parseInt(body.Result.Usage.CompletionTokens)
	if err != nil {
		return Reply{}, err
	}
	reply := Reply{Usage: Usage{Input: in, Output: out}, InRussia: true}
	if len(body.Result.Alternatives) > 0 {
		reply.Text = body.Result.Alternatives[0].Message.Text
		reply.Finish = "stop"
	}
	return reply, nil
}

func ParseGigaChat(raw []byte) (Reply, error) {
	var body struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return Reply{}, err
	}
	reply := Reply{InRussia: true, Usage: Usage{
		Input: body.Usage.PromptTokens, Output: body.Usage.CompletionTokens,
	}}
	if len(body.Choices) > 0 {
		reply.Text = body.Choices[0].Message.Content
		reply.Finish = body.Choices[0].FinishReason
	}
	return reply, nil
}

func parseInt(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	var n int64
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, errors.New("не число")
		}
		n = n*10 + int64(r-'0')
	}
	return n, nil
}

// Token — токен доступа, который обновляется до истечения.
type Token struct {
	Value string
	Until time.Time
}

func EnsureToken(now time.Time, current Token, fetch func() (Token, error)) (Token, error) {
	if current.Value != "" && now.Before(current.Until) {
		return current, nil
	}
	return fetch()
}

// Offer — строка каталога провайдера.
type Offer struct {
	ID         string
	Price      int64
	Deprecated bool
}

// Delta — что изменилось между двумя снимками каталога.
type Delta struct {
	Added, Removed, Repriced, Deprecated []string
}

func DiffOffers(prev, next []Offer) Delta {
	old := map[string]Offer{}
	for _, item := range prev {
		old[item.ID] = item
	}
	seen := map[string]bool{}
	var delta Delta
	for _, item := range next {
		seen[item.ID] = true
		was, ok := old[item.ID]
		if !ok {
			delta.Added = append(delta.Added, item.ID)
			continue
		}
		if was.Price != item.Price {
			delta.Repriced = append(delta.Repriced, item.ID)
		}
		if !was.Deprecated && item.Deprecated {
			delta.Deprecated = append(delta.Deprecated, item.ID)
		}
	}
	for id := range old {
		if !seen[id] {
			delta.Removed = append(delta.Removed, id)
		}
	}
	return delta
}

func PriceDrift(ourCost, providerPrice int64) bool {
	return ourCost != providerPrice
}

func SpeechPrice(chars, perChar int64) (int64, error) {
	if chars < 0 || perChar < 0 {
		return 0, errors.New("отрицательная цена")
	}
	return chars * perChar, nil
}

func TranscribePrice(seconds, perSecond int64) (int64, error) {
	if seconds < 0 || perSecond < 0 {
		return 0, errors.New("отрицательная цена")
	}
	return seconds * perSecond, nil
}

func ValidSpeech(model, voice, input string) error {
	if model == "" || voice == "" || input == "" {
		return errors.New("в запросе речи нет модели, голоса или текста")
	}
	return nil
}

// Count оценивает число токенов по словам и знакам. Это не ответ провайдера.
func Count(text string) int {
	if text == "" {
		return 0
	}
	n := 0
	inWord := false
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			if !inWord {
				n++
				inWord = true
			}
			continue
		}
		inWord = false
		if !unicode.IsSpace(r) {
			n++
		}
	}
	return n
}

// Piece — кусок документа.
type Piece struct {
	ID   int
	Text string
}

func Split(text string, size, overlap int) []Piece {
	runes := []rune(text)
	if size <= 0 || len(runes) == 0 {
		return nil
	}
	if overlap < 0 || overlap >= size {
		overlap = 0
	}
	step := size - overlap
	var out []Piece
	for start := 0; start < len(runes); start += step {
		end := start + size
		if end > len(runes) {
			end = len(runes)
		}
		out = append(out, Piece{ID: len(out) + 1, Text: string(runes[start:end])})
		if end == len(runes) {
			break
		}
	}
	return out
}

// Citation — цитата, которая буквально есть в куске.
type Citation struct {
	ID    int
	Quote string
}

func Find(pieces []Piece, query string, k int) []Citation {
	words := strings.Fields(strings.ToLower(query))
	type scored struct {
		piece Piece
		score int
	}
	var ranked []scored
	for _, piece := range pieces {
		hay := strings.ToLower(piece.Text)
		score := 0
		for _, word := range words {
			if word != "" && strings.Contains(hay, word) {
				score++
			}
		}
		if score > 0 {
			ranked = append(ranked, scored{piece, score})
		}
	}
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	if k > len(ranked) {
		k = len(ranked)
	}
	out := make([]Citation, 0, k)
	for i := 0; i < k; i++ {
		out = append(out, Citation{ID: ranked[i].piece.ID, Quote: ranked[i].piece.Text})
	}
	return out
}
