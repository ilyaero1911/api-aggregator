-- +goose Up

CREATE SCHEMA neurogateway;

CREATE TABLE neurogateway.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE neurogateway.users (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL, display_name text NOT NULL, password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  UNIQUE (tenant_id, email)
);

CREATE INDEX users_tenant_created ON neurogateway.users(tenant_id,created_at);

ALTER TABLE neurogateway.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.users USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.identities (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, provider text NOT NULL, subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES neurogateway.users(tenant_id,id),
  UNIQUE (tenant_id,provider,subject)
);

CREATE INDEX identities_tenant_created ON neurogateway.identities(tenant_id,created_at);

ALTER TABLE neurogateway.identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.identities USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.sessions (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, token_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES neurogateway.users(tenant_id,id),
  UNIQUE (tenant_id,token_hash)
);

CREATE INDEX sessions_tenant_created ON neurogateway.sessions(tenant_id,created_at);

ALTER TABLE neurogateway.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.sessions USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.organizations (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL, tax_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id)
);

CREATE INDEX organizations_tenant_created ON neurogateway.organizations(tenant_id,created_at);

ALTER TABLE neurogateway.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.organizations USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.memberships (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, organization_id uuid NOT NULL, role text NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES neurogateway.users(tenant_id,id),
  FOREIGN KEY (tenant_id,organization_id) REFERENCES neurogateway.organizations(tenant_id,id),
  UNIQUE(tenant_id,user_id,organization_id)
);

CREATE INDEX memberships_tenant_created ON neurogateway.memberships(tenant_id,created_at);

ALTER TABLE neurogateway.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.memberships USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.api_keys (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, organization_id uuid, name text NOT NULL, secret_hash text NOT NULL, key_prefix text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES neurogateway.users(tenant_id,id),
  FOREIGN KEY (tenant_id,organization_id) REFERENCES neurogateway.organizations(tenant_id,id),
  UNIQUE(tenant_id,secret_hash)
);

CREATE INDEX api_keys_tenant_created ON neurogateway.api_keys(tenant_id,created_at);

ALTER TABLE neurogateway.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.api_keys USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.key_limits (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL, rpm integer NOT NULL CHECK(rpm>0), tpm bigint NOT NULL CHECK(tpm>0), budget_microkopecks bigint CHECK(budget_microkopecks>=0), reset_period text NOT NULL CHECK(reset_period IN ('none','daily','monthly')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,api_key_id) REFERENCES neurogateway.api_keys(tenant_id,id),
  UNIQUE(tenant_id,api_key_id)
);

CREATE INDEX key_limits_tenant_created ON neurogateway.key_limits(tenant_id,created_at);

ALTER TABLE neurogateway.key_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.key_limits USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.wallets (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid, organization_id uuid, currency char(3) NOT NULL DEFAULT 'RUB', CHECK(num_nonnulls(user_id,organization_id)=1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES neurogateway.users(tenant_id,id),
  FOREIGN KEY (tenant_id,organization_id) REFERENCES neurogateway.organizations(tenant_id,id)
);

CREATE INDEX wallets_tenant_created ON neurogateway.wallets(tenant_id,created_at);

ALTER TABLE neurogateway.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.wallets USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.ledger_accounts (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_id uuid, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('asset','liability','revenue','clearing')), currency char(3) NOT NULL DEFAULT 'RUB',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,wallet_id) REFERENCES neurogateway.wallets(tenant_id,id),
  UNIQUE(tenant_id,name)
);

CREATE INDEX ledger_accounts_tenant_created ON neurogateway.ledger_accounts(tenant_id,created_at);

ALTER TABLE neurogateway.ledger_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.ledger_accounts USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.generations (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL, wallet_id uuid NOT NULL, model text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL, status text NOT NULL CHECK(status IN ('held','captured','released','failed')), finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,api_key_id) REFERENCES neurogateway.api_keys(tenant_id,id),
  FOREIGN KEY (tenant_id,wallet_id) REFERENCES neurogateway.wallets(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key)
);

CREATE INDEX generations_tenant_created ON neurogateway.generations(tenant_id,created_at);

ALTER TABLE neurogateway.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.generations USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.ledger_transactions (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generation_id uuid, kind text NOT NULL CHECK(kind IN ('deposit','capture','refund','adjustment')), external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,generation_id) REFERENCES neurogateway.generations(tenant_id,id),
  UNIQUE(tenant_id,external_id),
  UNIQUE(tenant_id,generation_id,kind)
);

CREATE INDEX ledger_transactions_tenant_created ON neurogateway.ledger_transactions(tenant_id,created_at);

