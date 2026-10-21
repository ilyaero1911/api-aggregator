package economics

// Сценарии на один месяц. Общее: провайдер $3 за 1M, курс 92,50 ₽, налог 6%, копейка.
func Scenarios() map[string]Book {
	common := Params{
		ProviderUSDPer1M: 3 * USDScale,
		RubPerUSD:        92_500_000,
		TaxBps:           600,
		MinCharge:        Kopeck,
	}
	return map[string]Book{
		"pessimistic": {
			Params: merge(common, Params{
				FXRiskBps:         800,
				AcquiringBps:      350,
				InfraPer1M:        8 * MinorPerRuble,
				MarkupBps:         2500,
				VolumeDiscountBps: 0,
			}),
			MinTopup:        500 * MinorPerRuble,
			StartBonus:      0,
			CAC:             800 * MinorPerRuble,
			MonthlyFixed:    150_000 * MinorPerRuble,
			TokensPerClient: 2 * Million,
		},
		"base": {
			Params: merge(common, Params{
				FXRiskBps:         300,
				AcquiringBps:      200,
				InfraPer1M:        3 * MinorPerRuble,
				MarkupBps:         4000,
				VolumeDiscountBps: 500,
			}),
			MinTopup:        300 * MinorPerRuble,
			StartBonus:      50 * MinorPerRuble,
			CAC:             400 * MinorPerRuble,
			MonthlyFixed:    80_000 * MinorPerRuble,
			TokensPerClient: 10 * Million,
		},
		"optimistic": {
			Params: merge(common, Params{
				FXRiskBps:         100,
				AcquiringBps:      100,
				InfraPer1M:        1 * MinorPerRuble,
				MarkupBps:         3500,
				VolumeDiscountBps: 1500,
			}),
			MinTopup:        100 * MinorPerRuble,
			StartBonus:      100 * MinorPerRuble,
			CAC:             150 * MinorPerRuble,
			MonthlyFixed:    30_000 * MinorPerRuble,
			TokensPerClient: 100 * Million,
		},
	}
}

func merge(base, over Params) Params {
	out := base
	out.FXRiskBps = over.FXRiskBps
	out.AcquiringBps = over.AcquiringBps
	out.InfraPer1M = over.InfraPer1M
	out.MarkupBps = over.MarkupBps
	out.VolumeDiscountBps = over.VolumeDiscountBps
	return out
}
