-- +goose Up
-- Деньги храним в микрорублях: 1 ₽ = 1 000 000. Цены провайдеров храним в микродолларах
-- за 1 млн токенов и переводим в рубли по текущему курсу ЦБ с наценкой из settings.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL,
    name            text NOT NULL DEFAULT '',
    password_hash   text,
    google_sub      text UNIQUE,
    avatar_url      text NOT NULL DEFAULT '',
    role            text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
    locale          text NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'en')),
    log_prompts     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_login_at   timestamptz
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE sessions (
    token_hash  text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_agent  text NOT NULL DEFAULT '',
    ip          text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE api_keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind            text NOT NULL DEFAULT 'inference' CHECK (kind IN ('inference', 'management')),
    name            text NOT NULL,
    prefix          text NOT NULL,
    secret_hash     text NOT NULL UNIQUE,
    limit_micro     bigint CHECK (limit_micro IS NULL OR limit_micro >= 0),
    limit_reset     text NOT NULL DEFAULT 'never' CHECK (limit_reset IN ('never', 'daily', 'weekly', 'monthly')),
    period_spent_micro bigint NOT NULL DEFAULT 0,
    period_started_at  timestamptz NOT NULL DEFAULT now(),
    total_spent_micro  bigint NOT NULL DEFAULT 0,
    rpm_limit       integer CHECK (rpm_limit IS NULL OR rpm_limit > 0),
    disabled        boolean NOT NULL DEFAULT false,
    expires_at      timestamptz,
    last_used_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz
);
CREATE INDEX api_keys_user ON api_keys (user_id) WHERE revoked_at IS NULL;

CREATE TABLE providers (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    kind        text NOT NULL DEFAULT 'mock' CHECK (kind IN ('mock', 'openai_compatible')),
    base_url    text NOT NULL DEFAULT '',
    api_key_enc text NOT NULL DEFAULT '',
    enabled     boolean NOT NULL DEFAULT true,
    priority    integer NOT NULL DEFAULT 100,
    -- поведение мок-провайдера: задержка, доля ошибок
    mock_latency_ms integer NOT NULL DEFAULT 40,
    mock_error_rate integer NOT NULL DEFAULT 0 CHECK (mock_error_rate BETWEEN 0 AND 100),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE models (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    author          text NOT NULL,
    description     text NOT NULL DEFAULT '',
    modality        text NOT NULL DEFAULT 'text' CHECK (modality IN ('text', 'image')),
    capabilities    text[] NOT NULL DEFAULT '{}',
    categories      text[] NOT NULL DEFAULT '{}',
    context_length  integer NOT NULL DEFAULT 8192,
    max_output      integer NOT NULL DEFAULT 4096,
    input_usd_micro  bigint NOT NULL DEFAULT 0,
    output_usd_micro bigint NOT NULL DEFAULT 0,
    cache_read_usd_micro bigint NOT NULL DEFAULT 0,
    image_usd_micro  bigint NOT NULL DEFAULT 0,
    open_weights    boolean NOT NULL DEFAULT false,
    in_plans        boolean NOT NULL DEFAULT false,
    enabled         boolean NOT NULL DEFAULT true,
    released_at     date NOT NULL DEFAULT current_date,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_endpoints (
    model_id        text NOT NULL REFERENCES models (id) ON DELETE CASCADE,
    provider_id     text NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
    upstream_model  text NOT NULL,
    priority        integer NOT NULL DEFAULT 100,
    enabled         boolean NOT NULL DEFAULT true,
    PRIMARY KEY (model_id, provider_id)
);

CREATE TABLE wallets (
    user_id                 uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    balance_micro           bigint NOT NULL DEFAULT 0,
    low_balance_alert       boolean NOT NULL DEFAULT false,
    low_balance_micro       bigint NOT NULL DEFAULT 100000000,
    auto_topup              boolean NOT NULL DEFAULT false,
    auto_topup_below_micro  bigint NOT NULL DEFAULT 100000000,
    auto_topup_amount_micro bigint NOT NULL DEFAULT 500000000,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('topup', 'charge', 'refund', 'adjust', 'plan', 'bonus', 'promo')),
    amount_micro        bigint NOT NULL,
    balance_after_micro bigint NOT NULL,
    description         text NOT NULL DEFAULT '',
    ref                 text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user ON transactions (user_id, created_at DESC);

CREATE TABLE plans (
    id                  text PRIMARY KEY,
    name_ru             text NOT NULL,
    name_en             text NOT NULL,
    description_ru      text NOT NULL DEFAULT '',
    description_en      text NOT NULL DEFAULT '',
    price_kopecks       bigint NOT NULL DEFAULT 0 CHECK (price_kopecks >= 0),
    period_days         integer NOT NULL DEFAULT 30 CHECK (period_days > 0),
    token_quota         bigint NOT NULL DEFAULT 0,
    daily_free_requests integer NOT NULL DEFAULT 0,
    concurrency         integer NOT NULL DEFAULT 1,
    features_ru         text[] NOT NULL DEFAULT '{}',
    features_en         text[] NOT NULL DEFAULT '{}',
    highlighted         boolean NOT NULL DEFAULT false,
    sort                integer NOT NULL DEFAULT 0,
    active              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    plan_id     text NOT NULL REFERENCES plans (id),
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'canceled')),
    tokens_used bigint NOT NULL DEFAULT 0,
    started_at  timestamptz NOT NULL DEFAULT now(),
    ends_at     timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_one_active ON subscriptions (user_id) WHERE status = 'active';

CREATE TABLE payments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider         text NOT NULL,
    purpose          text NOT NULL CHECK (purpose IN ('topup', 'plan')),
    plan_id          text REFERENCES plans (id),
    amount_kopecks   bigint NOT NULL CHECK (amount_kopecks > 0),
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
    external_id      text NOT NULL DEFAULT '',
    confirmation_url text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    paid_at          timestamptz
);
CREATE INDEX payments_user ON payments (user_id, created_at DESC);

