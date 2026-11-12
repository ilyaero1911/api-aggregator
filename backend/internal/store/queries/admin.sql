-- name: AdminUsersFull :many
SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.status, u.locale, u.created_at, u.last_login_at, u.admin_note,
       (u.password_hash IS NOT NULL)::boolean AS has_password, (u.google_sub IS NOT NULL)::boolean AS has_google,
       coalesce(w.balance_micro, 0)::bigint AS balance_micro,
       coalesce(s.plan_id, '')::text AS plan_id,
       s.ends_at AS plan_ends_at,
       coalesce(r.requests, 0)::bigint AS requests_30d,
       coalesce(r.spend, 0)::bigint AS spend_30d,
       coalesce(r.last_request_at, 'epoch'::timestamptz)::timestamptz AS last_request_at,
       coalesce(p.paid, 0)::bigint AS paid_kopecks,
       (SELECT count(*) FROM api_keys k WHERE k.user_id = u.id AND k.revoked_at IS NULL AND k.kind = 'inference')::bigint AS keys
FROM users u
LEFT JOIN wallets w ON w.user_id = u.id
LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
LEFT JOIN LATERAL (
    SELECT count(*) AS requests, sum(cost_micro) AS spend, max(created_at) AS last_request_at
    FROM requests WHERE user_id = u.id AND created_at >= now() - interval '30 days'
) r ON true
LEFT JOIN LATERAL (
    SELECT sum(amount_kopecks) AS paid FROM payments WHERE user_id = u.id AND status = 'succeeded'
) p ON true
WHERE (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR u.name ILIKE '%' || @q || '%' OR u.id::text = @q)
  AND (@role::text = '' OR u.role = @role)
  AND (@status::text = '' OR u.status = @status)
  AND (@plan::text = '' OR (@plan = 'none' AND s.plan_id IS NULL) OR s.plan_id = @plan)
ORDER BY
  CASE WHEN @sort::text = 'balance' THEN coalesce(w.balance_micro, 0) END DESC NULLS LAST,
  CASE WHEN @sort::text = 'spend' THEN coalesce(r.spend, 0) END DESC NULLS LAST,
  CASE WHEN @sort::text = 'requests' THEN coalesce(r.requests, 0) END DESC NULLS LAST,
  CASE WHEN @sort::text = 'paid' THEN coalesce(p.paid, 0) END DESC NULLS LAST,
  CASE WHEN @sort::text = 'active' THEN r.last_request_at END DESC NULLS LAST,
  u.created_at DESC
LIMIT @lim OFFSET @off;

-- name: AdminUsersCount :one
SELECT count(*) FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
WHERE (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR u.name ILIKE '%' || @q || '%' OR u.id::text = @q)
  AND (@role::text = '' OR u.role = @role)
  AND (@status::text = '' OR u.status = @status)
  AND (@plan::text = '' OR (@plan = 'none' AND s.plan_id IS NULL) OR s.plan_id = @plan);

-- name: AdminUpdateUser :one
UPDATE users SET name = $2, email = $3, role = $4, status = $5, locale = $6, admin_note = $7 WHERE id = $1 RETURNING *;

-- name: AdminUserSessions :many
SELECT user_agent, ip, created_at, expires_at FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC LIMIT 20;

-- name: AdminListSubscriptions :many
SELECT s.*, u.email, p.name_ru, p.token_quota FROM subscriptions s
JOIN users u ON u.id = s.user_id JOIN plans p ON p.id = s.plan_id
WHERE (@status::text = '' OR s.status = @status) AND (@plan::text = '' OR s.plan_id = @plan)
  AND (@q::text = '' OR u.email ILIKE '%' || @q || '%')
ORDER BY s.created_at DESC LIMIT @lim OFFSET @off;

-- name: AdminGetSubscription :one
SELECT * FROM subscriptions WHERE id = $1;

-- name: AdminUpdateSubscription :one
UPDATE subscriptions SET plan_id = $2, status = $3, ends_at = $4, tokens_used = $5 WHERE id = $1 RETURNING *;

-- name: AdminListKeys :many
SELECT k.*, u.email FROM api_keys k JOIN users u ON u.id = k.user_id
WHERE (@user_id::text = '' OR k.user_id::text = @user_id)
  AND (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR k.name ILIKE '%' || @q || '%' OR k.prefix ILIKE '%' || @q || '%')
  AND (@revoked::boolean OR k.revoked_at IS NULL)
ORDER BY k.created_at DESC LIMIT @lim OFFSET @off;

