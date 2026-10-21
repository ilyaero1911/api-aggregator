package economics

import "testing"

func TestScenariosStayProfitableAndOrdered(t *testing.T) {
	books := Scenarios()
	order := []string{"pessimistic", "base", "optimistic"}
	var prev int64
	for i, name := range order {
		out, err := Run(books[name])
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if out.Price.Per1M <= out.Price.Cost {
			t.Fatalf("%s: цена %d не покрывает себестоимость %d", name, out.Price.Per1M, out.Price.Cost)
		}
		if out.Price.Per1M%Kopeck != 0 {
			t.Fatalf("%s: цена не кратна копейке", name)
		}
		if out.Contribution <= 0 || out.Clients <= 0 || out.Revenue <= 0 {
			t.Fatalf("%s: нет точки безубыточности %+v", name, out)
		}
		if out.Clients*out.Contribution < books[name].MonthlyFixed {
			t.Fatalf("%s: клиенты не закрывают постоянные расходы", name)
		}
		discount, err := VolumeDiscountBps(books[name].TokensPerClient)
		if err != nil {
			t.Fatal(err)
		}
		if discount != books[name].VolumeDiscountBps {
			t.Fatalf("%s: скидка сценария %d, ступень %d", name, books[name].VolumeDiscountBps, discount)
		}
		if i > 0 && out.Contribution <= prev {
			t.Fatalf("%s: вклад %d не выше предыдущего %d", name, out.Contribution, prev)
		}
		prev = out.Contribution
		t.Logf("%s price_kop=%d clients=%d revenue_rub=%d payback=%d",
			name, out.Price.Per1M/Kopeck, out.Clients, out.Revenue/MinorPerRuble, out.PaybackMonths)
	}
}

func TestGroupMarkupAndCharge(t *testing.T) {
	base := Scenarios()["base"]
	premium, err := GroupMarkup(base.MarkupBps, 2000)
	if err != nil {
		t.Fatal(err)
	}
	economy, err := GroupMarkup(base.MarkupBps, -500)
	if err != nil {
		t.Fatal(err)
	}
	base.MarkupBps = premium
	high, err := Quote(base.Params)
	if err != nil {
		t.Fatal(err)
	}
	base.MarkupBps = economy
	low, err := Quote(base.Params)
	if err != nil {
		t.Fatal(err)
	}
	if !(low.Per1M < high.Per1M) {
		t.Fatalf("группа economy %d не дешевле premium %d", low.Per1M, high.Per1M)
	}

	charge, err := Charge(high.Per1M, 1, Kopeck)
	if err != nil {
		t.Fatal(err)
	}
	if charge != Kopeck {
		t.Fatalf("короткий запрос должен стоить копейку, получили %d", charge)
	}
	full, err := Charge(high.Per1M, Million, Kopeck)
	if err != nil {
		t.Fatal(err)
	}
	if full != high.Per1M {
		t.Fatalf("1M токенов: %d против цены %d", full, high.Per1M)
	}
}

func TestRejectsBadInput(t *testing.T) {
	p := Scenarios()["base"].Params
	p.TaxBps = 7000
	p.AcquiringBps = 4000
	if _, err := Quote(p); err != ErrRate {
		t.Fatalf("налог и комиссия вместе не должны проходить: %v", err)
	}
	p = Scenarios()["base"].Params
	p.ProviderUSDPer1M = -1
	if _, err := Quote(p); err != ErrAmount {
		t.Fatalf("отрицательная цена провайдера: %v", err)
	}
	if _, err := VolumeDiscountBps(-5); err != ErrUsage {
		t.Fatal(err)
	}
	if _, err := Charge(100, -1, Kopeck); err != ErrUsage {
		t.Fatal(err)
	}
}
