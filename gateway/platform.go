package gateway

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"strings"
	"sync"
	"time"
)

const keyPrefix = "ng-v1-"

// Issued — секрет показывается один раз. В хранилище остаётся только хеш и префикс.
type Issued struct {
	Secret string
	Hash   string
	Prefix string
}

func IssueSecret() (Issued, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return Issued{}, err
	}
	body := base62(raw)
	sum := sha256.Sum256([]byte(body))
	secret := keyPrefix + body + hex.EncodeToString(sum[:2])
	return Issued{Secret: secret, Hash: HashKey(secret), Prefix: secret[:12]}, nil
}

func ValidSecret(secret string) bool {
	if !strings.HasPrefix(secret, keyPrefix) || len(secret) < len(keyPrefix)+8 {
		return false
	}
	bodyAndSum := secret[len(keyPrefix):]
	if len(bodyAndSum) < 4 {
		return false
	}
	body, sum := bodyAndSum[:len(bodyAndSum)-4], bodyAndSum[len(bodyAndSum)-4:]
	got := sha256.Sum256([]byte(body))
	return hex.EncodeToString(got[:2]) == sum
}

func base62(raw []byte) string {
	const alpha = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	var out []byte
	for _, b := range raw {
		out = append(out, alpha[int(b)%62])
	}
	return string(out)
}

// Record — ключ без секрета.
type Record struct {
	ID         string
	Name       string
	Account    string
	Prefix     string
	Hash       string
	Active     bool
	Management bool
	Expires    time.Time
	GraceUntil time.Time
	CreatedBy  string
	LastUsed   time.Time
	Budget     int64
	Spent      int64
	Models     []string
	DenyModels []string
	Providers  []string
	CIDRs      []string
	RPM        int
	TPM        int
}

// Vault хранит ключи по хешу. Секрет в структуру не входит.
type Vault struct {
	mu      sync.Mutex
	byHash  map[string]*Record
	byID    map[string]*Record
	MaxKeys int
	seq     int
}

func NewVault(maxKeys int) *Vault {
	if maxKeys <= 0 {
		maxKeys = 20
	}
	return &Vault{byHash: map[string]*Record{}, byID: map[string]*Record{}, MaxKeys: maxKeys}
}

func (v *Vault) count(account string) int {
	n := 0
	for _, rec := range v.byID {
		if rec.Account == account && rec.Active {
			n++
		}
	}
	return n
}

func (v *Vault) Create(account, name, createdBy string, management bool, now time.Time) (Issued, *Record, error) {
	issued, err := IssueSecret()
	if err != nil {
		return Issued{}, nil, err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.count(account) >= v.MaxKeys {
		return Issued{}, nil, errors.New("лимит ключей")
	}
	v.seq++
	rec := &Record{
		ID: "key-" + strconvItoa(v.seq), Name: name, Account: account,
		Prefix: issued.Prefix, Hash: issued.Hash, Active: true, Management: management,
		CreatedBy: createdBy,
	}
	v.byHash[rec.Hash] = rec
	v.byID[rec.ID] = rec
	_ = now
	return issued, rec, nil
}

func (v *Vault) Rotate(id string, grace time.Duration, now time.Time) (Issued, *Record, error) {
	v.mu.Lock()
	old := v.byID[id]
	v.mu.Unlock()
	if old == nil {
		return Issued{}, nil, errors.New("ключ не найден")
	}
	issued, rec, err := v.Create(old.Account, old.Name, old.CreatedBy, old.Management, now)
	if err != nil {
		return Issued{}, nil, err
	}
	v.mu.Lock()
	old.GraceUntil = now.Add(grace)
	v.mu.Unlock()
	return issued, rec, nil
}

func (v *Vault) RevokeID(id string) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	rec := v.byID[id]
	if rec == nil {
		return false
	}
	rec.Active = false
	return true
}

func (v *Vault) List(account string) []Record {
	v.mu.Lock()
	defer v.mu.Unlock()
	var out []Record
	for _, rec := range v.byID {
		if rec.Account == account {
			out = append(out, *rec)
		}
	}
	return out
}