CREATE TABLE presets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    slug            text NOT NULL,
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    model_id        text NOT NULL REFERENCES models (id),
    fallback_models text[] NOT NULL DEFAULT '{}',
    system_prompt   text NOT NULL DEFAULT '',
    temperature     real,
    max_tokens      integer,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, slug)
);

CREATE TABLE requests (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    api_key_id        uuid REFERENCES api_keys (id) ON DELETE SET NULL,
    model_id          text NOT NULL,
    provider_id       text NOT NULL DEFAULT '',
    preset            text NOT NULL DEFAULT '',
    endpoint          text NOT NULL DEFAULT 'chat',
    status            integer NOT NULL,
    prompt_tokens     integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    cached_tokens     integer NOT NULL DEFAULT 0,
    cost_micro        bigint NOT NULL DEFAULT 0,
    paid_by           text NOT NULL DEFAULT 'balance' CHECK (paid_by IN ('balance', 'plan', 'free')),
    latency_ms        integer NOT NULL DEFAULT 0,
    ttft_ms           integer NOT NULL DEFAULT 0,
    streamed          boolean NOT NULL DEFAULT false,
    finish_reason     text NOT NULL DEFAULT '',
    error             text NOT NULL DEFAULT '',
    app               text NOT NULL DEFAULT '',
    prompt_preview    text NOT NULL DEFAULT '',
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requests_user_time ON requests (user_id, created_at DESC);
CREATE INDEX requests_time ON requests (created_at DESC);

CREATE TABLE fx_rates (
    currency    text NOT NULL,
    on_date     date NOT NULL,
    rub_micro   bigint NOT NULL CHECK (rub_micro > 0),
    source      text NOT NULL,
    fetched_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (currency, on_date)
);

CREATE TABLE settings (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promo_codes (
    code         text PRIMARY KEY,
    amount_micro bigint NOT NULL CHECK (amount_micro > 0),
    max_uses     integer NOT NULL DEFAULT 1,
    used         integer NOT NULL DEFAULT 0,
    expires_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promo_redemptions (
    code       text NOT NULL REFERENCES promo_codes (code) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (code, user_id)
);

CREATE TABLE audit_log (
    id         bigserial PRIMARY KEY,
    actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    action     text NOT NULL,
    target     text NOT NULL DEFAULT '',
    details    jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_time ON audit_log (created_at DESC);

-- +goose Down
DROP TABLE audit_log, promo_redemptions, promo_codes, settings, fx_rates, requests, presets,
    payments, subscriptions, plans, transactions, wallets, model_endpoints, models, providers,
    api_keys, sessions, users;
