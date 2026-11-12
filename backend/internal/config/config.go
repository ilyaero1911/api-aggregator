// Package config читает настройки из переменных окружения.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr        string
	DatabaseURL string
	RedisURL    string
	// PublicURL — адрес фронтенда, на него возвращаем после входа через GitHub, Яндекс или VK и оплаты.
	PublicURL string
	// APIBaseURL — адрес, который показываем пользователю в примерах кода.
	APIBaseURL string

	SecretKey     string // шифрование ключей провайдеров и подпись состояния OAuth
	SecureCookies bool
	SessionTTL    time.Duration

	// Вход через внешние сервисы. Пустые значения — кнопка показывается, но вход не настроен.
	GitHubID, GitHubSecret string
	YandexID, YandexSecret string
	VKID, VKSecret         string

	AdminEmails []string // эти адреса получают роль admin при регистрации

	FxRefresh   time.Duration
	FxCBRURL    string
	FxBackupURL string

	PaymentProvider string // сейчас только "fake"

	TelegramToken  string // токен бота для уведомлений админам
	TelegramChatID string // chat_id через запятую; можно задать и в админке
}

func Load() Config {
	loadDotEnv(".env", "../.env")
	return Config{
		Addr:          env("ADDR", ":8090"),
		DatabaseURL:   env("DATABASE_URL", "postgres://aggregator:aggregator@localhost:55442/aggregator?sslmode=disable"),
		RedisURL:      env("REDIS_URL", "redis://localhost:56389/0"),
		PublicURL:     strings.TrimRight(env("PUBLIC_URL", "http://localhost:3100"), "/"),
		APIBaseURL:    strings.TrimRight(env("API_BASE_URL", "http://localhost:3100/v1"), "/"),
		SecretKey:     env("SECRET_KEY", "dev-secret-change-me-32-bytes-long!"),
		SecureCookies: env("SECURE_COOKIES", "false") == "true",
		SessionTTL:    dur("SESSION_TTL", 30*24*time.Hour),
		GitHubID:      env("GITHUB_CLIENT_ID", ""), GitHubSecret: env("GITHUB_CLIENT_SECRET", ""),
		YandexID: env("YANDEX_CLIENT_ID", ""), YandexSecret: env("YANDEX_CLIENT_SECRET", ""),
		VKID: env("VK_CLIENT_ID", ""), VKSecret: env("VK_CLIENT_SECRET", ""),
		AdminEmails:     list(env("ADMIN_EMAILS", "admin@local.test")),
		FxRefresh:       dur("FX_REFRESH", time.Hour),
		FxCBRURL:        env("FX_CBR_URL", "https://www.cbr.ru/scripts/XML_daily.asp"),
		FxBackupURL:     env("FX_BACKUP_URL", "https://www.cbr-xml-daily.ru/daily_json.js"),
		PaymentProvider: env("PAYMENT_PROVIDER", "fake"),
		TelegramToken:   env("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:  env("TELEGRAM_CHAT_ID", ""),
	}
}

// OAuthCreds возвращает id и secret провайдера входа.
func (c Config) OAuthCreds(name string) (string, string) {
	switch name {
	case "github":
		return c.GitHubID, c.GitHubSecret
	case "yandex":
		return c.YandexID, c.YandexSecret
	case "vk":
		return c.VKID, c.VKSecret
	}
	return "", ""
}

func (c Config) IsAdminEmail(email string) bool {
	for _, e := range c.AdminEmails {
		if strings.EqualFold(e, email) {
			return true
		}
	}
	return false
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func dur(k string, def time.Duration) time.Duration {
	if v := os.Getenv(k); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
		if n, err := strconv.Atoi(v); err == nil {
			return time.Duration(n) * time.Second
		}
	}
	return def
}

func list(v string) []string {
	var out []string
	for _, p := range strings.Split(v, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// loadDotEnv подхватывает переменные из .env рядом с сервером или в корне репозитория.
// Уже заданные переменные окружения не перезаписываются.
func loadDotEnv(paths ...string) {
	for _, p := range paths {
		raw, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			k, v, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			k, v = strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"'`)
			if _, set := os.LookupEnv(k); !set && v != "" {
				os.Setenv(k, v)
			}
		}
	}
}
