package billing

import (
	"strings"
	"testing"
	"time"
)

func rub(v int64) int64 { return v * MinorPerRuble }

func TestQuoteUsesVersionAndStaysFrozen(t *testing.T) {
	jan := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	mar := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	catalog := Catalog{
		Versions: []Version{
			{ID: "v1", From: jan, Currency: "USD", RubPerUSD: 90_000_000, Rates: Rates{Input: 2}},
			{ID: "v2", From: mar, Currency: "USD", RubPerUSD: 100_000_000, Rates: Rates{Input: 4}},
		},
		GlobalBps:   1000,
		ProviderBps: map[string]int64{"openai": 0},
		ModelBps:    map[string]int64{"gpt": 0},
		ClientBps:   map[string]int64{"acme": 500},
	}
	usage := Usage{Input: 100_000}
	feb := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	first, err := catalog.Quote(feb, "openai", "gpt", "acme", usage)
	if err != nil {
		t.Fatal(err)
	}
	if first.VersionID != "v1" || first.RubPerUSD != 90_000_000 {
		t.Fatalf("версия %s курс %d", first.VersionID, first.RubPerUSD)
	}
	saved := first.Amount
	catalog.Versions[0].Rates.Input = 99
	again, err := catalog.Quote(feb, "openai", "gpt", "acme", usage)
	if err != nil {
		t.Fatal(err)
	}
	if first.Amount != saved {
		t.Fatal("сохранённая цена изменилась")
	}
	if again.Amount == saved {
		t.Fatal("новый расчёт должен увидеть новый прайс")
	}
	later, err := catalog.Quote(mar, "openai", "gpt", "acme", usage)
	if err != nil || later.VersionID != "v2" {
		t.Fatalf("март %+v %v", later, err)
	}
	if _, err := catalog.Quote(feb, "openai", "gpt", "acme", Usage{Input: -1}); err == nil {
		t.Fatal("отрицательные токены")
	}
}

func TestSpendOrderBonusPackageWallet(t *testing.T) {
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	ledger := NewLedger()
	if err := ledger.Deposit("a", rub(10)); err != nil {
		t.Fatal(err)
	}
	if err := ledger.CreditBonus("a", rub(4), now.AddDate(0, 1, 0), []string{"expensive"}); err != nil {
		t.Fatal(err)
	}
	if err := ledger.BuyPackage("a", rub(3)); err != nil {
		t.Fatal(err)
	}
	if err := ledger.Authorize("a", "g1", "cheap", rub(6), now); err != nil {
		t.Fatal(err)
	}
	if ledger.Bonus("a") != 0 || ledger.Package("a") != rub(1) || ledger.Wallet("a") != rub(10) {
		t.Fatalf("резерв bonus=%d package=%d wallet=%d", ledger.Bonus("a"), ledger.Package("a"), ledger.Wallet("a"))
	}
	if err := ledger.Capture("a", "g1", rub(5)); err != nil {
		t.Fatal(err)
	}
	if err := ledger.Capture("a", "g1", rub(5)); err != nil {
		t.Fatal(err)
	}
	if ledger.Revenue() != rub(5) || ledger.Bonus("a") != 0 || ledger.Package("a") != rub(2) || ledger.Wallet("a") != rub(10) {
		t.Fatalf("после списания bonus=%d package=%d wallet=%d revenue=%d", ledger.Bonus("a"), ledger.Package("a"), ledger.Wallet("a"), ledger.Revenue())
	}
	if !ledger.Balanced() {
		t.Fatal("проводки не сходятся")
	}
	before := ledger.Package("a")
	if before == 0 {
		t.Fatal("пакет пуст")
	}
}

