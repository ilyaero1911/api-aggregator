-- +goose Up
CREATE TABLE support_tickets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject         text NOT NULL,
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
    unread_admin    integer NOT NULL DEFAULT 0,
    unread_user     integer NOT NULL DEFAULT 0,
    last_message_at timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user ON support_tickets (user_id, last_message_at DESC);
CREATE INDEX support_tickets_status ON support_tickets (status, last_message_at DESC);

CREATE TABLE support_messages (
    id         bigserial PRIMARY KEY,
    ticket_id  uuid NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
    author     text NOT NULL CHECK (author IN ('user', 'admin')),
    author_id  uuid REFERENCES users (id) ON DELETE SET NULL,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket ON support_messages (ticket_id, id);

INSERT INTO settings (key, value) VALUES ('tg_chat_ids', '""'), ('tg_notify_support', 'true'), ('tg_notify_payments', 'false') ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE support_messages, support_tickets;
DELETE FROM settings WHERE key IN ('tg_chat_ids', 'tg_notify_support', 'tg_notify_payments');
