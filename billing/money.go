package billing

import "errors"

const (
	MinorPerRuble int64 = 1_000_000
	USDScale      int64 = 1_000_000
	Bps           int64 = 10_000
	Kopeck        int64 = 10_000
)

var (
	ErrAmount       = errors.New("сумма должна быть неотрицательной")
	ErrFunds        = errors.New("не хватает средств")
	ErrBudget       = errors.New("бюджет ключа исчерпан")
	ErrState        = errors.New("операция невозможна")
	ErrPromo        = errors.New("промокод не подходит")
	ErrSameApprover = errors.New("второе подтверждение должен дать другой человек")
)

func mulDiv(a, b, d int64) int64 {
	if a == 0 || b == 0 || d == 0 {
		return 0
	}
	return a * b / d
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

func abs(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
