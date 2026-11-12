// Package auth: пароли, сессии, API-ключи, вход через Google.
package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const KeyPrefix = "ng-"

func HashPassword(p string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, p string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
}

func RandomToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// HashToken — sha256 от секрета; в базе храним только его.
func HashToken(t string) string {
	s := sha256.Sum256([]byte(t))
	return hex.EncodeToString(s[:])
}

// NewAPIKey возвращает секрет для пользователя, видимый префикс и хеш для базы.
func NewAPIKey(kind string) (secret, prefix, hash string) {
	p := KeyPrefix
	if kind == "management" {
		p += "mgmt-"
	} else {
		p += "v1-"
	}
	secret = p + strings.ReplaceAll(RandomToken(32), "_", "x")
	prefix = secret[:len(p)+6] + "…" + secret[len(secret)-4:]
	return secret, prefix, HashToken(secret)
}

// Sealer шифрует ключи провайдеров (AES-GCM, ключ из SECRET_KEY).
type Sealer struct{ aead cipher.AEAD }

func NewSealer(secret string) *Sealer {
	k := sha256.Sum256([]byte(secret))
	block, _ := aes.NewCipher(k[:])
	aead, _ := cipher.NewGCM(block)
	return &Sealer{aead: aead}
}

func (s *Sealer) Seal(plain string) string {
	if plain == "" {
		return ""
	}
	nonce := make([]byte, s.aead.NonceSize())
	_, _ = rand.Read(nonce)
	return base64.StdEncoding.EncodeToString(s.aead.Seal(nonce, nonce, []byte(plain), nil))
}

func (s *Sealer) Open(blob string) (string, error) {
	if blob == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(blob)
	if err != nil {
		return "", err
	}
	n := s.aead.NonceSize()
	if len(raw) < n {
		return "", errors.New("sealed value too short")
	}
	out, err := s.aead.Open(nil, raw[:n], raw[n:], nil)
	return string(out), err
}
