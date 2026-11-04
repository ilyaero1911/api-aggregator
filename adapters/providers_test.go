package adapters

import (
	"strings"
	"testing"
	"time"
)

func TestGeminiDeepSeekYandexGiga(t *testing.T) {
	gemini, err := ParseGemini([]byte(`{"candidates":[{"content":{"parts":[{"text":"ок"}]},"finishReason":"SAFETY"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":4,"cachedContentTokenCount":1,"thoughtsTokenCount":2}}`))
	if err != nil || gemini.Finish != "content_filter" || gemini.Usage.Reasoning != 2 || gemini.Text != "ок" {
		t.Fatalf("%+v %v", gemini, err)
	}
	deep, err := ParseDeepSeek([]byte(`{"choices":[{"message":{"content":"a","reasoning_content":"b"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"prompt_cache_hit_tokens":7,"prompt_cache_miss_tokens":3}}`))
	if err != nil || deep.Usage.CacheRead != 7 || deep.Usage.Input != 3 || deep.Reasoning != "b" {
		t.Fatalf("%+v %v", deep, err)
	}
	yandex, err := ParseYandex([]byte(`{"result":{"alternatives":[{"message":{"text":"привет"}}],"usage":{"inputTextTokens":"8","completionTokens":"2"}}}`))
	if err != nil || !yandex.InRussia || yandex.Usage.Input != 8 || yandex.Text != "привет" {
		t.Fatalf("%+v %v", yandex, err)
	}
	giga, err := ParseGigaChat([]byte(`{"choices":[{"message":{"content":"да"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`))
	if err != nil || !giga.InRussia || giga.Usage.Output != 1 {
		t.Fatalf("%+v %v", giga, err)
	}
	now := time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)
	current := Token{Value: "old", Until: now.Add(time.Hour)}
	kept, err := EnsureToken(now, current, func() (Token, error) {
		t.Fatal("ранний токен не надо обновлять")
		return Token{}, nil
	})
	if err != nil || kept.Value != "old" {
		t.Fatal(kept, err)
	}
	fresh, err := EnsureToken(now.Add(2*time.Hour), current, func() (Token, error) {
		return Token{Value: "new", Until: now.Add(3 * time.Hour)}, nil
	})
	if err != nil || fresh.Value != "new" {
		t.Fatal(fresh, err)
	}
}

func TestCatalogAudioCountAndCite(t *testing.T) {
	delta := DiffOffers(
		[]Offer{{ID: "a", Price: 1}, {ID: "b", Price: 2}, {ID: "c", Price: 3}},
		[]Offer{{ID: "a", Price: 9}, {ID: "c", Price: 3, Deprecated: true}, {ID: "d", Price: 4}},
	)
	if len(delta.Added) != 1 || delta.Added[0] != "d" || len(delta.Repriced) != 1 || len(delta.Deprecated) != 1 || len(delta.Removed) != 1 {
		t.Fatalf("%+v", delta)
	}
	if !PriceDrift(10, 12) || PriceDrift(10, 10) {
		t.Fatal("расхождение цены")
	}
	speech, err := SpeechPrice(20, 3)
	if err != nil || speech != 60 {
		t.Fatal(speech, err)
	}
	seconds, err := TranscribePrice(5, 4)
	if err != nil || seconds != 20 {
		t.Fatal(seconds, err)
	}
	if err := ValidSpeech("tts", "alloy", "привет"); err != nil {
		t.Fatal(err)
	}
	if err := ValidSpeech("", "alloy", "привет"); err == nil {
		t.Fatal("пустая модель")
	}
	if Count("") != 0 || Count("раз два") != 2 {
		t.Fatal(Count("раз два"))
	}
	start := time.Now()
	sample := strings.Repeat("токен ", 100_000)
	n := Count(sample)
	if time.Since(start) > 50*time.Millisecond {
		t.Fatal("подсчёт 100 тысяч слов дольше 50 мс")
	}
	if n != 100_000 {
		t.Fatal(n)
	}
	pieces := Split("яблоко "+strings.Repeat("а", 30)+" груша", 10, 0)
	if len(pieces) < 2 {
		t.Fatal(pieces)
	}
	found := Find(pieces, "яблоко", 1)
	if len(found) != 1 || !strings.Contains(found[0].Quote, "яблоко") || !strings.Contains(pieces[found[0].ID-1].Text, found[0].Quote) {
		t.Fatalf("%+v", found)
	}
}
