// Package billing: баланс, транзакции, тарифы, промокоды и зачисление платежей.
// Все изменения баланса идут в одной транзакции Postgres вместе с записью в transactions.
package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ilyaero1911/api-aggregator/backend/internal/money"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

var (
	ErrInsufficient = errors.New("insufficient_balance")
	ErrPromoInvalid = errors.New("promo_invalid")
	ErrPromoUsed    = errors.New("promo_already_used")
	ErrPlanNotFound = errors.New("plan_not_found")
)

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func New(pool *pgxpool.Pool) *Service { return &Service{pool: pool, q: db.New(pool)} }

func (s *Service) tx(ctx context.Context, fn func(q *db.Queries) error) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return fn(db.New(tx)) })
}

// Post меняет баланс на amount (может быть отрицательным) и пишет проводку.
func post(ctx context.Context, q *db.Queries, user uuid.UUID, kind string, amount int64, desc, ref string) (int64, error) {
	if err := q.EnsureWallet(ctx, user); err != nil {
		return 0, err
	}
	bal, err := q.AddBalance(ctx, db.AddBalanceParams{UserID: user, Amount: amount})
	if err != nil {
		return 0, err
	}
	_, err = q.InsertTransaction(ctx, db.InsertTransactionParams{
		UserID: user, Kind: kind, AmountMicro: amount, BalanceAfterMicro: bal, Description: desc, Ref: ref,
	})
	return bal, err
}

func (s *Service) Credit(ctx context.Context, user uuid.UUID, kind string, amount int64, desc, ref string) (int64, error) {
	var bal int64
	err := s.tx(ctx, func(q *db.Queries) (err error) {
		bal, err = post(ctx, q, user, kind, amount, desc, ref)
		return err
	})
	return bal, err
}

// Charge списывает стоимость запроса. Баланс может уйти немного в минус на последнем запросе:
// перед запросом шлюз проверяет, что баланс положительный (как у OpenRouter).
func (s *Service) Charge(ctx context.Context, user uuid.UUID, amount int64, desc, ref string) (int64, error) {
	if amount <= 0 {
		w, err := s.q.GetWallet(ctx, user)
		return w.BalanceMicro, err
	}
	return s.Credit(ctx, user, "charge", -amount, desc, ref)
}

// BuyPlanFromBalance оплачивает тариф с баланса.
func (s *Service) BuyPlanFromBalance(ctx context.Context, user uuid.UUID, planID string) (db.Subscription, error) {
	var sub db.Subscription
	err := s.tx(ctx, func(q *db.Queries) error {
		plan, err := q.GetPlan(ctx, planID)
		if err != nil || !plan.Active {
			return ErrPlanNotFound
		}
		price := money.FromKopecks(plan.PriceKopecks)
		if err := q.EnsureWallet(ctx, user); err != nil {
			return err
		}
		w, err := q.GetWallet(ctx, user)
		if err != nil {
			return err
		}
		if w.BalanceMicro < price {
			return ErrInsufficient
		}
		if price > 0 {
			if _, err := post(ctx, q, user, "plan", -price, "Тариф "+plan.NameRu, plan.ID); err != nil {
				return err
			}
		}
		sub, err = activate(ctx, q, user, plan)
		return err
	})
	return sub, err
}

func activate(ctx context.Context, q *db.Queries, user uuid.UUID, plan db.Plan) (db.Subscription, error) {
	if err := q.CancelActiveSubscription(ctx, user); err != nil {
		return db.Subscription{}, err
	}
	return q.CreateSubscription(ctx, db.CreateSubscriptionParams{
		UserID: user, PlanID: plan.ID, EndsAt: time.Now().Add(time.Duration(plan.PeriodDays) * 24 * time.Hour),
	})
}

// RedeemPromo начисляет бонус по промокоду один раз на пользователя.
func (s *Service) RedeemPromo(ctx context.Context, user uuid.UUID, code string) (int64, error) {
	var amount int64
	err := s.tx(ctx, func(q *db.Queries) error {
		p, err := q.GetPromoForUpdate(ctx, code)
		if err != nil {
			return ErrPromoInvalid
		}
		if p.Used >= p.MaxUses || (p.ExpiresAt != nil && p.ExpiresAt.Before(time.Now())) {
			return ErrPromoInvalid
		}
		n, err := q.InsertPromoRedemption(ctx, db.InsertPromoRedemptionParams{Code: p.Code, UserID: user})
		if err != nil {
			return err
		}
		if n == 0 {
			return ErrPromoUsed
		}
		if err := q.IncPromoUse(ctx, p.Code); err != nil {
			return err
		}
		amount = p.AmountMicro
		_, err = post(ctx, q, user, "promo", p.AmountMicro, "Промокод "+p.Code, p.Code)
		return err
	})
	return amount, err
}

// CompletePayment зачисляет успешный платёж. Повторный вызов ничего не делает.
func (s *Service) CompletePayment(ctx context.Context, id uuid.UUID) (db.Payment, error) {
	var pay db.Payment
	err := s.tx(ctx, func(q *db.Queries) error {
		var err error
		pay, err = q.GetPaymentForUpdate(ctx, id)
		if err != nil {
			return err
		}
		if pay.Status != "pending" {
			return nil
		}
		if err := q.SetPaymentStatus(ctx, db.SetPaymentStatusParams{ID: id, Status: "succeeded"}); err != nil {
			return err
		}
		pay.Status = "succeeded"
		amount := money.FromKopecks(pay.AmountKopecks)
		switch pay.Purpose {
		case "topup":
			_, err = post(ctx, q, pay.UserID, "topup", amount, "Пополнение баланса", pay.ID.String())
			return err
		case "plan":
			if pay.PlanID == nil {
				return ErrPlanNotFound
			}
			plan, err := q.GetPlan(ctx, *pay.PlanID)
			if err != nil {
				return ErrPlanNotFound
			}
			// деньги проходят через баланс, чтобы в истории было видно и зачисление, и покупку
			if _, err := post(ctx, q, pay.UserID, "topup", amount, "Оплата тарифа "+plan.NameRu, pay.ID.String()); err != nil {
				return err
			}
			if _, err := post(ctx, q, pay.UserID, "plan", -amount, "Тариф "+plan.NameRu, plan.ID); err != nil {
				return err
			}
			_, err = activate(ctx, q, pay.UserID, plan)
			return err
		}
		return fmt.Errorf("unknown purpose %q", pay.Purpose)
	})
	return pay, err
}

func (s *Service) FailPayment(ctx context.Context, id uuid.UUID, status string) error {
	return s.tx(ctx, func(q *db.Queries) error {
		pay, err := q.GetPaymentForUpdate(ctx, id)
		if err != nil {
			return err
		}
		if pay.Status != "pending" {
			return nil
		}
		return q.SetPaymentStatus(ctx, db.SetPaymentStatusParams{ID: id, Status: status})
	})
}

// Adjust — ручная корректировка из админки.
func (s *Service) Adjust(ctx context.Context, user uuid.UUID, amount int64, reason string) (int64, error) {
	return s.Credit(ctx, user, "adjust", amount, reason, "admin")
}

// GrantPlan — выдать тариф без оплаты (админка).
func (s *Service) GrantPlan(ctx context.Context, user uuid.UUID, planID string) (db.Subscription, error) {
	var sub db.Subscription
	err := s.tx(ctx, func(q *db.Queries) error {
		plan, err := q.GetPlan(ctx, planID)
		if err != nil {
			return ErrPlanNotFound
		}
		sub, err = activate(ctx, q, user, plan)
		return err
	})
	return sub, err
}
