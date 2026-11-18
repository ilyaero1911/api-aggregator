package billing

import "testing"

func TestPersonReceiptCompanyDocumentsAndAutopay(t *testing.T) {
	ledger := NewLedger()
	box := &Outbox{}
	payment := Payment{ID: "p1", Account: "person", Amount: rub(10), Status: "succeeded", Method: "sbp"}
	if err := box.ConfirmPerson(ledger, payment, "a@edu.fa.ru"); err != nil {
		t.Fatal(err)
	}
	if err := box.ConfirmPerson(ledger, payment, "a@edu.fa.ru"); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("person") != rub(10) || len(box.Receipts) != 1 || len(box.Emails) != 1 {
		t.Fatalf("wallet %d receipts %d", ledger.Wallet("person"), len(box.Receipts))
	}
	if box.Receipts[0].Method != "advance" {
		t.Fatal(box.Receipts[0])
	}
	canceled := Payment{ID: "p2", Account: "person", Amount: rub(5), Status: "canceled", Method: "card"}
	if err := box.ConfirmPerson(ledger, canceled, "a@edu.fa.ru"); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("person") != rub(10) {
		t.Fatal("отмена зачислила деньги")
	}

	contract, err := NewContract("д-1", "7700000000", true, rub(100))
	if err != nil {
		t.Fatal(err)
	}
	invoice, err := IssueInvoice(contract, "СЧ-15", rub(20))
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyBank(ledger, "company", "оплата СЧ-15 без НДС", []Invoice{invoice}); err != nil {
		t.Fatal(err)
	}
	if err := ApplyBank(ledger, "company", "оплата СЧ-15 без НДС", []Invoice{invoice}); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("company") != rub(20) {
		t.Fatal(ledger.Wallet("company"))
	}
	if err := box.CloseMonth(contract.INN, "2026-11", rub(7)); err != nil {
		t.Fatal(err)
	}
	if len(box.EDO) != 2 {
		t.Fatal(box.EDO)
	}

	rule := &Autopay{Threshold: rub(30), Amount: rub(15), Cap: 2}
	if err := box.RunAutopay(ledger, "person", ledger.Wallet("person"), rule, true); err != nil {
		t.Fatal(err)
	}
	if ledger.Wallet("person") != rub(25) || rule.Done != 1 {
		t.Fatalf("wallet %d done %d", ledger.Wallet("person"), rule.Done)
	}
	if err := box.RunAutopay(ledger, "person", rub(1), rule, false); err != ErrState {
		t.Fatal(err)
	}
	foundLow, foundFail := false, false
	for _, note := range box.Notices {
		if note == "low:person" {
			foundLow = true
		}
		if note == "fail:person" {
			foundFail = true
		}
	}
	if !foundLow || !foundFail {
		t.Fatal(box.Notices)
	}
	if !ledger.Balanced() {
		t.Fatal("проводки не сходятся")
	}
}

func TestDashboardMatchesFinance(t *testing.T) {
	lines := []FinLine{
		{Client: "a", Model: "gpt", Revenue: rub(10), Cost: rub(4)},
		{Client: "b", Model: "gpt", Revenue: rub(3), Cost: rub(1)},
	}
	days := BusinessDays([]AccountDay{
		{Day: "2026-11-01", Client: "a", Signed: true, Revenue: rub(10), Cost: rub(4)},
		{Day: "2026-11-01", Client: "b", Signed: true, Revenue: rub(3), Cost: rub(1)},
	})
	if !DashboardAgrees(days, lines) {
		t.Fatal("дашборд не сходится с отчётом")
	}
	top := TopClients(lines, 1)
	if len(top) != 1 || top[0].Client != "a" || top[0].Margin != rub(6) {
		t.Fatalf("%+v", top)
	}
}
