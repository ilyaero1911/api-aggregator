package billing

import "time"

// Budget — лимит расходов ключа на период. Баланс аккаунта этот лимит не сжигает.
type Budget struct {
	Limit         int64
	Period        time.Duration
	Start         time.Time
	Hard          bool
	Used, Held    int64
	Notices       []string
	saw80, saw100 bool
}

func (b *Budget) roll(now time.Time) {
	if b.Period <= 0 || b.Start.IsZero() || now.Before(b.Start.Add(b.Period)) {
		return
	}
	steps := int64(now.Sub(b.Start) / b.Period)
	if steps < 1 {
		return
	}
	b.Start = b.Start.Add(time.Duration(steps) * b.Period)
	b.Used = 0
	b.Held = 0
	b.saw80 = false
	b.saw100 = false
}

func (b *Budget) note(used int64) {
	if b.Limit <= 0 {
		return
	}
	if !b.saw80 && used*100 >= b.Limit*80 {
		b.saw80 = true
		b.Notices = append(b.Notices, "80")
	}
	if !b.saw100 && used >= b.Limit {
		b.saw100 = true
		b.Notices = append(b.Notices, "100")
	}
}

func (b *Budget) Reserve(now time.Time, estimate int64) error {
	if estimate < 0 {
		return ErrAmount
	}
	b.roll(now)
	next := b.Used + b.Held + estimate
	if b.Hard && next > b.Limit {
		return ErrBudget
	}
	b.Held += estimate
	b.note(next)
	return nil
}

func (b *Budget) Capture(estimate, actual int64) {
	if estimate > b.Held {
		estimate = b.Held
	}
	b.Held -= estimate
	b.Used += actual
	b.note(b.Used + b.Held)
}

func (b *Budget) Release(estimate int64) {
	if estimate > b.Held {
		estimate = b.Held
	}
	b.Held -= estimate
}

func (b *Budget) Remain(now time.Time) int64 {
	b.roll(now)
	left := b.Limit - b.Used - b.Held
	if left < 0 {
		return 0
	}
	return left
}

func (b *Budget) ResetAt(now time.Time) time.Time {
	b.roll(now)
	if b.Period <= 0 {
		return time.Time{}
	}
	return b.Start.Add(b.Period)
}

// Credits — ответ GET /v1/credits.
type Credits struct {
	Balance int64
	Bonus   int64
	Used    int64
}

// KeyInfo — ответ GET /v1/key.
type KeyInfo struct {
	Limit     int64
	Used      int64
	Remain    int64
	Reset     time.Time
	Hard      bool
	Tier      string
	RateLimit int
}

func CreditsOf(wallet, bonus, used int64) Credits {
	return Credits{Balance: wallet, Bonus: bonus, Used: used}
}

func KeyInfoOf(b Budget, now time.Time, tier string, rateLimit int) KeyInfo {
	return KeyInfo{
		Limit: b.Limit, Used: b.Used, Remain: b.Remain(now), Reset: b.ResetAt(now),
		Hard: b.Hard, Tier: tier, RateLimit: rateLimit,
	}
}
