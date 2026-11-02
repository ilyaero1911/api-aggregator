-- +goose Up
-- Expansion: prevent appending to a journal after its creating DB transaction.
ALTER TABLE neurogateway.ledger_transactions ADD COLUMN created_xid xid8 NOT NULL DEFAULT pg_current_xact_id();
-- +goose StatementBegin
CREATE FUNCTION neurogateway.require_open_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM neurogateway.ledger_transactions t
  WHERE t.tenant_id=NEW.tenant_id AND t.id=NEW.transaction_id AND t.created_xid=pg_current_xact_id())
 THEN RAISE EXCEPTION 'journal is sealed or belongs to another tenant' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER open_journal BEFORE INSERT ON neurogateway.ledger_entries FOR EACH ROW EXECUTE FUNCTION neurogateway.require_open_journal();
-- +goose StatementBegin
CREATE FUNCTION neurogateway.require_complete_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lines bigint; total numeric; currencies bigint;
BEGIN
 SELECT count(*),COALESCE(sum(e.amount_microkopecks),0),count(DISTINCT a.currency)
 INTO lines,total,currencies FROM neurogateway.ledger_entries e
 JOIN neurogateway.ledger_accounts a ON(a.tenant_id=e.tenant_id AND a.id=e.account_id)
 WHERE e.tenant_id=NEW.tenant_id AND e.transaction_id=NEW.id;
 IF lines<2 OR total<>0 OR currencies<>1 THEN
  RAISE EXCEPTION 'incomplete or unbalanced journal %',NEW.id USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE CONSTRAINT TRIGGER complete_journal AFTER INSERT ON neurogateway.ledger_transactions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION neurogateway.require_complete_journal();

-- +goose Down
DROP TRIGGER complete_journal ON neurogateway.ledger_transactions;
DROP FUNCTION neurogateway.require_complete_journal();
DROP TRIGGER open_journal ON neurogateway.ledger_entries;
DROP FUNCTION neurogateway.require_open_journal();
ALTER TABLE neurogateway.ledger_transactions DROP COLUMN created_xid;