ALTER TABLE neurogateway.ledger_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.ledger_transactions USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.ledger_entries (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL, account_id uuid NOT NULL, line_no integer NOT NULL CHECK(line_no>0), amount_microkopecks bigint NOT NULL CHECK(amount_microkopecks<>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,transaction_id) REFERENCES neurogateway.ledger_transactions(tenant_id,id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES neurogateway.ledger_accounts(tenant_id,id),
  UNIQUE(tenant_id,transaction_id,line_no)
);

CREATE INDEX ledger_entries_tenant_created ON neurogateway.ledger_entries(tenant_id,created_at);

ALTER TABLE neurogateway.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.ledger_entries USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.holds (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL, wallet_id uuid NOT NULL, amount_microkopecks bigint NOT NULL CHECK(amount_microkopecks>=0), status text NOT NULL CHECK(status IN ('held','captured','released')), expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,generation_id) REFERENCES neurogateway.generations(tenant_id,id),
  FOREIGN KEY (tenant_id,wallet_id) REFERENCES neurogateway.wallets(tenant_id,id),
  UNIQUE(tenant_id,generation_id)
);

CREATE INDEX holds_tenant_created ON neurogateway.holds(tenant_id,created_at);

ALTER TABLE neurogateway.holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.holds USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.payments (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL, provider text NOT NULL, external_id text NOT NULL, amount_microkopecks bigint NOT NULL CHECK(amount_microkopecks>0), status text NOT NULL CHECK(status IN ('pending','succeeded','failed','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,wallet_id) REFERENCES neurogateway.wallets(tenant_id,id),
  UNIQUE(tenant_id,provider,external_id)
);

CREATE INDEX payments_tenant_created ON neurogateway.payments(tenant_id,created_at);

ALTER TABLE neurogateway.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.payments USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.invoices (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid, number text NOT NULL, total_microkopecks bigint NOT NULL CHECK(total_microkopecks>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,payment_id) REFERENCES neurogateway.payments(tenant_id,id),
  UNIQUE(tenant_id,number)
);

CREATE INDEX invoices_tenant_created ON neurogateway.invoices(tenant_id,created_at);

ALTER TABLE neurogateway.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.invoices USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.documents (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid, object_key text NOT NULL, content_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,invoice_id) REFERENCES neurogateway.invoices(tenant_id,id)
);

CREATE INDEX documents_tenant_created ON neurogateway.documents(tenant_id,created_at);

ALTER TABLE neurogateway.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.documents USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.providers (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL, channel text NOT NULL CHECK(channel IN ('mock','direct','marketplace','reseller','self_hosted')), legal_status text NOT NULL DEFAULT 'pending' CHECK(legal_status IN ('pending','approved','blocked')), enabled boolean NOT NULL DEFAULT false, region text NOT NULL, CHECK(NOT enabled OR legal_status='approved' OR channel='mock'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,name)
);

CREATE INDEX providers_tenant_created ON neurogateway.providers(tenant_id,created_at);

ALTER TABLE neurogateway.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.providers USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.models (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL, name text NOT NULL, context_length integer NOT NULL CHECK(context_length>0), modalities jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,slug)
);

CREATE INDEX models_tenant_created ON neurogateway.models(tenant_id,created_at);

ALTER TABLE neurogateway.models ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.models USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.model_endpoints (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL, provider_id uuid NOT NULL, upstream_model text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,model_id) REFERENCES neurogateway.models(tenant_id,id),
  FOREIGN KEY (tenant_id,provider_id) REFERENCES neurogateway.providers(tenant_id,id),
  UNIQUE(tenant_id,model_id,provider_id,upstream_model)
);

CREATE INDEX model_endpoints_tenant_created ON neurogateway.model_endpoints(tenant_id,created_at);

ALTER TABLE neurogateway.model_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.model_endpoints USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.prices (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_endpoint_id uuid NOT NULL, currency char(3) NOT NULL, input_per_million_microkopecks bigint NOT NULL CHECK(input_per_million_microkopecks>=0), output_per_million_microkopecks bigint NOT NULL CHECK(output_per_million_microkopecks>=0), valid_from timestamptz NOT NULL, valid_until timestamptz, CHECK(valid_until IS NULL OR valid_until>valid_from),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,model_endpoint_id) REFERENCES neurogateway.model_endpoints(tenant_id,id),
  UNIQUE(tenant_id,model_endpoint_id,valid_from)
);

CREATE INDEX prices_tenant_created ON neurogateway.prices(tenant_id,created_at);

ALTER TABLE neurogateway.prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.prices USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.exchange_rates (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  currency char(3) NOT NULL, rub_numerator bigint NOT NULL CHECK(rub_numerator>0), denominator bigint NOT NULL CHECK(denominator>0), observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,currency,observed_at)
);

CREATE INDEX exchange_rates_tenant_created ON neurogateway.exchange_rates(tenant_id,created_at);

ALTER TABLE neurogateway.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.exchange_rates USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.promo_codes (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL, discount_basis_points integer NOT NULL CHECK(discount_basis_points BETWEEN 0 AND 10000), expires_at timestamptz NOT NULL, max_redemptions integer NOT NULL CHECK(max_redemptions>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,code)
);

CREATE INDEX promo_codes_tenant_created ON neurogateway.promo_codes(tenant_id,created_at);

ALTER TABLE neurogateway.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.promo_codes USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.redemptions (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL, user_id uuid NOT NULL, transaction_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,promo_code_id) REFERENCES neurogateway.promo_codes(tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES neurogateway.users(tenant_id,id),
  FOREIGN KEY (tenant_id,transaction_id) REFERENCES neurogateway.ledger_transactions(tenant_id,id),
  UNIQUE(tenant_id,promo_code_id,user_id)
);

