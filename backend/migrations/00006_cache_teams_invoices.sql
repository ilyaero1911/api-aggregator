-- +goose Up
ALTER TABLE users ADD COLUMN cache_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE requests ADD COLUMN cache_hit boolean NOT NULL DEFAULT false;
-- Чей баланс оплачивает запрос: владелец команды для командных ключей, иначе сам пользователь (NULL).
ALTER TABLE requests ADD COLUMN billed_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE api_keys ADD COLUMN billing_user_id uuid REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX requests_billed_month ON requests (billed_user_id, user_id, created_at) WHERE billed_user_id IS NOT NULL;

-- Команда — это аккаунт владельца: участники создают ключи, которые списывают деньги с баланса владельца.
CREATE TABLE team_members (
    owner_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    member_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    budget_micro bigint CHECK (budget_micro IS NULL OR budget_micro >= 0), -- лимит участника в месяц
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, member_id),
    CHECK (owner_id <> member_id)
);
CREATE INDEX team_members_member ON team_members (member_id);

CREATE TABLE team_invites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email       text NOT NULL,
    role        text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    budget_micro bigint,
    token_hash  text NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz
);

ALTER TABLE payments ADD COLUMN meta jsonb NOT NULL DEFAULT '{}';
CREATE SEQUENCE invoice_number_seq START 1001;

INSERT INTO settings (key, value) VALUES
    ('cache_ttl_sec', '3600'), ('cache_discount_bps', '9000'),
    ('company_kpp', '""'), ('company_bank', '""'), ('company_bik', '""'), ('company_account', '""'), ('company_corr_account', '""')
ON CONFLICT DO NOTHING;

-- +goose Down
DROP SEQUENCE invoice_number_seq;
ALTER TABLE payments DROP COLUMN meta;
DROP TABLE team_invites, team_members;
ALTER TABLE api_keys DROP COLUMN billing_user_id;
ALTER TABLE requests DROP COLUMN billed_user_id, DROP COLUMN cache_hit;
ALTER TABLE users DROP COLUMN cache_enabled;
