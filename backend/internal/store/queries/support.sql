-- name: CreateTicket :one
INSERT INTO support_tickets (user_id, subject, unread_admin) VALUES ($1, $2, 1) RETURNING *;

-- name: GetTicket :one
SELECT t.*, u.email, u.name AS user_name FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = $1;

-- name: ListUserTickets :many
SELECT t.*, (SELECT m.body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1)::text AS last_body
FROM support_tickets t WHERE t.user_id = $1 ORDER BY t.last_message_at DESC LIMIT 100;

-- name: AdminListTickets :many
SELECT t.*, u.email, u.name AS user_name,
       (SELECT m.body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1)::text AS last_body,
       (SELECT m.author FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1)::text AS last_author
FROM support_tickets t JOIN users u ON u.id = t.user_id
WHERE (@status::text = '' OR t.status = @status) AND (@q::text = '' OR u.email ILIKE '%' || @q || '%' OR t.subject ILIKE '%' || @q || '%')
ORDER BY (t.unread_admin > 0) DESC, t.last_message_at DESC LIMIT 200;

-- name: AddMessage :one
INSERT INTO support_messages (ticket_id, author, author_id, body) VALUES ($1, $2, $3, $4) RETURNING *;

-- name: ListMessages :many
SELECT m.*, coalesce(u.name, '')::text AS author_name FROM support_messages m LEFT JOIN users u ON u.id = m.author_id
WHERE m.ticket_id = $1 AND m.id > @after::bigint ORDER BY m.id;

-- name: TouchTicketByUser :exec
UPDATE support_tickets SET last_message_at = now(), unread_admin = unread_admin + 1, status = 'open' WHERE id = $1;

-- name: TouchTicketByAdmin :exec
UPDATE support_tickets SET last_message_at = now(), unread_user = unread_user + 1, status = 'answered' WHERE id = $1;

-- name: MarkTicketReadByUser :exec
UPDATE support_tickets SET unread_user = 0 WHERE id = $1;

-- name: MarkTicketReadByAdmin :exec
UPDATE support_tickets SET unread_admin = 0 WHERE id = $1;

-- name: SetTicketStatus :exec
UPDATE support_tickets SET status = $2 WHERE id = $1;

-- name: SupportCounters :one
SELECT coalesce(sum(unread_admin), 0)::bigint AS unread_admin, count(*) FILTER (WHERE status = 'open')::bigint AS open
FROM support_tickets;

-- name: UserSupportUnread :one
SELECT coalesce(sum(unread_user), 0)::bigint FROM support_tickets WHERE user_id = $1;
