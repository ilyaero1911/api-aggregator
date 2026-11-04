package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

// Promo — фиксированная сумма или доля от пополнения.
type Promo struct {
	Code       string
	Fixed      int64
	PercentBps int64
	MaxUses    int
	Used       int
	Until      time.Time
	NewOnly    bool
}

func (l *Ledger) Redeem(p *Promo, account string, topup int64, isNew bool, now time.Time) error {
	if p.NewOnly && !isNew {
		return ErrPromo
	}
	if !p.Until.IsZero() && !now.Before(p.Until) {
		return ErrPromo
	}
	if p.MaxUses > 0 && p.Used >= p.MaxUses {
		return ErrPromo
	}
	if topup < 0 || p.Fixed < 0 || p.PercentBps < 0 {
		return ErrAmount
	}
	bonus := p.Fixed + mulDiv(topup, p.PercentBps, Bps)
	if bonus <= 0 {
		return ErrPromo
	}
	if err := l.CreditBonus(account, bonus, p.Until, nil); err != nil {
		return err
	}
	p.Used++
	l.audit = append(l.audit, "promo "+p.Code)
	return nil
}

// Referral — процент с пополнений приглашённого в течение нескольких месяцев.
type Referral struct {
	Code       string
	Owner      string
	PercentBps int64
	Months     int
	Signed     map[string]time.Time
}

func (r *Referral) Attribute(user string, now time.Time) error {
	if user == "" || user == r.Owner {
		return ErrState
	}
	if r.Signed == nil {
		r.Signed = map[string]time.Time{}
	}
	if _, ok := r.Signed[user]; ok {
		return nil
	}
	r.Signed[user] = now
	return nil
}

func (r *Referral) Reward(l *Ledger, user string, topup int64, now time.Time) error {
	at, ok := r.Signed[user]
	if !ok || topup < 0 || r.PercentBps < 0 {
		return ErrState
	}
	if r.Months > 0 && !now.Before(at.AddDate(0, r.Months, 0)) {
		return nil
	}
	bonus := mulDiv(topup, r.PercentBps, Bps)
	if bonus == 0 {
		return nil
	}
	return l.CreditBonus(r.Owner, bonus, at.AddDate(0, r.Months, 0), nil)
}

// FraudRules — что именно считает антифрод.
var FraudRules = []string{
	"Одноразовый домен почты не получает стартовый бонус.",
	"Один отпечаток браузера не получает стартовый бонус второй раз.",
	"Самоприглашение по реферальной ссылке не создаёт начисление.",
}

var disposableDomains = map[string]bool{
	"mailinator.com":    true,
	"guerrillamail.com": true,
	"tempmail.com":      true,
}

// Hit — срабатывание, которое видно в журнале админки.
type Hit struct {
	Email string
	Rule  string
}

func Screen(email, fingerprint string, bonusPrints map[string]int) []Hit {
	var hits []Hit
	at := strings.LastIndex(email, "@")
	if at >= 0 && disposableDomains[strings.ToLower(email[at+1:])] {
		hits = append(hits, Hit{Email: email, Rule: FraudRules[0]})
	}
	if fingerprint != "" && bonusPrints[fingerprint] > 0 {
		hits = append(hits, Hit{Email: email, Rule: FraudRules[1]})
	}
	return hits
}

// ReconRow — наша сумма и сумма контрагента.
type ReconRow struct {
	Name        string
	Ours, Their int64
}

func Mismatches(rows []ReconRow, thresholdBps int64) []ReconRow {
	var out []ReconRow
	for _, row := range rows {
		if row.Their == 0 {
			if row.Ours != 0 {
				out = append(out, row)
			}
			continue
		}
		diff := abs(row.Ours-row.Their) * Bps / abs(row.Their)
		if diff >= thresholdBps {
			out = append(out, row)
		}
	}
	return out
}

// FinLine — выручка и себестоимость одной группы.
type FinLine struct {
	Month, Model, Provider, Client string
	Revenue, Cost                  int64
}