func (v *Vault) Dump() string {
	v.mu.Lock()
	defer v.mu.Unlock()
	parts := make([]string, 0, len(v.byID))
	for _, rec := range v.byID {
		parts = append(parts, rec.ID+" "+rec.Prefix+" "+rec.Hash)
	}
	return strings.Join(parts, "\n")
}

func (v *Vault) Allows(rec *Record, model, provider, ip string, now time.Time) error {
	if rec == nil || !rec.Active {
		return errors.New("ключ отозван")
	}
	if !rec.Expires.IsZero() && !now.Before(rec.Expires) && (rec.GraceUntil.IsZero() || !now.Before(rec.GraceUntil)) {
		return errors.New("срок ключа истёк")
	}
	if len(rec.Models) > 0 && !contains(rec.Models, model) {
		return errors.New("модель не разрешена ключом")
	}
	if contains(rec.DenyModels, model) {
		return errors.New("модель запрещена ключом")
	}
	if len(rec.Providers) > 0 && provider != "" && !contains(rec.Providers, provider) {
		return errors.New("провайдер не разрешён ключом")
	}
	if len(rec.CIDRs) > 0 && !ipAllowed(rec.CIDRs, ip) {
		return errors.New("адрес не в списке ключа")
	}
	if rec.Budget > 0 && rec.Spent >= rec.Budget {
		return errors.New("бюджет ключа исчерпан")
	}
	return nil
}

func (v *Vault) Spend(id string, amount int64) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if rec := v.byID[id]; rec != nil {
		rec.Spent += amount
	}
}

func contains(list []string, item string) bool {
	for _, v := range list {
		if v == item {
			return true
		}
	}
	return false
}

func ipAllowed(cidrs []string, ip string) bool {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	for _, raw := range cidrs {
		_, network, err := net.ParseCIDR(raw)
		if err == nil && network.Contains(parsed) {
			return true
		}
		if net.ParseIP(raw) != nil && net.ParseIP(raw).Equal(parsed) {
			return true
		}
	}
	return false
}

func strconvItoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [16]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// Flag — включение фичи без деплоя: на процент аккаунтов или на список организаций.
type Flag struct {
	On      bool
	Percent int
	Orgs    map[string]bool
}

type Flags struct {
	mu    sync.Mutex
	rules map[string]Flag
}

func NewFlags() *Flags { return &Flags{rules: map[string]Flag{}} }

func (f *Flags) Set(name string, rule Flag) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rules[name] = rule
}

func (f *Flags) Enabled(name, account string) bool {
	f.mu.Lock()
	rule, ok := f.rules[name]
	f.mu.Unlock()
	if !ok {
		return false
	}
	if rule.Orgs[account] {
		return true
	}
	if !rule.On || rule.Percent <= 0 {
		return false
	}
	if rule.Percent >= 100 {
		return true
	}
	sum := sha256.Sum256([]byte(name + ":" + account))
	return int(sum[0])%100 < rule.Percent
}

// Seal — конверт: мастер-ключ шифрует ключ данных, ключ данных шифрует секрет.
// Смена мастера перешифровывает только ключи данных.
type Seal struct {
	mu     sync.Mutex
	master []byte
	keys   map[string][]byte
	blob   map[string][]byte
}

func NewSeal(master []byte) (*Seal, error) {
	if len(master) != 32 {
		return nil, errors.New("мастер-ключ 32 байта")
	}
	copied := append([]byte(nil), master...)
	return &Seal{master: copied, keys: map[string][]byte{}, blob: map[string][]byte{}}, nil
}

func (s *Seal) Put(name, plain string) error {
	dataKey := make([]byte, 32)
	if _, err := rand.Read(dataKey); err != nil {
		return err
	}
	body, err := encrypt(dataKey, []byte(plain))
	if err != nil {
		return err
	}
	wrapped, err := encrypt(s.master, dataKey)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.keys[name] = wrapped
	s.blob[name] = body
	s.mu.Unlock()
	return nil
}

