-- name: EnsureWallet :exec
INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING;

-- name: GetWallet :one
SELECT * FROM wallets WHERE user_id = $1;

-- name: AddBalance :one
UPDATE wallets SET balance_micro = balance_micro + @amount, updated_at = now()
WHERE user_id = @user_id RETURNING balance_micro;

-- name: UpdateWalletSettings :one
UPDATE wallets SET low_balance_alert = $2, low_balance_micro = $3, auto_topup = $4,
    auto_topup_below_micro = $5, auto_topup_amount_micro = $6, updated_at = now()
WHERE user_id = $1 RETURNING *;

-- name: InsertTransaction :one
INSERT INTO transactions (user_id, kind, amount_micro, balance_after_micro, description, ref)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: ListTransactions :many
SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: CountTransactions :one
SELECT count(*) FROM transactions WHERE user_id = $1;

-- name: GetActiveSubscription :one
SELECT s.*, p.name_ru, p.name_en, p.token_quota, p.daily_free_requests, p.concurrency
FROM subscriptions s JOIN plans p ON p.id = s.plan_id
WHERE s.user_id = $1 AND s.status = 'active' AND s.ends_at > now()
LIMIT 1;

-- name: ExpireSubscriptions :execrows
UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND ends_at <= now();

-- name: CancelActiveSubscription :exec
UPDATE subscriptions SET status = 'canceled' WHERE user_id = $1 AND status = 'active';

-- name: CreateSubscription :one
INSERT INTO subscriptions (user_id, plan_id, ends_at) VALUES ($1, $2, $3) RETURNING *;

-- name: AddSubscriptionTokens :exec
UPDATE subscriptions SET tokens_used = tokens_used + @tokens WHERE id = @id;

-- name: ListSubscriptions :many
SELECT s.*, p.name_ru, p.name_en FROM subscriptions s JOIN plans p ON p.id = s.plan_id
WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 20;

-- name: CreatePayment :one
INSERT INTO payments (user_id, provider, purpose, plan_id, amount_kopecks)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: SetPaymentExternal :one
UPDATE payments SET external_id = $2, confirmation_url = $3 WHERE id = $1 RETURNING *;

-- name: GetPayment :one
SELECT * FROM payments WHERE id = $1;

-- name: GetPaymentForUpdate :one
SELECT * FROM payments WHERE id = $1 FOR UPDATE;

-- name: SetPaymentStatus :exec
UPDATE payments SET status = $2, paid_at = CASE WHEN $2 = 'succeeded' THEN now() ELSE paid_at END WHERE id = $1;

-- name: ListUserPayments :many
SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50;

-- name: AdminListPayments :many
SELECT p.*, u.email FROM payments p JOIN users u ON u.id = p.user_id
WHERE (@status::text = '' OR p.status = @status)
ORDER BY p.created_at DESC LIMIT @lim OFFSET @off;

-- name: GetPromoForUpdate :one
SELECT * FROM promo_codes WHERE upper(code) = upper(@code::text) FOR UPDATE;

-- name: InsertPromoRedemption :execrows
INSERT INTO promo_redemptions (code, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;

-- name: IncPromoUse :exec
UPDATE promo_codes SET used = used + 1 WHERE code = $1;

-- name: ListPromos :many
SELECT * FROM promo_codes ORDER BY created_at DESC;

-- name: CreatePromo :one
INSERT INTO promo_codes (code, amount_micro, max_uses, expires_at) VALUES ($1, $2, $3, $4) RETURNING *;

-- name: DeletePromo :exec
DELETE FROM promo_codes WHERE code = $1;
