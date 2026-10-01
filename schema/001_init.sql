-- Срез данных Release 0.5.
-- Текста промпта и ответа здесь нет: это запрещено DR-01 и DR-06.

CREATE TABLE accounts (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts (id),
    secret_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE balance_accounts (
    account_id uuid PRIMARY KEY REFERENCES accounts (id),
    available_minor bigint NOT NULL CHECK (available_minor >= 0)
);

CREATE TABLE generations (
    id uuid PRIMARY KEY,
    api_key_id uuid NOT NULL REFERENCES api_keys (id),
    model text NOT NULL,
    status text NOT NULL CHECK (status IN ('held', 'captured', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
    id uuid PRIMARY KEY,
    generation_id uuid NOT NULL REFERENCES generations (id),
    account_id uuid NOT NULL REFERENCES accounts (id),
    kind text NOT NULL CHECK (kind IN ('hold', 'capture', 'release')),
    amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (generation_id, kind)
);

CREATE TABLE usage_events (
    generation_id uuid PRIMARY KEY REFERENCES generations (id),
    api_key_id uuid NOT NULL REFERENCES api_keys (id),
    model text NOT NULL,
    provider text NOT NULL,
    prompt_tokens integer NOT NULL CHECK (prompt_tokens >= 0),
    completion_tokens integer NOT NULL CHECK (completion_tokens >= 0),
    latency_ms integer NOT NULL CHECK (latency_ms >= 0),
    amount_minor bigint NOT NULL,
    finish_reason text NULL
);
