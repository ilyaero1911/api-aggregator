package fx

import (
	"testing"

	"golang.org/x/text/encoding/charmap"
)

func TestParseCBR(t *testing.T) {
	src := `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="12.11.2026" name="Foreign Currency Market">
<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>81,4567</Value></Valute>
<Valute ID="R01375"><NumCode>156</NumCode><CharCode>CNY</CharCode><Nominal>10</Nominal><Name>Юань</Name><Value>112,3000</Value></Valute>
</ValCurs>`
	body, _ := charmap.Windows1251.NewEncoder().String(src)
	m, err := ParseCBR([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if m["USD"].RubMicro != 81_456_700 {
		t.Fatalf("usd %d", m["USD"].RubMicro)
	}
	if m["CNY"].RubMicro != 11_230_000 {
		t.Fatalf("cny %d", m["CNY"].RubMicro)
	}
	if m["USD"].Date.Format("2006-01-02") != "2026-11-12" {
		t.Fatal("date")
	}
}

func TestParseBackup(t *testing.T) {
	m, err := ParseBackup([]byte(`{"Date":"2026-11-12T11:30:00+03:00","Valute":{"USD":{"Nominal":1,"Value":81.5},"EUR":{"Nominal":1,"Value":94.25}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if m["USD"].RubMicro != 81_500_000 || m["EUR"].RubMicro != 94_250_000 {
		t.Fatal(m)
	}
}

func TestParseBackupWithoutUSD(t *testing.T) {
	if _, err := ParseBackup([]byte(`{"Valute":{}}`)); err == nil {
		t.Fatal("expected error")
	}
}