// FinTotal — итог отчёта.
type FinTotal struct {
	Revenue, Cost, Margin int64
}

func Summarize(lines []FinLine) (FinTotal, map[string]FinTotal) {
	total := FinTotal{}
	byModel := map[string]FinTotal{}
	for _, ln := range lines {
		total.Revenue += ln.Revenue
		total.Cost += ln.Cost
		item := byModel[ln.Model]
		item.Revenue += ln.Revenue
		item.Cost += ln.Cost
		item.Margin = item.Revenue - item.Cost
		byModel[ln.Model] = item
	}
	total.Margin = total.Revenue - total.Cost
	return total, byModel
}

// AutoTopup решает, списывать ли сохранённую сумму. Карту здесь не трогает.
func AutoTopup(balance, threshold, amount, done, cap int64) (int64, bool) {
	if amount <= 0 || balance >= threshold || (cap > 0 && done >= cap) {
		return 0, false
	}
	return amount, true
}

// Invoice — счёт юрлица.
type Invoice struct {
	Number string
	INN    string
	Amount int64
}

func MatchInvoice(purpose string, list []Invoice) (Invoice, bool) {
	for _, item := range list {
		if item.Number != "" && strings.Contains(purpose, item.Number) {
			return item, true
		}
	}
	return Invoice{}, false
}

// Act — закрывающий документ за период.
type Act struct {
	INN, Period string
	Amount      int64
}

func ActFor(inn, period string, amount int64) Act {
	return Act{INN: inn, Period: period, Amount: amount}
}

// Receipt — фискальный чек аванса. Отправка в кассу сюда не входит.
type Receipt struct {
	PaymentID string
	Email     string
	Method    string
	VATBps    int64
}

func FiscalReceipt(paymentID, email string) Receipt {
	return Receipt{PaymentID: paymentID, Email: email, Method: "advance", VATBps: 0}
}

// Payment — входящий платёж тестового контура.
type Payment struct {
	ID      string `json:"id"`
	Account string `json:"account"`
	Amount  int64  `json:"amount"`
}

func Sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func AcceptWebhook(l *Ledger, secret string, body []byte, sig string) error {
	want := Sign(secret, body)
	if !hmac.Equal([]byte(want), []byte(sig)) {
		return ErrState
	}
	var payment Payment
	if err := json.Unmarshal(body, &payment); err != nil {
		return err
	}
	return l.CreditPayment(payment.ID, payment.Account, payment.Amount)
}

// DayStat — ряд для внутреннего дашборда.
type DayStat struct {
	Day             string
	Signups, Paying int
	Revenue, Cost   int64
}

type AccountDay struct {
	Day, Client   string
	Signed        bool
	Revenue, Cost int64
}

func BusinessDays(rows []AccountDay) []DayStat {
	type acc struct {
		signups int
		paying  map[string]bool
		revenue int64
		cost    int64
	}
	order := []string{}
	by := map[string]*acc{}
	for _, row := range rows {
		item := by[row.Day]
		if item == nil {
			item = &acc{paying: map[string]bool{}}
			by[row.Day] = item
			order = append(order, row.Day)
		}
		if row.Signed {
			item.signups++
		}
		if row.Revenue > 0 {
			item.paying[row.Client] = true
		}
		item.revenue += row.Revenue
		item.cost += row.Cost
	}
	out := make([]DayStat, 0, len(order))
	for _, day := range order {
		item := by[day]
		out = append(out, DayStat{
			Day: day, Signups: item.signups, Paying: len(item.paying),
			Revenue: item.revenue, Cost: item.cost,
		})
	}
	return out
}

// RetentionBps — доля клиентов прошлого периода, которые платили и в следующем.
func RetentionBps(prev, next map[string]bool) int64 {
	if len(prev) == 0 {
		return 0
	}
	kept := int64(0)
	for client := range prev {
		if next[client] {
			kept++
		}
	}
	return kept * Bps / int64(len(prev))
}