func TestBonusSkipsBlockedModelAndExpires(t *testing.T) {
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	ledger := NewLedger()
	if err := ledger.Deposit("a", rub(2)); err != nil {
		t.Fatal(err)
	}
	if err := ledger.CreditBonus("a", rub(5), now.Add(time.Hour), []string{"expensive"}); err != nil {
		t.Fatal(err)
	}
	if err := ledger.Authorize("a", "g", "expensive", rub(2), now); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("a") != 0 {
		t.Fatal("дорогая модель должна взять кошелёк, не бонус")
	}
	if err := ledger.Release("a", "g"); err != nil {
		t.Fatal(err)
	}
	if err := ledger.ExpireBonus("a", now.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if ledger.Bonus("a") != 0 || !ledger.Balanced() {
		t.Fatal("бонус не сгорел")
	}
}

func TestPromoReferralAdjustRefund(t *testing.T) {
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	ledger := NewLedger()
	promo := &Promo{Code: "NEW", Fixed: rub(1), PercentBps: 1000, MaxUses: 1, Until: now.AddDate(0, 0, 1), NewOnly: true}
	if err := ledger.Redeem(promo, "a", rub(10), false, now); err != ErrPromo {
		t.Fatal("старому клиенту промокод не положен")
	}
	if err := ledger.Redeem(promo, "a", rub(10), true, now); err != nil {
		t.Fatal(err)
	}
	if ledger.Bonus("a") != rub(2) || promo.Used != 1 {
		t.Fatalf("бонус %d uses %d", ledger.Bonus("a"), promo.Used)
	}
	ref := &Referral{Code: "max", Owner: "max", PercentBps: 1000, Months: 3}
	if err := ref.Attribute("max", now); err != ErrState {
		t.Fatal("самоприглашение")
	}
	if err := ref.Attribute("friend", now); err != nil {
		t.Fatal(err)
	}
	if err := ref.Reward(ledger, "friend", rub(10), now); err != nil {
		t.Fatal(err)
	}
	if ledger.Bonus("max") != rub(1) {
		t.Fatal(ledger.Bonus("max"))
	}
	posted, err := ledger.Adjust("adj1", "a", rub(2000), "исправление", "andrey")
	if err != nil || posted {
		t.Fatal("крупная сумма ждёт второго")
	}
	if _, err := ledger.Adjust("adj1", "a", rub(2000), "исправление", "andrey"); err != ErrSameApprover {
		t.Fatal(err)
	}
	posted, err = ledger.Adjust("adj1", "a", rub(2000), "исправление", "maxim")
	if err != nil || !posted || ledger.Wallet("a") != rub(2000) {
		t.Fatalf("posted %v wallet %d err %v", posted, ledger.Wallet("a"), err)
	}
	if len(ledger.Audit()) < 2 {
		t.Fatal("нет аудита")
	}
	if err := ledger.CreditPayment("pay1", "a", rub(3)); err != nil {
		t.Fatal(err)
	}
	if err := ledger.CreditPayment("pay1", "a", rub(3)); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("a") != rub(2003) {
		t.Fatal("повторный вебхук зачислил второй раз")
	}
	if err := ledger.RefundPayment("pay1", "a", rub(3)); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("a") != rub(2000) || !ledger.Balanced() {
		t.Fatal("возврат сломал баланс")
	}
}

func TestBudgetDoesNotBurnWallet(t *testing.T) {
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	ledger := NewLedger()
	if err := ledger.Deposit("a", rub(100)); err != nil {
		t.Fatal(err)
	}
	budget := &Budget{Limit: rub(10), Period: 24 * time.Hour, Start: start, Hard: true}
	if err := budget.Reserve(start, rub(8)); err != nil {
		t.Fatal(err)
	}
	if len(budget.Notices) == 0 || budget.Notices[0] != "80" {
		t.Fatal(budget.Notices)
	}
	if err := budget.Reserve(start, rub(3)); err != ErrBudget {
		t.Fatal("жёсткий лимит")
	}
	if ledger.Wallet("a") != rub(100) {
		t.Fatal("лимит ключа списал кошелёк")
	}
	budget.Capture(rub(8), rub(8))
	if err := budget.Reserve(start.Add(25*time.Hour), rub(1)); err != nil {
		t.Fatal(err)
	}
	if budget.Used != 0 {
		t.Fatal("период не сбросился")
	}
	soft := &Budget{Limit: rub(1), Start: start, Hard: false}
	if err := soft.Reserve(start, rub(2)); err != nil {
		t.Fatal(err)
	}
	info := KeyInfoOf(*budget, start.Add(25*time.Hour), "beta", 60)
	if info.Tier != "beta" || info.RateLimit != 60 || info.Remain != rub(9) {
		t.Fatalf("%+v", info)
	}
	credits := CreditsOf(ledger.Wallet("a"), ledger.Bonus("a"), budget.Used)
	if credits.Balance != rub(100) {
		t.Fatal(credits)
	}
}

func TestPipelineChaosAndJournal(t *testing.T) {
	at := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	ledger := NewLedger()
	if err := ledger.Deposit("a", rub(50)); err != nil {
		t.Fatal(err)
	}
	catalog := Catalog{Versions: []Version{{
		ID: "v", From: at.Add(-time.Hour), Currency: "RUB",
		Rates: Rates{Input: 10_000},
	}}}
	pipe := NewPipeline(ledger, catalog)
	pipe.Journal.SetKey("org", "secret")
	pipe.Budgets["key"] = &Budget{Limit: rub(100), Period: 24 * time.Hour, Start: at, Hard: true}
	ev := Event{
		GenerationID: "g1", Account: "a", Org: "org", Key: "key", Model: "gpt", Provider: "openai",
		Status: "ok", Usage: Usage{Input: 100}, LatencyMs: 40, At: at,
		Title: "Cursor", Referer: "https://cursor.com", Content: "секрет клиента", OptIn: true, RetainDays: 7,
		AppPublic: true,
	}
	ev.Fail = true
	if err := pipe.Push(ev); err != nil {
		t.Fatal(err)
	}
	pipe.Start()
	if len(pipe.Buf) != 1 || ledger.Revenue() != 0 {
		t.Fatal("сбой воркера не должен терять событие и списывать")
	}
	pipe.Buf[0].Fail = false
	pipe.Stop()
	pipe.Start()
	if ledger.Revenue() == 0 || len(pipe.Buf) != 0 {
		t.Fatalf("revenue %d buf %d", ledger.Revenue(), len(pipe.Buf))
	}
	charged := ledger.Revenue()
	ev.Fail = false
	if err := pipe.Push(ev); err != nil {
		t.Fatal(err)
	}
	if ledger.Revenue() != charged {
		t.Fatal("повтор списал второй раз")
	}
	rows := pipe.Journal.List("org", Filter{Model: "gpt"}, 0, 10, at)
	if len(rows) != 1 || rows[0].Content != "секрет клиента" || rows[0].App != "Cursor" {
		t.Fatalf("%+v", rows)
	}
	if other := pipe.Journal.List("other", Filter{}, 0, 10, at); len(other) != 0 {
		t.Fatal("чужая организация видит журнал")
	}
	silent := ev
	silent.GenerationID = "g2"
	silent.OptIn = false
	silent.Fail = false
	if err := pipe.Push(silent); err != nil {
		t.Fatal(err)
	}
	hidden := pipe.Journal.List("org", Filter{Key: "key"}, 0, 10, at)
	for _, row := range hidden {
		if row.GenerationID == "g2" && row.Content != "" {
			t.Fatal("без согласия текст сохранился")
		}
	}
	pipe.Journal.DeleteContent("org", "g1")
	if rows = pipe.Journal.List("org", Filter{}, 0, 10, at); rows[0].Content != "" {
		t.Fatal("удаление не стёрло текст")
	}
	stats := pipe.Journal.ModelStats(at.Add(-time.Hour), at.Add(time.Hour))
	if len(stats) != 1 || stats[0].OK != 2 {
		t.Fatalf("%+v", stats)
	}
	csvText := pipe.Journal.CSV("org", Filter{}, at)
	if !strings.Contains(csvText, "g1") || strings.Contains(csvText, "секрет") {
		t.Fatal(csvText)
	}
	rank := pipe.Journal.AppRank()
	if len(rank) != 1 || rank[0].App != "Cursor" {
		t.Fatal(rank)
	}
	if !ledger.Balanced() {
		t.Fatal("конвейер развёл проводки")
	}
}

func TestEmptyBalanceDoesNotCallAndRelease(t *testing.T) {
	at := time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)
	ledger := NewLedger()
	catalog := Catalog{Versions: []Version{{ID: "v", From: at.Add(-time.Hour), Currency: "RUB", Rates: Rates{Input: Kopeck}}}}
	pipe := NewPipeline(ledger, catalog)
	pipe.On = true
	err := pipe.Push(Event{GenerationID: "g", Account: "a", Status: "ok", Usage: Usage{Input: 1}, At: at})
	if err != ErrFunds {
		t.Fatal(err)
	}
	if err := ledger.Deposit("a", rub(1)); err != nil {
		t.Fatal(err)
	}
	pipe.On = true
	ev := Event{GenerationID: "g2", Account: "a", Status: "error", Usage: Usage{Input: 1}, At: at}
	if err := pipe.Push(ev); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("a") != rub(1) || ledger.Revenue() != 0 {
		t.Fatal("ошибка модели списала деньги")
	}
}