func (s *Seal) Get(name string) (string, error) {
	s.mu.Lock()
	wrapped, body := s.keys[name], s.blob[name]
	master := append([]byte(nil), s.master...)
	s.mu.Unlock()
	dataKey, err := decrypt(master, wrapped)
	if err != nil {
		return "", err
	}
	plain, err := decrypt(dataKey, body)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func (s *Seal) RotateMaster(next []byte) error {
	if len(next) != 32 {
		return errors.New("мастер-ключ 32 байта")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for name, wrapped := range s.keys {
		dataKey, err := decrypt(s.master, wrapped)
		if err != nil {
			return err
		}
		again, err := encrypt(next, dataKey)
		if err != nil {
			return err
		}
		s.keys[name] = again
	}
	s.master = append([]byte(nil), next...)
	return nil
}

func (s *Seal) Dump() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var b strings.Builder
	for name, body := range s.blob {
		b.WriteString(name)
		b.WriteByte(' ')
		b.WriteString(hex.EncodeToString(body))
		b.WriteByte('\n')
	}
	return b.String()
}

func encrypt(key, plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plain, nil), nil
}

func decrypt(key, packed []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(packed) < gcm.NonceSize() {
		return nil, errors.New("короткий шифртекст")
	}
	nonce, body := packed[:gcm.NonceSize()], packed[gcm.NonceSize():]
	return gcm.Open(nil, nonce, body, nil)
}

// Preset — сохранённая конфигурация вызова.
type Preset struct {
	Name    string
	Model   string
	Models  []string
	System  string
	Version int
}

type Presets struct {
	mu    sync.Mutex
	items map[string]Preset
}

func NewPresets() *Presets { return &Presets{items: map[string]Preset{}} }

func (p *Presets) Save(item Preset) Preset {
	p.mu.Lock()
	defer p.mu.Unlock()
	prev := p.items[item.Name]
	item.Version = prev.Version + 1
	p.items[item.Name] = item
	return item
}

func (p *Presets) Get(name string) (Preset, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	item, ok := p.items[name]
	return item, ok
}

func PresetName(model, field string) string {
	if strings.HasPrefix(model, "@preset/") {
		return strings.TrimPrefix(model, "@preset/")
	}
	return field
}

// ModelCard — карточка каталога.
type ModelCard struct {
	ID          string
	Name        string
	Description string
	Context     int
	Pricing     map[string]int64
	Modalities  []string
	Parameters  []string
	Disabled    bool
	Expensive   bool
	DataPolicy  string
}

// Catalog — снимок каталога в памяти. Reload меняет его без рестарта.
type Catalog struct {
	mu      sync.Mutex
	models  map[string]ModelCard
	aliases map[string]string
	Version int
}

func NewCatalog() *Catalog {
	return &Catalog{models: map[string]ModelCard{}, aliases: map[string]string{}}
}

func (c *Catalog) Reload(models []ModelCard, aliases map[string]string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.models = map[string]ModelCard{}
	for _, m := range models {
		c.models[m.ID] = m
	}
	c.aliases = map[string]string{}
	for k, v := range aliases {
		c.aliases[k] = v
	}
	c.Version++
}

func (c *Catalog) Resolve(id string) (ModelCard, bool) {
	if c == nil {
		return ModelCard{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if real, ok := c.aliases[id]; ok {
		id = real
	}
	card, ok := c.models[id]
	return card, ok && !card.Disabled
}

func (c *Catalog) List() []ModelCard {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]ModelCard, 0, len(c.models))
	for _, card := range c.models {
		if !card.Disabled {
			out = append(out, card)
		}
	}
	return out
}

// Abuse — журнал жалобы и блокировка ключа.
type Abuse struct {
	mu      sync.Mutex
	journal []string
}

func (a *Abuse) Report(account, keyID, reason string, keys *Keys, secret string) {
	a.mu.Lock()
	a.journal = append(a.journal, account+" "+keyID+" "+reason)
	a.mu.Unlock()
	if keys != nil && secret != "" {
		keys.Revoke(secret)
	}
}

func (a *Abuse) Journal() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]string(nil), a.journal...)
}
