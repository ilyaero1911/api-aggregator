package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

// Profile — то, что берём у внешнего провайдера входа.
type Profile struct {
	Subject string
	Email   string
	Name    string
	Avatar  string
}

// OAuth — вход через GitHub, Яндекс или VK.
type OAuth struct {
	Name  string
	conf  *oauth2.Config
	fetch func(ctx context.Context, c *oauth2.Config, tok *oauth2.Token) (Profile, error)
}

func (o *OAuth) AuthURL(state string) string { return o.conf.AuthCodeURL(state) }

func (o *OAuth) Exchange(ctx context.Context, code string) (Profile, error) {
	tok, err := o.conf.Exchange(ctx, code)
	if err != nil {
		return Profile{}, err
	}
	p, err := o.fetch(ctx, o.conf, tok)
	if err != nil {
		return Profile{}, err
	}
	if p.Subject == "" {
		return Profile{}, errors.New(o.Name + ": empty subject")
	}
	return p, nil
}

func NewGitHub(id, secret, redirect string) *OAuth {
	return &OAuth{Name: "github", conf: &oauth2.Config{ClientID: id, ClientSecret: secret, RedirectURL: redirect,
		Scopes: []string{"read:user", "user:email"}, Endpoint: github.Endpoint},
		fetch: func(ctx context.Context, c *oauth2.Config, tok *oauth2.Token) (Profile, error) {
			cl := c.Client(ctx, tok)
			var u struct {
				ID        int64  `json:"id"`
				Login     string `json:"login"`
				Name      string `json:"name"`
				Email     string `json:"email"`
				AvatarURL string `json:"avatar_url"`
			}
			if err := getJSON(cl, "https://api.github.com/user", nil, &u); err != nil {
				return Profile{}, err
			}
			p := Profile{Subject: strconv.FormatInt(u.ID, 10), Email: u.Email, Name: firstNonEmpty(u.Name, u.Login), Avatar: u.AvatarURL}
			var emails []struct {
				Email    string `json:"email"`
				Primary  bool   `json:"primary"`
				Verified bool   `json:"verified"`
			}
			if getJSON(cl, "https://api.github.com/user/emails", nil, &emails) == nil {
				for _, e := range emails {
					if e.Primary && e.Verified {
						p.Email = e.Email
					}
				}
			}
			return p, nil
		}}
}

func NewYandex(id, secret, redirect string) *OAuth {
	return &OAuth{Name: "yandex", conf: &oauth2.Config{ClientID: id, ClientSecret: secret, RedirectURL: redirect,
		Scopes:   []string{"login:email", "login:info", "login:avatar"},
		Endpoint: oauth2.Endpoint{AuthURL: "https://oauth.yandex.ru/authorize", TokenURL: "https://oauth.yandex.ru/token", AuthStyle: oauth2.AuthStyleInParams}},
		fetch: func(ctx context.Context, c *oauth2.Config, tok *oauth2.Token) (Profile, error) {
			var u struct {
				ID            string `json:"id"`
				DefaultEmail  string `json:"default_email"`
				RealName      string `json:"real_name"`
				DisplayName   string `json:"display_name"`
				AvatarID      string `json:"default_avatar_id"`
				IsAvatarEmpty bool   `json:"is_avatar_empty"`
			}
			h := http.Header{"Authorization": {"OAuth " + tok.AccessToken}}
			if err := getJSON(http.DefaultClient, "https://login.yandex.ru/info?format=json", h, &u); err != nil {
				return Profile{}, err
			}
			p := Profile{Subject: u.ID, Email: u.DefaultEmail, Name: firstNonEmpty(u.RealName, u.DisplayName)}
			if u.AvatarID != "" && !u.IsAvatarEmpty {
				p.Avatar = "https://avatars.yandex.net/get-yapic/" + u.AvatarID + "/islands-200"
			}
			return p, nil
		}}
}

func NewVK(id, secret, redirect string) *OAuth {
	return &OAuth{Name: "vk", conf: &oauth2.Config{ClientID: id, ClientSecret: secret, RedirectURL: redirect,
		Scopes:   []string{"email"},
		Endpoint: oauth2.Endpoint{AuthURL: "https://oauth.vk.com/authorize", TokenURL: "https://oauth.vk.com/access_token", AuthStyle: oauth2.AuthStyleInParams}},
		fetch: func(ctx context.Context, c *oauth2.Config, tok *oauth2.Token) (Profile, error) {
			p := Profile{Subject: fmt.Sprint(tok.Extra("user_id")), Email: fmt.Sprint(tok.Extra("email"))}
			if p.Email == "<nil>" {
				p.Email = ""
			}
			var r struct {
				Response []struct {
					FirstName string `json:"first_name"`
					LastName  string `json:"last_name"`
					Photo     string `json:"photo_200"`
				} `json:"response"`
			}
			u := "https://api.vk.com/method/users.get?fields=photo_200&v=5.199&access_token=" + tok.AccessToken
			if getJSON(http.DefaultClient, u, nil, &r) == nil && len(r.Response) > 0 {
				p.Name = strings.TrimSpace(r.Response[0].FirstName + " " + r.Response[0].LastName)
				p.Avatar = r.Response[0].Photo
			}
			return p, nil
		}}
}

func getJSON(cl *http.Client, url string, h http.Header, v any) error {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	for k, vs := range h {
		req.Header[k] = vs
	}
	req.Header.Set("Accept", "application/json")
	resp, err := cl.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("%s: status %d", url, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

func firstNonEmpty(a ...string) string {
	for _, s := range a {
		if s != "" {
			return s
		}
	}
	return ""
}

// SignState подписывает момент выдачи и адрес возврата, чтобы не хранить состояние входа на сервере.
func SignState(secret, next string) string {
	payload := strconv.FormatInt(time.Now().Unix(), 10) + "|" + next
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func CheckState(secret, state string) (string, error) {
	p, sig, ok := strings.Cut(state, ".")
	if !ok {
		return "", errors.New("bad state")
	}
	payload, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return "", err
	}
	want := hmac.New(sha256.New, []byte(secret))
	want.Write(payload)
	got, _ := base64.RawURLEncoding.DecodeString(sig)
	if !hmac.Equal(got, want.Sum(nil)) {
		return "", errors.New("bad state signature")
	}
	ts, rest, _ := strings.Cut(string(payload), "|")
	n, _ := strconv.ParseInt(ts, 10, 64)
	if time.Since(time.Unix(n, 0)) > 15*time.Minute {
		return "", errors.New("state expired")
	}
	return rest, nil
}

// PasswordProblem возвращает код проблемы с паролем или пустую строку.
func PasswordProblem(p, email string) string {
	if len([]rune(p)) < 8 {
		return "too_short"
	}
	if len(p) > 200 {
		return "too_long"
	}
	var lower, upper, digit bool
	for _, r := range p {
		switch {
		case r >= 'a' && r <= 'z', r >= 'а' && r <= 'я':
			lower = true
		case r >= 'A' && r <= 'Z', r >= 'А' && r <= 'Я':
			upper = true
		case r >= '0' && r <= '9':
			digit = true
		}
	}
	if !(lower && upper && digit) {
		return "weak"
	}
	lp := strings.ToLower(p)
	for _, bad := range []string{"password", "qwerty", "12345678", "11111111", "пароль", "admin123", "letmein"} {
		if strings.Contains(lp, bad) {
			return "common"
		}
	}
	if local, _, _ := strings.Cut(strings.ToLower(email), "@"); len(local) >= 4 && strings.Contains(lp, local) {
		return "contains_email"
	}
	return ""
}
