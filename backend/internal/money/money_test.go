package money

import "testing"

func TestUSDToRUB(t *testing.T) {
	// 1 $ при курсе 90 ₽ и наценке 20 % = 108 ₽
	got := USDToRUB(1*Micro, 90*Micro, 2000)
	if got != 108*Micro {
		t.Fatalf("got %d", got)
	}
	if USDToRUB(0, 90*Micro, 2000) != 0 {
		t.Fatal("zero must stay zero")
	}
}

func TestTokenCost(t *testing.T) {
	// 1500 токенов по $3 за 1M = $0.0045 = 4500 микродолларов
	if got := TokenCost(1500, 3*Micro); got != 4500 {
		t.Fatalf("got %d", got)
	}
	// округление вверх: 1 токен по $0.28 за 1M = 0.28 микродоллара -> 1
	if got := TokenCost(1, 280000); got != 1 {
		t.Fatalf("got %d", got)
	}
}

func TestKopecks(t *testing.T) {
	if FromKopecks(150) != 1_500_000 {
		t.Fatal("150 kop = 1.5 rub")
	}
	if ToKopecksCeil(1) != 1 || ToKopecksCeil(10_000) != 1 || ToKopecksCeil(10_001) != 2 {
		t.Fatal("ceil")
	}
}
