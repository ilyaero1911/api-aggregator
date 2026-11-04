package billing

import "time"

type line struct {
	Txn     int64
	Account string
	Amount  int64
	Kind    string
	Ref     string
	Reason  string
}

type hold struct {
	Account             string
	Bonus, Pack, Wallet int64
}

type pendingAdj struct {
	Account string
	Amount  int64
	Reason  string
	By      string
}

// Ledger — счета кошелька, бонуса и пакета. Сумма проводок каждой операции равна нулю.
type Ledger struct {
	bal         map[string]int64
	lines       []line
	seq         int64
	holds       map[string]hold
	captured    map[string]int64
	payments    map[string]int64
	audit       []string
	pending     map[string]pendingAdj
	bonusUntil  map[string]time.Time
	blocked     map[string]map[string]bool
	AdjustLimit int64
}

func NewLedger() *Ledger {
	return &Ledger{
		bal:         map[string]int64{},
		holds:       map[string]hold{},
		captured:    map[string]int64{},
		payments:    map[string]int64{},
		pending:     map[string]pendingAdj{},
		bonusUntil:  map[string]time.Time{},
		blocked:     map[string]map[string]bool{},
		AdjustLimit: 1000 * MinorPerRuble,
	}
}

func (l *Ledger) post(kind, ref, reason string, acc []string, amt []int64) error {
	if len(acc) != len(amt) {
		return ErrState
	}
	sum := int64(0)
	for _, a := range amt {
		sum += a
	}
	if sum != 0 {
		return ErrState
	}
	l.seq++
	for i := range acc {
		if amt[i] == 0 {
			continue
		}
		l.bal[acc[i]] += amt[i]
		l.lines = append(l.lines, line{
			Txn: l.seq, Account: acc[i], Amount: amt[i], Kind: kind, Ref: ref, Reason: reason,
		})
	}
	return nil
}

func (l *Ledger) Balanced() bool {
	sum := int64(0)
	for _, ln := range l.lines {
		sum += ln.Amount
	}
	return sum == 0
}

func (l *Ledger) Wallet(account string) int64  { return l.bal["wallet:"+account] }
func (l *Ledger) Bonus(account string) int64   { return l.bal["bonus:"+account] }
func (l *Ledger) Package(account string) int64 { return l.bal["package:"+account] }
func (l *Ledger) Revenue() int64               { return l.bal["revenue"] }
func (l *Ledger) Audit() []string              { return append([]string(nil), l.audit...) }

func (l *Ledger) Deposit(account string, amount int64) error {
	if amount <= 0 {
		return ErrAmount
	}
	return l.post("deposit", account, "", []string{"funding", "wallet:" + account}, []int64{-amount, amount})
}

func (l *Ledger) CreditBonus(account string, amount int64, until time.Time, blocked []string) error {
	if amount <= 0 {
		return ErrAmount
	}
	if err := l.post("bonus", account, "", []string{"funding", "bonus:" + account}, []int64{-amount, amount}); err != nil {
		return err
	}
	if !until.IsZero() {
		old, exists := l.bonusUntil[account]
		if !exists || old.IsZero() || until.Before(old) {
			l.bonusUntil[account] = until
		}
	}
	if len(blocked) > 0 {
		if l.blocked[account] == nil {
			l.blocked[account] = map[string]bool{}
		}
		for _, model := range blocked {
			l.blocked[account][model] = true
		}
	}
	return nil
}

func (l *Ledger) BuyPackage(account string, amount int64) error {
	if amount <= 0 {
		return ErrAmount
	}
	return l.post("package", account, "", []string{"funding", "package:" + account}, []int64{-amount, amount})
}

func (l *Ledger) bonusUsable(account, model string, now time.Time) int64 {
	until, ok := l.bonusUntil[account]
	if ok && !until.IsZero() && !now.Before(until) {
		return 0
	}
	if l.blocked[account][model] {
		return 0
	}
	return l.Bonus(account)
}

func (l *Ledger) ExpireBonus(account string, now time.Time) error {
	until, ok := l.bonusUntil[account]
	if !ok || now.Before(until) {
		return nil
	}
	amount := l.Bonus(account)
	if amount == 0 {
		return nil
	}
	return l.post("expire", account, "срок бонуса", []string{"bonus:" + account, "expired"}, []int64{-amount, amount})
}

func (l *Ledger) Authorize(account, generation, model string, estimate int64, now time.Time) error {
	if estimate < 0 {
		return ErrAmount
	}
	if estimate == 0 {
		return nil
	}
	if _, ok := l.captured[generation]; ok {
		return nil
	}
	if _, ok := l.holds[generation]; ok {
		return nil
	}
	bonus := l.bonusUsable(account, model, now)
	pack := l.Package(account)
	wallet := l.Wallet(account)
	if bonus+pack+wallet < estimate {
		return ErrFunds
	}
	takeBonus := bonus
	if takeBonus > estimate {
		takeBonus = estimate
	}
	left := estimate - takeBonus
	takePack := pack
	if takePack > left {
		takePack = left
	}
	takeWallet := estimate - takeBonus - takePack
	if err := l.post("hold", generation, "",
		[]string{
			"bonus:" + account, "hold:bonus:" + account,
			"package:" + account, "hold:package:" + account,
			"wallet:" + account, "hold:wallet:" + account,
		},
		[]int64{-takeBonus, takeBonus, -takePack, takePack, -takeWallet, takeWallet},
	); err != nil {
		return err
	}
	l.holds[generation] = hold{Account: account, Bonus: takeBonus, Pack: takePack, Wallet: takeWallet}
	return nil
}

