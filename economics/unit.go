// Цена модели в рублях за 1M токенов.
//
// Себестоимость = цена провайдера в USD × курс × (1 + валютный риск) + инфраструктура.
// Дальше наценка и скидка за объём.
// Итог = эта сумма / (1 − налог − комиссия эквайринга), вверх до копейки.
package economics

import "errors"

const (
	MinorPerRuble int64 = 1_000_000
	USDScale      int64 = 1_000_000
	Bps           int64 = 10_000
	Kopeck        int64 = 10_000
	Million       int64 = 1_000_000
)

var (
	ErrAmount = errors.New("сумма должна быть неотрицательной")
	ErrRate   = errors.New("ставка вне диапазона")
	ErrUsage  = errors.New("токены должны быть неотрицательными")
)

// Params — вход прайсинга. Деньги в микрорублях и микродолларах, ставки в базисных пунктах.
type Params struct {
	ProviderUSDPer1M  int64
	RubPerUSD         int64
	FXRiskBps         int64
	AcquiringBps      int64
	TaxBps            int64
	InfraPer1M        int64
	MarkupBps         int64
	VolumeDiscountBps int64
	MinCharge         int64
}

// Price — разложение цены за 1M токенов.
type Price struct {
	ProviderRub   int64
	WithFX        int64
	Cost          int64
	AfterMarkup   int64
	AfterDiscount int64
	Per1M         int64
}

// Book — экономика одного сценария на месяц.
type Book struct {
	Params
	MinTopup        int64
	StartBonus      int64
	CAC             int64
	MonthlyFixed    int64
	TokensPerClient int64
}

// Outcome — выручка, вклад и точка безубыточности.
type Outcome struct {
	Price            Price
	RevenuePerClient int64
	CostPerClient    int64
	Contribution     int64
	Clients          int64
	Revenue          int64
	PaybackMonths    int64
}

func Quote(p Params) (Price, error) {
	if p.ProviderUSDPer1M < 0 || p.RubPerUSD < 0 || p.InfraPer1M < 0 || p.MinCharge < 0 {
		return Price{}, ErrAmount
	}
	if p.FXRiskBps < 0 || p.AcquiringBps < 0 || p.TaxBps < 0 || p.MarkupBps < 0 || p.VolumeDiscountBps < 0 {
		return Price{}, ErrRate
	}
	if p.VolumeDiscountBps >= Bps || p.AcquiringBps+p.TaxBps >= Bps {
		return Price{}, ErrRate
	}
	if p.MinCharge == 0 {
		p.MinCharge = Kopeck
	}

	provider := p.ProviderUSDPer1M * p.RubPerUSD / USDScale
	withFX := mulDiv(provider, Bps+p.FXRiskBps, Bps)
	cost := withFX + p.InfraPer1M
	afterMarkup := mulDiv(cost, Bps+p.MarkupBps, Bps)
	afterDiscount := mulDiv(afterMarkup, Bps-p.VolumeDiscountBps, Bps)
	keep := Bps - p.AcquiringBps - p.TaxBps
	raw := mulDivUp(afterDiscount, Bps, keep)
	return Price{
		ProviderRub:   provider,
		WithFX:        withFX,
		Cost:          cost,
		AfterMarkup:   afterMarkup,
		AfterDiscount: afterDiscount,
		Per1M:         roundUp(raw, p.MinCharge),
	}, nil
}

// Charge считает списание за конкретное число токенов по уже посчитанной цене 1M.
func Charge(pricePer1M, tokens, minCharge int64) (int64, error) {
	if tokens < 0 || pricePer1M < 0 || minCharge < 0 {
		return 0, ErrUsage
	}
	if tokens == 0 || pricePer1M == 0 {
		return 0, nil
	}
	if minCharge == 0 {
		minCharge = Kopeck
	}
	raw := mulDivUp(pricePer1M, tokens, Million)
	if raw == 0 {
		raw = minCharge
	}
	return roundUp(raw, minCharge), nil
}

// VolumeDiscountBps — скидка B2B: нет до 10M токенов в месяц, 5% до 100M, дальше 15%.
func VolumeDiscountBps(tokensPerMonth int64) (int64, error) {
	if tokensPerMonth < 0 {
		return 0, ErrUsage
	}
	switch {
	case tokensPerMonth >= 100_000_000:
		return 1500, nil
	case tokensPerMonth >= 10_000_000:
		return 500, nil
	default:
		return 0, nil
	}
}

// GroupMarkup добавляет надбавку группы моделей к базовой наценке.
func GroupMarkup(baseBps, extraBps int64) (int64, error) {
	if baseBps < 0 || extraBps < -baseBps {
		return 0, ErrRate
	}
	return baseBps + extraBps, nil
}

func Run(b Book) (Outcome, error) {
	if b.MinTopup < 0 || b.StartBonus < 0 || b.CAC < 0 || b.MonthlyFixed < 0 || b.TokensPerClient < 0 {
		return Outcome{}, ErrAmount
	}
	price, err := Quote(b.Params)
	if err != nil {
		return Outcome{}, err
	}
	revenue, err := Charge(price.Per1M, b.TokensPerClient, b.MinCharge)
	if err != nil {
		return Outcome{}, err
	}
	cost, err := Charge(price.Cost, b.TokensPerClient, 1)
	if err != nil {
		return Outcome{}, err
	}
	contribution := revenue - cost
	if contribution < 0 {
		contribution = 0
	}
	clients := int64(0)
	totalRevenue := int64(0)
	if contribution > 0 && b.MonthlyFixed > 0 {
		clients = (b.MonthlyFixed + contribution - 1) / contribution
		totalRevenue = clients * revenue
	}
	payback := int64(0)
	if contribution > 0 {
		need := b.CAC + b.StartBonus
		if need > 0 {
			payback = (need + contribution - 1) / contribution
		}
	}
	return Outcome{
		Price:            price,
		RevenuePerClient: revenue,
		CostPerClient:    cost,
		Contribution:     contribution,
		Clients:          clients,
		Revenue:          totalRevenue,
		PaybackMonths:    payback,
	}, nil
}

func mulDiv(a, b, d int64) int64 {
	if d == 0 {
		return 0
	}
	return a * b / d
}

func mulDivUp(a, b, d int64) int64 {
	if a == 0 || b == 0 || d == 0 {
		return 0
	}
	return (a*b + d - 1) / d
}

func roundUp(amount, unit int64) int64 {
	if amount <= 0 {
		return 0
	}
	if unit <= 1 {
		return amount
	}
	return ((amount + unit - 1) / unit) * unit
}
