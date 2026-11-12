-- name: InsertRequest :one
INSERT INTO requests (user_id, api_key_id, model_id, provider_id, preset, endpoint, status, prompt_tokens,
    completion_tokens, cached_tokens, cost_micro, paid_by, latency_ms, ttft_ms, streamed, finish_reason, error, app, prompt_preview)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
RETURNING id;

-- name: GetRequest :one
SELECT r.*, coalesce(k.name, '')::text AS key_name FROM requests r LEFT JOIN api_keys k ON k.id = r.api_key_id
WHERE r.id = $1 AND r.user_id = $2;

-- name: ListRequests :many
SELECT r.*, coalesce(k.name, '')::text AS key_name FROM requests r LEFT JOIN api_keys k ON k.id = r.api_key_id
WHERE r.user_id = @user_id
  AND (@model::text = '' OR r.model_id = @model)
  AND (@status::text = '' OR (@status = 'ok' AND r.status < 400) OR (@status = 'error' AND r.status >= 400))
  AND (@q::text = '' OR r.id::text ILIKE @q || '%' OR r.model_id ILIKE '%' || @q || '%')
  AND r.created_at >= @since
ORDER BY r.created_at DESC
LIMIT @lim OFFSET @off;

-- name: CountRequests :one
SELECT count(*) FROM requests r
WHERE r.user_id = @user_id
  AND (@model::text = '' OR r.model_id = @model)
  AND (@status::text = '' OR (@status = 'ok' AND r.status < 400) OR (@status = 'error' AND r.status >= 400))
  AND (@q::text = '' OR r.id::text ILIKE @q || '%' OR r.model_id ILIKE '%' || @q || '%')
  AND r.created_at >= @since;

-- name: UsageTotals :one
SELECT coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens,
       coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens,
       coalesce(sum(cached_tokens), 0)::bigint AS cached_tokens,
       count(*)::bigint AS requests,
       coalesce(sum(cost_micro), 0)::bigint AS cost_micro,
       count(*) FILTER (WHERE status >= 400)::bigint AS errors
FROM requests
WHERE user_id = @user_id AND created_at >= @since AND (@model::text = '' OR model_id = @model);

-- name: UsageDaily :many
SELECT date_trunc(@bucket::text, created_at)::timestamptz AS bucket,
       coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens,
       coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens,
       count(*)::bigint AS requests,
       coalesce(sum(cost_micro), 0)::bigint AS cost_micro
FROM requests
WHERE user_id = @user_id AND created_at >= @since AND (@model::text = '' OR model_id = @model)
GROUP BY 1 ORDER BY 1;

-- name: UsageByModel :many
SELECT model_id, count(*)::bigint AS requests,
       coalesce(sum(prompt_tokens + completion_tokens), 0)::bigint AS tokens,
       coalesce(sum(cost_micro), 0)::bigint AS cost_micro
FROM requests WHERE user_id = @user_id AND created_at >= @since
GROUP BY model_id ORDER BY cost_micro DESC, requests DESC LIMIT 10;

-- name: UsedModels :many
SELECT DISTINCT model_id FROM requests WHERE user_id = $1 ORDER BY model_id;

-- name: CountFreeRequestsToday :one
SELECT count(*) FROM requests WHERE user_id = $1 AND paid_by = 'free' AND created_at >= date_trunc('day', now());

-- name: GlobalModelRanking :many
SELECT model_id, coalesce(sum(prompt_tokens + completion_tokens), 0)::bigint AS tokens, count(*)::bigint AS requests
FROM requests WHERE created_at >= @since AND status < 400
GROUP BY model_id ORDER BY tokens DESC LIMIT 20;

-- name: AdminStats :one
SELECT
  (SELECT count(*) FROM users)::bigint AS users,
  (SELECT count(*) FROM users WHERE created_at >= now() - interval '1 day')::bigint AS users_today,
  (SELECT count(*) FROM requests WHERE created_at >= now() - interval '1 day')::bigint AS requests_today,
  (SELECT coalesce(sum(cost_micro), 0) FROM requests WHERE created_at >= now() - interval '1 day')::bigint AS revenue_today_micro,
  (SELECT coalesce(sum(cost_micro), 0) FROM requests WHERE created_at >= now() - interval '30 days')::bigint AS revenue_month_micro,
  (SELECT coalesce(sum(amount_kopecks), 0) FROM payments WHERE status = 'succeeded' AND paid_at >= now() - interval '30 days')::bigint AS payments_month_kopecks,
  (SELECT count(*) FROM subscriptions WHERE status = 'active')::bigint AS active_subscriptions,
  (SELECT count(*) FROM requests WHERE created_at >= now() - interval '1 day' AND status >= 400)::bigint AS errors_today;

-- name: AdminDaily :many
SELECT date_trunc('day', created_at)::timestamptz AS bucket, count(*)::bigint AS requests,
       coalesce(sum(cost_micro), 0)::bigint AS cost_micro,
       count(DISTINCT user_id)::bigint AS users
FROM requests WHERE created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY 1;

-- name: AdminListRequests :many
SELECT r.*, u.email FROM requests r JOIN users u ON u.id = r.user_id
WHERE (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR r.model_id ILIKE '%' || @q || '%' OR r.id::text ILIKE @q || '%')
ORDER BY r.created_at DESC LIMIT @lim OFFSET @off;

-- name: ListPresets :many
SELECT * FROM presets WHERE user_id = $1 ORDER BY updated_at DESC;

-- name: GetPresetBySlug :one
SELECT * FROM presets WHERE user_id = $1 AND slug = $2;

-- name: CountPresets :one
SELECT count(*) FROM presets WHERE user_id = $1;

-- name: CreatePreset :one
INSERT INTO presets (user_id, slug, name, description, model_id, fallback_models, system_prompt, temperature, max_tokens)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;

-- name: UpdatePreset :one
UPDATE presets SET slug = $3, name = $4, description = $5, model_id = $6, fallback_models = $7, system_prompt = $8,
    temperature = $9, max_tokens = $10, updated_at = now()
WHERE id = $1 AND user_id = $2 RETURNING *;

-- name: DeletePreset :execrows
DELETE FROM presets WHERE id = $1 AND user_id = $2;