CREATE INDEX redemptions_tenant_created ON neurogateway.redemptions(tenant_id,created_at);

ALTER TABLE neurogateway.redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.redemptions USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.usage_events (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL, api_key_id uuid NOT NULL, provider text NOT NULL, model text NOT NULL, prompt_tokens integer NOT NULL CHECK(prompt_tokens>=0), completion_tokens integer NOT NULL CHECK(completion_tokens>=0), cached_tokens integer NOT NULL DEFAULT 0 CHECK(cached_tokens>=0), reasoning_tokens integer NOT NULL DEFAULT 0 CHECK(reasoning_tokens>=0), latency_ms integer NOT NULL CHECK(latency_ms>=0), amount_microkopecks bigint NOT NULL CHECK(amount_microkopecks>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,generation_id) REFERENCES neurogateway.generations(tenant_id,id),
  FOREIGN KEY (tenant_id,api_key_id) REFERENCES neurogateway.api_keys(tenant_id,id),
  UNIQUE(tenant_id,generation_id)
);

CREATE INDEX usage_events_tenant_created ON neurogateway.usage_events(tenant_id,created_at);

ALTER TABLE neurogateway.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.usage_events USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.audit_log (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES neurogateway.users(tenant_id,id)
);

CREATE INDEX audit_log_tenant_created ON neurogateway.audit_log(tenant_id,created_at);

ALTER TABLE neurogateway.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.audit_log USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE neurogateway.outbox (
  tenant_id uuid NOT NULL REFERENCES neurogateway.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generation_id uuid, event_type text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','dead')), attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY (tenant_id,generation_id) REFERENCES neurogateway.generations(tenant_id,id),
  UNIQUE(tenant_id,generation_id,event_type)
);

CREATE INDEX outbox_tenant_created ON neurogateway.outbox(tenant_id,created_at);

ALTER TABLE neurogateway.outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON neurogateway.outbox USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE INDEX outbox_pending ON neurogateway.outbox(next_attempt_at) WHERE status='pending';

CREATE INDEX holds_expiring ON neurogateway.holds(expires_at) WHERE status='held';

CREATE INDEX prices_current ON neurogateway.prices(tenant_id,model_endpoint_id,valid_from DESC) WHERE valid_until IS NULL;

-- +goose StatementBegin
CREATE FUNCTION neurogateway.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only table %',TG_TABLE_NAME USING ERRCODE='23514'; END;
$$;
-- +goose StatementEnd

CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON neurogateway.audit_log FOR EACH ROW EXECUTE FUNCTION neurogateway.reject_mutation();

CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON neurogateway.ledger_entries FOR EACH ROW EXECUTE FUNCTION neurogateway.reject_mutation();

CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON neurogateway.ledger_transactions FOR EACH ROW EXECUTE FUNCTION neurogateway.reject_mutation();

CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON neurogateway.usage_events FOR EACH ROW EXECUTE FUNCTION neurogateway.reject_mutation();

-- A deferred constraint checks the complete journal at COMMIT, not line by line.
-- +goose StatementBegin
CREATE FUNCTION neurogateway.check_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric;
BEGIN
 SELECT COALESCE(sum(amount_microkopecks),0) INTO total FROM neurogateway.ledger_entries
 WHERE tenant_id=NEW.tenant_id AND transaction_id=NEW.transaction_id;
 IF total<>0 THEN RAISE EXCEPTION 'unbalanced journal %',NEW.transaction_id USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON neurogateway.ledger_entries
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION neurogateway.check_balanced_journal();
-- +goose StatementBegin
CREATE FUNCTION neurogateway.check_account_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected char(3); actual char(3);
BEGIN
 SELECT currency INTO actual FROM neurogateway.ledger_accounts WHERE tenant_id=NEW.tenant_id AND id=NEW.account_id;
 SELECT a.currency INTO expected FROM neurogateway.ledger_entries e JOIN neurogateway.ledger_accounts a
 ON(a.tenant_id=e.tenant_id AND a.id=e.account_id)
 WHERE e.tenant_id=NEW.tenant_id AND e.transaction_id=NEW.transaction_id LIMIT 1;
 IF expected IS NOT NULL AND actual<>expected THEN RAISE EXCEPTION 'mixed journal currencies' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER account_currency BEFORE INSERT ON neurogateway.ledger_entries FOR EACH ROW EXECUTE FUNCTION neurogateway.check_account_currency();
-- +goose StatementBegin
CREATE FUNCTION neurogateway.check_provider_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.enabled AND NOT EXISTS(SELECT 1 FROM neurogateway.providers p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.provider_id AND p.enabled AND (p.legal_status='approved' OR p.channel='mock'))
 THEN RAISE EXCEPTION 'provider not approved' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER provider_approval BEFORE INSERT OR UPDATE ON neurogateway.model_endpoints FOR EACH ROW EXECUTE FUNCTION neurogateway.check_provider_approval();
-- +goose Down
-- Destructive rollback is for an empty development database only. Production uses forward fixes.
DROP SCHEMA neurogateway CASCADE;

