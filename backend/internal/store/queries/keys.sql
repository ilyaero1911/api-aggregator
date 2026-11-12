-- name: CreateKey :one
INSERT INTO api_keys (user_id, kind, name, prefix, secret_hash, limit_micro, limit_reset, rpm_limit, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListKeys :many
SELECT * FROM api_keys WHERE user_id = $1 AND kind = $2 AND revoked_at IS NULL ORDER BY created_at DESC;

-- name: GetKey :one
SELECT * FROM api_keys WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL;

-- name: GetKeyBySecret :one
SELECT k.*, u.status AS user_status, u.log_prompts AS user_log_prompts
FROM api_keys k JOIN users u ON u.id = k.user_id
WHERE k.secret_hash = $1 AND k.revoked_at IS NULL;

-- name: UpdateKey :one
UPDATE api_keys SET name = $3, limit_micro = $4, limit_reset = $5, rpm_limit = $6, disabled = $7, expires_at = $8
WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
RETURNING *;

-- name: RevokeKey :execrows
UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL;

-- name: ResetKeyPeriod :exec
UPDATE api_keys SET period_spent_micro = 0, period_started_at = now() WHERE id = $1;

-- name: AddKeySpend :exec
UPDATE api_keys SET period_spent_micro = period_spent_micro + @amount,
                    total_spent_micro = total_spent_micro + @amount,
                    last_used_at = now()
WHERE id = @id;

-- name: CountActiveKeys :one
SELECT count(*) FROM api_keys WHERE revoked_at IS NULL AND kind = 'inference';