-- name: AdminUpdateKey :one
UPDATE api_keys SET name = $2, limit_micro = $3, limit_reset = $4, rpm_limit = $5, disabled = $6, expires_at = $7
WHERE id = $1 RETURNING *;

-- name: AdminRevokeKey :exec
UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL;

-- name: AdminListTransactions :many
SELECT t.*, u.email FROM transactions t JOIN users u ON u.id = t.user_id
WHERE (@kind::text = '' OR t.kind = @kind)
  AND (@user_id::text = '' OR t.user_id::text = @user_id)
  AND (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR t.description ILIKE '%' || @q || '%')
ORDER BY t.created_at DESC LIMIT @lim OFFSET @off;

-- name: AdminListPaymentsFull :many
SELECT p.*, u.email FROM payments p JOIN users u ON u.id = p.user_id
WHERE (@status::text = '' OR p.status = @status)
  AND (@user_id::text = '' OR p.user_id::text = @user_id)
  AND (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR p.external_id ILIKE '%' || @q || '%')
ORDER BY p.created_at DESC LIMIT @lim OFFSET @off;

-- name: AdminPaymentTotals :many
SELECT status, count(*)::bigint AS n, coalesce(sum(amount_kopecks), 0)::bigint AS kopecks
FROM payments WHERE created_at >= @since GROUP BY status;

-- name: AdminDailyFull :many
WITH days AS (
  SELECT generate_series(date_trunc('day', now()) - make_interval(days => $1::int - 1), date_trunc('day', now()), interval '1 day') AS d
)
SELECT days.d::timestamptz AS bucket,
  (SELECT count(*) FROM users WHERE created_at >= days.d AND created_at < days.d + interval '1 day')::bigint AS signups,
  (SELECT count(*) FROM requests WHERE created_at >= days.d AND created_at < days.d + interval '1 day')::bigint AS requests,
  (SELECT count(*) FROM requests WHERE created_at >= days.d AND created_at < days.d + interval '1 day' AND status >= 400)::bigint AS errors,
  (SELECT coalesce(sum(cost_micro), 0) FROM requests WHERE created_at >= days.d AND created_at < days.d + interval '1 day')::bigint AS spend_micro,
  (SELECT coalesce(sum(prompt_tokens + completion_tokens), 0) FROM requests WHERE created_at >= days.d AND created_at < days.d + interval '1 day')::bigint AS tokens,
  (SELECT coalesce(sum(amount_kopecks), 0) FROM payments WHERE status = 'succeeded' AND paid_at >= days.d AND paid_at < days.d + interval '1 day')::bigint AS paid_kopecks,
  (SELECT count(DISTINCT user_id) FROM requests WHERE created_at >= days.d AND created_at < days.d + interval '1 day')::bigint AS active_users
FROM days ORDER BY 1;

-- name: AdminTopUsers :many
SELECT u.id, u.email, count(r.*)::bigint AS requests, coalesce(sum(r.cost_micro), 0)::bigint AS spend_micro,
       coalesce(sum(r.prompt_tokens + r.completion_tokens), 0)::bigint AS tokens
FROM requests r JOIN users u ON u.id = r.user_id
WHERE r.created_at >= @since
GROUP BY u.id, u.email ORDER BY spend_micro DESC, requests DESC LIMIT 10;

-- name: AdminPlanStats :many
SELECT p.id, p.name_ru, count(s.*) FILTER (WHERE s.status = 'active')::bigint AS active,
       count(s.*)::bigint AS total
FROM plans p LEFT JOIN subscriptions s ON s.plan_id = p.id GROUP BY p.id, p.name_ru ORDER BY p.sort;

-- name: AdminTotals :one
SELECT
  (SELECT coalesce(sum(balance_micro), 0) FROM wallets)::bigint AS balances_micro,
  (SELECT count(*) FROM users WHERE status = 'blocked')::bigint AS blocked,
  (SELECT count(*) FROM api_keys WHERE revoked_at IS NULL AND kind = 'inference')::bigint AS keys,
  (SELECT count(*) FROM payments WHERE status = 'pending')::bigint AS pending_payments,
  (SELECT count(DISTINCT user_id) FROM requests WHERE created_at >= now() - interval '7 days')::bigint AS active_7d;

-- name: CountPlanSubscriptions :one
SELECT count(*) FROM subscriptions WHERE plan_id = $1;

-- name: DeletePlan :exec
DELETE FROM plans WHERE id = $1;

-- name: AdminSetPaymentStatus :exec
UPDATE payments SET status = $2 WHERE id = $1;