func TestReportsFraudExportAndWebhook(t *testing.T) {
	hits := Screen("a@mailinator.com", "fp", map[string]int{"fp": 1})
	if len(hits) != 2 || len(FraudRules) != 3 {
		t.Fatal(hits)
	}
	bad := Mismatches([]ReconRow{{Name: "openai", Ours: 1000, Their: 900}}, 500)
	if len(bad) != 1 {
		t.Fatal(bad)
	}
	ok := Mismatches([]ReconRow{{Name: "openai", Ours: 1000, Their: 998}}, 500)
	if len(ok) != 0 {
		t.Fatal(ok)
	}
	total, byModel := Summarize([]FinLine{{Model: "gpt", Revenue: 10, Cost: 4}, {Model: "gpt", Revenue: 5, Cost: 1}})
	if total.Margin != 10 || byModel["gpt"].Margin != 10 {
		t.Fatal(total)
	}
	amount, yes := AutoTopup(rub(1), rub(2), rub(5), 0, 3)
	if !yes || amount != rub(5) {
		t.Fatal(amount, yes)
	}
	if _, yes := AutoTopup(rub(3), rub(2), rub(5), 0, 3); yes {
		t.Fatal("баланс выше порога")
	}
	inv, found := MatchInvoice("оплата счёта СЧ-15", []Invoice{{Number: "СЧ-15", INN: "7700000000", Amount: rub(10)}})
	if !found || inv.INN == "" {
		t.Fatal(found)
	}
	act := ActFor("7700000000", "2026-11", rub(10))
	if act.Amount != rub(10) {
		t.Fatal(act)
	}
	receipt := FiscalReceipt("pay", "a@edu.fa.ru")
	if receipt.Method != "advance" || receipt.Email == "" {
		t.Fatal(receipt)
	}
	body := []byte(`{"id":"p1","account":"a","amount":1000000}`)
	sig := Sign("secret", body)
	ledger := NewLedger()
	if err := AcceptWebhook(ledger, "secret", body, sig); err != nil {
		t.Fatal(err)
	}
	if err := AcceptWebhook(ledger, "secret", body, sig); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("a") != rub(1) {
		t.Fatal(ledger.Wallet("a"))
	}
	if err := AcceptWebhook(ledger, "secret", body, "00"); err == nil {
		t.Fatal("чужая подпись")
	}
	days := BusinessDays([]AccountDay{{Day: "2026-11-01", Client: "a", Signed: true, Revenue: rub(1), Cost: rub(1)}})
	if days[0].Signups != 1 || days[0].Paying != 1 || days[0].Revenue-days[0].Cost != 0 {
		t.Fatal(days)
	}
	if RetentionBps(map[string]bool{"a": true, "b": true}, map[string]bool{"a": true}) != 5000 {
		t.Fatal("retention")
	}
	tries := 0
	err := Deliver(func(body string) error {
		tries++
		if tries < 3 {
			return ErrState
		}
		return nil
	}, "trace", 3)
	if err != nil || tries != 3 {
		t.Fatal(err, tries)
	}
}