func (l *Ledger) Capture(account, generation string, actual int64) error {
	if actual < 0 {
		return ErrAmount
	}
	if _, ok := l.captured[generation]; ok {
		return nil
	}
	h, ok := l.holds[generation]
	if !ok {
		if actual == 0 {
			l.captured[generation] = 0
			return nil
		}
		return ErrState
	}
	if h.Account != account {
		return ErrState
	}
	if actual > h.Bonus+h.Pack+h.Wallet {
		return ErrState
	}
	useBonus := h.Bonus
	if useBonus > actual {
		useBonus = actual
	}
	left := actual - useBonus
	usePack := h.Pack
	if usePack > left {
		usePack = left
	}
	useWallet := actual - useBonus - usePack
	if err := l.post("capture", generation, "",
		[]string{
			"hold:bonus:" + account, "bonus:" + account,
			"hold:package:" + account, "package:" + account,
			"hold:wallet:" + account, "wallet:" + account,
			"revenue",
		},
		[]int64{
			-h.Bonus, h.Bonus - useBonus,
			-h.Pack, h.Pack - usePack,
			-h.Wallet, h.Wallet - useWallet,
			actual,
		},
	); err != nil {
		return err
	}
	delete(l.holds, generation)
	l.captured[generation] = actual
	return nil
}

func (l *Ledger) Release(account, generation string) error {
	if _, ok := l.captured[generation]; ok {
		return nil
	}
	h, ok := l.holds[generation]
	if !ok {
		return nil
	}
	if h.Account != account {
		return ErrState
	}
	if err := l.post("release", generation, "",
		[]string{
			"hold:bonus:" + account, "bonus:" + account,
			"hold:package:" + account, "package:" + account,
			"hold:wallet:" + account, "wallet:" + account,
		},
		[]int64{-h.Bonus, h.Bonus, -h.Pack, h.Pack, -h.Wallet, h.Wallet},
	); err != nil {
		return err
	}
	delete(l.holds, generation)
	return nil
}

func (l *Ledger) applyAdjust(id, account string, amount int64, reason string) error {
	if amount > 0 {
		return l.post("adjust", id, reason, []string{"funding", "wallet:" + account}, []int64{-amount, amount})
	}
	if l.Wallet(account) < -amount {
		return ErrFunds
	}
	return l.post("adjust", id, reason, []string{"wallet:" + account, "funding"}, []int64{amount, -amount})
}

// Adjust зачисляет или списывает с причиной. Сумма выше порога ждёт второго человека.
func (l *Ledger) Adjust(id, account string, amount int64, reason, by string) (bool, error) {
	if amount == 0 || reason == "" || by == "" {
		return false, ErrState
	}
	if abs(amount) <= l.AdjustLimit {
		l.audit = append(l.audit, "adjust "+id+" "+by+" "+reason)
		return true, l.applyAdjust(id, account, amount, reason)
	}
	pending, ok := l.pending[id]
	if !ok {
		l.pending[id] = pendingAdj{Account: account, Amount: amount, Reason: reason, By: by}
		l.audit = append(l.audit, "pending "+id+" "+by)
		return false, nil
	}
	if pending.By == by {
		return false, ErrSameApprover
	}
	if pending.Account != account || pending.Amount != amount {
		return false, ErrState
	}
	delete(l.pending, id)
	l.audit = append(l.audit, "approved "+id+" "+by)
	return true, l.applyAdjust(id, account, amount, reason)
}

func (l *Ledger) CreditPayment(id, account string, amount int64) error {
	if amount <= 0 {
		return ErrAmount
	}
	if _, ok := l.payments[id]; ok {
		return nil
	}
	if err := l.Deposit(account, amount); err != nil {
		return err
	}
	l.payments[id] = amount
	l.audit = append(l.audit, "payment "+id)
	return nil
}

func (l *Ledger) RefundPayment(id, account string, amount int64) error {
	left, ok := l.payments[id]
	if !ok || amount <= 0 || amount > left {
		return ErrState
	}
	if l.Wallet(account) < amount {
		return ErrFunds
	}
	if err := l.post("refund", id, "возврат", []string{"wallet:" + account, "funding"}, []int64{-amount, amount}); err != nil {
		return err
	}
	left -= amount
	if left == 0 {
		delete(l.payments, id)
	} else {
		l.payments[id] = left
	}
	l.audit = append(l.audit, "refund "+id)
	return nil
}
