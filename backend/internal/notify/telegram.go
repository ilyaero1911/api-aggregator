// Package notify отправляет уведомления администраторам в Telegram.
//
// Токен бота берётся из TELEGRAM_BOT_TOKEN. Куда слать — из TELEGRAM_CHAT_ID и настройки tg_chat_ids
// (через запятую, редактируется в админке). Без токена уведомления просто не отправляются.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
)

type Telegram struct {
	token    string
	envChats []string
	settings *settings.Store
	client   *http.Client
	log      *slog.Logger
}

func NewTelegram(token, envChats string, st *settings.Store, log *slog.Logger) *Telegram {
	return &Telegram{token: strings.TrimSpace(token), envChats: split(envChats), settings: st, client: &http.Client{Timeout: 10 * time.Second}, log: log}
}

func split(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func (t *Telegram) Enabled() bool { return t.token != "" }

func (t *Telegram) chats(ctx context.Context) []string {
	var fromSettings string
	_ = json.Unmarshal(t.settings.All(ctx)["tg_chat_ids"], &fromSettings)
	seen := map[string]bool{}
	var out []string
	for _, c := range append(append([]string{}, t.envChats...), split(fromSettings)...) {
		if !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	return out
}

// Esc экранирует текст для parse_mode=HTML.
func Esc(s string) string { return html.EscapeString(s) }

// Send отправляет сообщение во все чаты в фоне, с двумя повторами.
func (t *Telegram) Send(ctx context.Context, htmlText string) {
	if !t.Enabled() {
		return
	}
	chats := t.chats(ctx)
	go func() {
		for _, chat := range chats {
			for attempt := 0; attempt < 3; attempt++ {
				if err := t.send(chat, htmlText); err == nil {
					break
				} else if attempt == 2 {
					t.log.Warn("telegram: send failed", "chat", chat, "err", err)
				}
				time.Sleep(time.Duration(attempt+1) * time.Second)
			}
		}
	}()
}

// SendNow отправляет синхронно и возвращает ошибку — для кнопки «проверить» в админке.
func (t *Telegram) SendNow(ctx context.Context, htmlText string) error {
	if !t.Enabled() {
		return fmt.Errorf("TELEGRAM_BOT_TOKEN is not set")
	}
	chats := t.chats(ctx)
	if len(chats) == 0 {
		return fmt.Errorf("no chat ids configured")
	}
	for _, c := range chats {
		if err := t.send(c, htmlText); err != nil {
			return fmt.Errorf("chat %s: %w", c, err)
		}
	}
	return nil
}

func (t *Telegram) send(chat, text string) error {
	body, _ := json.Marshal(map[string]any{"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": true})
	resp, err := t.client.Post("https://api.telegram.org/bot"+t.token+"/sendMessage", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		var e struct {
			Description string `json:"description"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return fmt.Errorf("status %d: %s", resp.StatusCode, e.Description)
	}
	return nil
}

// Chat — чат, который недавно писал боту: помогает узнать chat_id.
type Chat struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
	Type  string `json:"type"`
}

// RecentChats читает последние обновления бота и возвращает чаты, откуда ему писали.
func (t *Telegram) RecentChats() ([]Chat, error) {
	if !t.Enabled() {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN is not set")
	}
	resp, err := t.client.Get("https://api.telegram.org/bot" + t.token + "/getUpdates?limit=50")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var r struct {
		Result []struct {
			Message *struct {
				Chat struct {
					ID        int64  `json:"id"`
					Title     string `json:"title"`
					Username  string `json:"username"`
					FirstName string `json:"first_name"`
					Type      string `json:"type"`
				} `json:"chat"`
			} `json:"message"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}
	seen := map[int64]bool{}
	var out []Chat
	for _, u := range r.Result {
		if u.Message == nil || seen[u.Message.Chat.ID] {
			continue
		}
		c := u.Message.Chat
		seen[c.ID] = true
		title := c.Title
		if title == "" {
			title = strings.TrimSpace(c.FirstName + " @" + c.Username)
		}
		out = append(out, Chat{ID: c.ID, Title: title, Type: c.Type})
	}
	return out, nil
}
