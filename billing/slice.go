package billing

// Contract — договор юрлица: предоплата или лимит постоплаты.
type Contract struct {
	ID          string
	INN         string
	Prepaid     bool
	CreditLimit int64
}

func NewContract(id, inn string, prepaid bool, creditLimit int64) (Contract, error) {
	if id == "" || inn == "" || creditLimit < 0 {
		return Contract{}, ErrState
	}
	return Contract{ID: id, INN: inn, Prepaid: prepaid, CreditLimit: creditLimit}, nil
}

// Outbox — чеки, письма, ЭДО и уведомления тестового контура.
type Outbox struct {
	Receipts []Receipt
	Emails   []string
	EDO      []string
	Notices  []string
}

// ConfirmPerson зачисляет подтверждённый платёж физлица и кладёт чек в отправку.
func (o *Outbox) ConfirmPerson(l *Ledger, p Payment, email string) error {
	if p.Status != "" && p.Status != "succeeded" {
		return nil
	}
	if email == "" || p.Amount <= 0 {
		return ErrState
	}
	before := l.Wallet(p.Account)
	if err := l.CreditPayment(p.ID, p.Account, p.Amount); err != nil {
		return err
	}
	if l.Wallet(p.Account) == before {
		return nil
	}
	o.Receipts = append(o.Receipts, FiscalReceipt(p.ID, email))
	o.Emails = append(o.Emails, email)
	return nil
}

// IssueInvoice выставляет счёт по договору.
func IssueInvoice(c Contract, number string, amount int64) (Invoice, error) {
	if number == "" || amount <= 0 {
		return Invoice{}, ErrAmount
	}
	return Invoice{Number: number, INN: c.INN, Amount: amount}, nil
}

// ApplyBank зачисляет платёж, если в назначении есть номер счёта.
func ApplyBank(l *Ledger, account, purpose string, invoices []Invoice) error {
	inv, ok := MatchInvoice(purpose, invoices)
	if !ok {
		return ErrState
	}
	return l.CreditPayment(inv.Number, account, inv.Amount)
}

// CloseMonth собирает акт и УПД и кладёт их в журнал ЭДО.
func (o *Outbox) CloseMonth(inn, period string, consumed int64) error {
	if inn == "" || period == "" || consumed < 0 {
		return ErrState
	}
	act := ActFor(inn, period, consumed)
	o.EDO = append(o.EDO, "act:"+act.Period, "upd:"+act.Period)
	return nil
}

// Autopay — порог, сумма и сколько раз в месяц уже списывали.
type Autopay struct {
	Threshold int64
	Amount    int64
	Cap       int64
	Done      int64
}

// RunAutopay уведомляет о низком балансе и пополняет, если списание карты прошло.
func (o *Outbox) RunAutopay(l *Ledger, account string, balance int64, rule *Autopay, charged bool) error {
	if balance < rule.Threshold {
		o.Notices = append(o.Notices, "low:"+account)
	}
	amount, yes := AutoTopup(balance, rule.Threshold, rule.Amount, rule.Done, rule.Cap)
	if !yes {
		return nil
	}
	if !charged {
		o.Notices = append(o.Notices, "fail:"+account)
		return ErrState
	}
	id := "auto-" + account + "-" + signed(rule.Done)
	if err := l.CreditPayment(id, account, amount); err != nil {
		return err
	}
	rule.Done++
	return nil
}

// DashboardAgrees проверяет, что ряды дашборда сходятся с финансовым отчётом.
func DashboardAgrees(days []DayStat, lines []FinLine) bool {
	var revenue, cost int64
	for _, day := range days {
		revenue += day.Revenue
		cost += day.Cost
	}
	total, _ := Summarize(lines)
	return revenue == total.Revenue && cost == total.Cost
}

// ClientTotal — выручка клиента.
type ClientTotal struct {
	Client                string
	Revenue, Cost, Margin int64
}

// TopClients возвращает клиентов с наибольшей выручкой.
func TopClients(lines []FinLine, n int) []ClientTotal {
	by := map[string]ClientTotal{}
	var order []string
	for _, ln := range lines {
		item, ok := by[ln.Client]
		if !ok {
			order = append(order, ln.Client)
		}
		item.Client = ln.Client
		item.Revenue += ln.Revenue
		item.Cost += ln.Cost
		item.Margin = item.Revenue - item.Cost
		by[ln.Client] = item
	}
	out := make([]ClientTotal, 0, len(order))
	for _, client := range order {
		out = append(out, by[client])
	}
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Revenue > out[i].Revenue {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	if n > 0 && n < len(out) {
		out = out[:n]
	}
	return out
}
