-- name: ListModels :many
SELECT * FROM models WHERE enabled OR @include_disabled::boolean ORDER BY released_at DESC, id;

-- name: GetModel :one
SELECT * FROM models WHERE id = $1;

-- name: UpsertModel :one
INSERT INTO models (id, name, author, description, modality, capabilities, categories, context_length, max_output,
                    input_usd_micro, output_usd_micro, cache_read_usd_micro, image_usd_micro, open_weights, in_plans, enabled, released_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, author = EXCLUDED.author, description = EXCLUDED.description, modality = EXCLUDED.modality,
    capabilities = EXCLUDED.capabilities, categories = EXCLUDED.categories, context_length = EXCLUDED.context_length,
    max_output = EXCLUDED.max_output, input_usd_micro = EXCLUDED.input_usd_micro, output_usd_micro = EXCLUDED.output_usd_micro,
    cache_read_usd_micro = EXCLUDED.cache_read_usd_micro, image_usd_micro = EXCLUDED.image_usd_micro,
    open_weights = EXCLUDED.open_weights, in_plans = EXCLUDED.in_plans, enabled = EXCLUDED.enabled, released_at = EXCLUDED.released_at
RETURNING *;

-- name: DeleteModel :exec
DELETE FROM models WHERE id = $1;

-- name: ListEndpointsForModel :many
SELECT e.model_id, e.provider_id, e.upstream_model, e.priority, e.enabled,
       p.kind, p.base_url, p.api_key_enc, p.mock_latency_ms, p.mock_error_rate, p.enabled AS provider_enabled
FROM model_endpoints e JOIN providers p ON p.id = e.provider_id
WHERE e.model_id = $1
ORDER BY e.priority, p.priority;

-- name: ListAllEndpoints :many
SELECT * FROM model_endpoints ORDER BY model_id, priority;

-- name: UpsertEndpoint :exec
INSERT INTO model_endpoints (model_id, provider_id, upstream_model, priority, enabled) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (model_id, provider_id) DO UPDATE SET upstream_model = EXCLUDED.upstream_model,
    priority = EXCLUDED.priority, enabled = EXCLUDED.enabled;

-- name: DeleteEndpoint :exec
DELETE FROM model_endpoints WHERE model_id = $1 AND provider_id = $2;

-- name: ListProviders :many
SELECT * FROM providers ORDER BY priority, id;

-- name: UpsertProvider :one
INSERT INTO providers (id, name, kind, base_url, api_key_enc, enabled, priority, mock_latency_ms, mock_error_rate)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, base_url = EXCLUDED.base_url,
    api_key_enc = CASE WHEN EXCLUDED.api_key_enc = '' THEN providers.api_key_enc ELSE EXCLUDED.api_key_enc END,
    enabled = EXCLUDED.enabled, priority = EXCLUDED.priority, mock_latency_ms = EXCLUDED.mock_latency_ms,
    mock_error_rate = EXCLUDED.mock_error_rate
RETURNING *;

-- name: DeleteProvider :exec
DELETE FROM providers WHERE id = $1;

-- name: ListPlans :many
SELECT * FROM plans WHERE active OR @include_inactive::boolean ORDER BY sort, id;

-- name: GetPlan :one
SELECT * FROM plans WHERE id = $1;

-- name: UpsertPlan :one
INSERT INTO plans (id, name_ru, name_en, description_ru, description_en, price_kopecks, period_days, token_quota,
                   daily_free_requests, concurrency, features_ru, features_en, highlighted, sort, active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
ON CONFLICT (id) DO UPDATE SET name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en,
    description_ru = EXCLUDED.description_ru, description_en = EXCLUDED.description_en,
    price_kopecks = EXCLUDED.price_kopecks, period_days = EXCLUDED.period_days, token_quota = EXCLUDED.token_quota,
    daily_free_requests = EXCLUDED.daily_free_requests, concurrency = EXCLUDED.concurrency,
    features_ru = EXCLUDED.features_ru, features_en = EXCLUDED.features_en, highlighted = EXCLUDED.highlighted,
    sort = EXCLUDED.sort, active = EXCLUDED.active
RETURNING *;

-- name: GetSettings :many
SELECT * FROM settings;

-- name: SetSetting :exec
INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- name: UpsertFxRate :exec
INSERT INTO fx_rates (currency, on_date, rub_micro, source, fetched_at) VALUES ($1, $2, $3, $4, now())
ON CONFLICT (currency, on_date) DO UPDATE SET rub_micro = EXCLUDED.rub_micro, source = EXCLUDED.source, fetched_at = now();

-- name: LatestFxRate :one
SELECT * FROM fx_rates WHERE currency = $1 ORDER BY on_date DESC LIMIT 1;

-- name: ListFxRates :many
SELECT * FROM fx_rates WHERE currency = $1 ORDER BY on_date DESC LIMIT $2;
