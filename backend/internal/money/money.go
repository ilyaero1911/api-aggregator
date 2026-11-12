// Package money: все суммы в микрорублях (1 ₽ = 1 000 000), цены провайдеров в микродолларах за 1 млн токенов.
package money

const (
	Micro        int64 = 1_000_000
	KopeckMicro  int64 = 10_000 // 1 копейка в микрорублях
	PerMillion   int64 = 1_000_000
	BpsDenom     int64 = 10_000
)

// FromKopecks переводит копейки в микрорубли.
func FromKopecks(k int64) int64 { return k * KopeckMicro }

// ToKopecksCeil округляет микрорубли вверх до копеек.
func ToKopecksCeil(m int64) int64 {
	if m <= 0 {
		return 0
	}
	return (m + KopeckMicro - 1) / KopeckMicro
}

// USDToRUB переводит микродоллары в микрорубли по курсу rubMicro (рублей за 1 $ в микрорублях)
// и применяет наценку в базисных пунктах. Округление вверх, чтобы не продавать в минус.
func USDToRUB(usdMicro, rubMicro, markupBps int64) int64 {
	if usdMicro <= 0 {
		return 0
	}
	// usdMicro * rubMicro / 1e6 даёт микрорубли; считаем в big-safe порядке.
	rub := mulDivCeil(usdMicro, rubMicro, Micro)
	return mulDivCeil(rub, BpsDenom+markupBps, BpsDenom)
}

// TokenCost — стоимость n токенов при цене pricePerM микродолларов за 1 млн токенов, в микродолларах.
func TokenCost(n int64, pricePerM int64) int64 {
	return mulDivCeil(n, pricePerM, PerMillion)
}

func mulDivCeil(a, b, d int64) int64 {
	if a <= 0 || b <= 0 {
		return 0
	}
	// защищаемся от переполнения: при больших значениях делим заранее
	if a > 1<<31 && b > 1<<31 {
		return (a/d)*b + mulDivCeil(a%d, b, d)
	}
	p := a * b
	return (p + d - 1) / d
}
