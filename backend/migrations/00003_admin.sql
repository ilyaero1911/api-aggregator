-- +goose Up
ALTER TABLE users ADD COLUMN admin_note text NOT NULL DEFAULT '';
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded'));
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'expired', 'canceled'));
CREATE INDEX requests_user_status ON requests (user_id, status);
CREATE INDEX subscriptions_status ON subscriptions (status, ends_at);

-- +goose Down
DROP INDEX subscriptions_status;
DROP INDEX requests_user_status;
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled'));
ALTER TABLE users DROP COLUMN admin_note;
