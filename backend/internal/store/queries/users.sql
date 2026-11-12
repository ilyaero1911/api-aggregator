-- name: CreateUser :one
INSERT INTO users (email, name, password_hash, google_sub, avatar_url, role, locale)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE lower(email) = lower(@email::text);

-- name: GetUserByGoogleSub :one
SELECT * FROM users WHERE google_sub = $1;

-- name: LinkGoogle :exec
UPDATE users SET google_sub = $2, avatar_url = CASE WHEN avatar_url = '' THEN $3 ELSE avatar_url END WHERE id = $1;

-- name: TouchLogin :exec
UPDATE users SET last_login_at = now() WHERE id = $1;

-- name: UpdateProfile :one
UPDATE users SET name = $2, locale = $3, log_prompts = $4, cache_enabled = $5 WHERE id = $1 RETURNING *;

-- name: SetPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: CountUsers :one
SELECT count(*) FROM users;

-- name: AdminListUsers :many
SELECT u.*, coalesce(w.balance_micro, 0)::bigint AS balance_micro,
       (SELECT s.plan_id FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'active' LIMIT 1)::text AS plan_id
FROM users u LEFT JOIN wallets w ON w.user_id = u.id
WHERE (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR u.name ILIKE '%' || @q || '%')
ORDER BY u.created_at DESC
LIMIT @lim OFFSET @off;

-- name: AdminCountUsers :one
SELECT count(*) FROM users u
WHERE (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR u.name ILIKE '%' || @q || '%');

-- name: AdminSetUserStatus :exec
UPDATE users SET status = $2 WHERE id = $1;

-- name: AdminSetUserRole :exec
UPDATE users SET role = $2 WHERE id = $1;

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, user_agent, ip, expires_at) VALUES ($1, $2, $3, $4, $5);

-- name: GetSessionUser :one
SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.expires_at > now();

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = $1;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = $1;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at < now();

-- name: InsertAudit :exec
INSERT INTO audit_log (actor_id, action, target, details) VALUES ($1, $2, $3, $4);

-- name: ListAudit :many
SELECT a.*, coalesce(u.email, '')::text AS actor_email FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
ORDER BY a.id DESC LIMIT $1;
