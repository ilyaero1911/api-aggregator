package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type GoogleProfile struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

type Google struct {
	conf   *oauth2.Config
	secret []byte
}

func NewGoogle(clientID, clientSecret, redirectURL, secret string) *Google {
	return &Google{
		conf: &oauth2.Config{
			ClientID: clientID, ClientSecret: clientSecret, RedirectURL: redirectURL,
			Scopes:   []string{"openid", "email", "profile"},
			Endpoint: google.Endpoint,
		},
		secret: []byte(secret),
	}
}

// State подписывает момент выдачи и адрес возврата, чтобы не хранить состояние на сервере.
func (g *Google) State(next string) string {
	payload := strconv.FormatInt(time.Now().Unix(), 10) + "|" + next
	mac := hmac.New(sha256.New, g.secret)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (g *Google) CheckState(state string) (next string, err error) {
	p, sig, ok := strings.Cut(state, ".")
	if !ok {
		return "", errors.New("bad state")
	}
	payload, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return "", err
	}
	want := hmac.New(sha256.New, g.secret)
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

func (g *Google) AuthURL(state string) string {
	return g.conf.AuthCodeURL(state, oauth2.SetAuthURLParam("prompt", "select_account"))
}

func (g *Google) Exchange(ctx context.Context, code string) (GoogleProfile, error) {
	tok, err := g.conf.Exchange(ctx, code)
	if err != nil {
		return GoogleProfile{}, err
	}
	resp, err := g.conf.Client(ctx, tok).Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return GoogleProfile{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return GoogleProfile{}, fmt.Errorf("userinfo status %d", resp.StatusCode)
	}
	var p GoogleProfile
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return GoogleProfile{}, err
	}
	if p.Sub == "" || p.Email == "" || !p.EmailVerified {
		return GoogleProfile{}, errors.New("google account without verified email")
	}
	return p, nil
}
