-- +goose Up
-- Currency and wallet attribution are part of a posted account's identity.
-- +goose StatementBegin
CREATE FUNCTION neurogateway.freeze_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.wallet_id,NEW.kind,NEW.currency)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.wallet_id,OLD.kind,OLD.currency) THEN
  RAISE EXCEPTION 'ledger account identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER account_identity BEFORE UPDATE ON neurogateway.ledger_accounts
 FOR EACH ROW EXECUTE FUNCTION neurogateway.freeze_account_identity();
-- +goose StatementBegin
CREATE FUNCTION neurogateway.freeze_wallet_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.currency IS DISTINCT FROM OLD.currency THEN
  RAISE EXCEPTION 'wallet currency is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER wallet_currency BEFORE UPDATE ON neurogateway.wallets
 FOR EACH ROW EXECUTE FUNCTION neurogateway.freeze_wallet_currency();

-- +goose Down
DROP TRIGGER wallet_currency ON neurogateway.wallets;
DROP FUNCTION neurogateway.freeze_wallet_currency();
DROP TRIGGER account_identity ON neurogateway.ledger_accounts;
DROP FUNCTION neurogateway.freeze_account_identity();
