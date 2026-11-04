package billing

import "time"

// Usage — фактическое потребление одного запроса.
type Usage struct {
	Input, Output, CacheRead, CacheWrite, Reasoning int64
	Images, AudioSeconds, Requests, WebSearches     int64
}

func (u Usage) valid() bool {
	return u.Input >= 0 && u.Output >= 0 && u.CacheRead >= 0 && u.CacheWrite >= 0 &&
		u.Reasoning >= 0 && u.Images >= 0 && u.AudioSeconds >= 0 && u.Requests >= 0 && u.WebSearches >= 0
}

// Rates — цена за единицу. Для USD это микродоллары, для RUB — minor.
type Rates struct {
	Input, Output, CacheRead, CacheWrite, Reasoning int64
	Image, AudioSecond, Request, WebSearch          int64
}

func (r Rates) valid() bool {
	return r.Input >= 0 && r.Output >= 0 && r.CacheRead >= 0 && r.CacheWrite >= 0 &&
		r.Reasoning >= 0 && r.Image >= 0 && r.AudioSecond >= 0 && r.Request >= 0 && r.WebSearch >= 0
}

func (r Rates) raw(u Usage) (int64, error) {
	if !u.valid() || !r.valid() {
		return 0, ErrAmount
	}
	return u.Input*r.Input + u.Output*r.Output + u.CacheRead*r.CacheRead +
		u.CacheWrite*r.CacheWrite + u.Reasoning*r.Reasoning +
		u.Images*r.Image + u.AudioSeconds*r.AudioSecond +
		u.Requests*r.Request + u.WebSearches*r.WebSearch, nil
}

// Version — прайс, который действует с даты From. Курс зафиксирован в версии.
type Version struct {
	ID        string
	From      time.Time
	Currency  string
	RubPerUSD int64
	Rates     Rates
}

// Catalog — версии прайса и наценки: общая, провайдер, модель, клиент.
type Catalog struct {
	Versions    []Version
	GlobalBps   int64
	ProviderBps map[string]int64
	ModelBps    map[string]int64
	ClientBps   map[string]int64
}

// Priced — стоимость, посчитанная в момент запроса. Позже прайс её не меняет.
type Priced struct {
	VersionID string
	Amount    int64
	RubPerUSD int64
}

func (c Catalog) pick(at time.Time) (Version, bool) {
	var found Version
	ok := false
	for _, v := range c.Versions {
		if v.From.After(at) {
			continue
		}
		if !ok || v.From.After(found.From) {
			found = v
			ok = true
		}
	}
	return found, ok
}

func (c Catalog) Quote(at time.Time, provider, model, client string, u Usage) (Priced, error) {
	v, ok := c.pick(at)
	if !ok {
		return Priced{}, ErrState
	}
	raw, err := v.Rates.raw(u)
	if err != nil {
		return Priced{}, err
	}
	rate := int64(0)
	if v.Currency == "USD" {
		if v.RubPerUSD < 0 {
			return Priced{}, ErrAmount
		}
		rate = v.RubPerUSD
		raw = raw * v.RubPerUSD / USDScale
	}
	layers := []int64{c.GlobalBps}
	if c.ProviderBps != nil {
		layers = append(layers, c.ProviderBps[provider])
	}
	if c.ModelBps != nil {
		layers = append(layers, c.ModelBps[model])
	}
	if c.ClientBps != nil {
		layers = append(layers, c.ClientBps[client])
	}
	for _, bps := range layers {
		if bps <= -Bps {
			return Priced{}, ErrState
		}
		raw = mulDiv(raw, Bps+bps, Bps)
	}
	amount := raw
	if amount > 0 {
		amount = roundUp(amount, Kopeck)
	}
	return Priced{VersionID: v.ID, Amount: amount, RubPerUSD: rate}, nil
}
