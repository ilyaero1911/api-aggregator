-- name: ListTeamMembers :many
SELECT m.*, u.email, u.name,
  (SELECT coalesce(sum(r.cost_micro), 0) FROM requests r WHERE r.user_id = m.member_id AND r.billed_user_id = m.owner_id AND r.created_at >= date_trunc('month', now()))::bigint AS spent_month
FROM team_members m JOIN users u ON u.id = m.member_id WHERE m.owner_id = $1 ORDER BY m.created_at;

-- name: ListMyTeams :many
SELECT m.*, u.email AS owner_email, u.name AS owner_name,
  (SELECT coalesce(sum(r.cost_micro), 0) FROM requests r WHERE r.user_id = m.member_id AND r.billed_user_id = m.owner_id AND r.created_at >= date_trunc('month', now()))::bigint AS spent_month
FROM team_members m JOIN users u ON u.id = m.owner_id WHERE m.member_id = $1 ORDER BY m.created_at;

-- name: GetMembership :one
SELECT * FROM team_members WHERE owner_id = $1 AND member_id = $2;

-- name: AddMember :exec
INSERT INTO team_members (owner_id, member_id, role, budget_micro) VALUES ($1, $2, $3, $4)
ON CONFLICT (owner_id, member_id) DO UPDATE SET role = EXCLUDED.role, budget_micro = EXCLUDED.budget_micro;

-- name: UpdateMember :exec
UPDATE team_members SET role = $3, budget_micro = $4 WHERE owner_id = $1 AND member_id = $2;

-- name: RemoveMember :exec
DELETE FROM team_members WHERE owner_id = $1 AND member_id = $2;

-- name: RevokeTeamKeys :exec
UPDATE api_keys SET revoked_at = now() WHERE user_id = $1 AND billing_user_id = $2 AND revoked_at IS NULL;

-- name: CreateInvite :one
INSERT INTO team_invites (owner_id, email, role, budget_micro, token_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: ListInvites :many
SELECT * FROM team_invites WHERE owner_id = $1 AND accepted_at IS NULL ORDER BY created_at DESC;

-- name: GetInviteByToken :one
SELECT i.*, u.email AS owner_email, u.name AS owner_name FROM team_invites i JOIN users u ON u.id = i.owner_id
WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.created_at > now() - interval '14 days';

-- name: AcceptInvite :exec
UPDATE team_invites SET accepted_at = now() WHERE id = $1;

-- name: DeleteInvite :exec
DELETE FROM team_invites WHERE id = $1 AND owner_id = $2;

-- name: MemberSpentMonth :one
SELECT coalesce(sum(cost_micro), 0)::bigint FROM requests WHERE user_id = $1 AND billed_user_id = $2 AND created_at >= date_trunc('month', now());

-- name: SetKeyBilling :exec
UPDATE api_keys SET billing_user_id = $2 WHERE id = $1;

-- name: SetCacheEnabled :exec
UPDATE users SET cache_enabled = $2 WHERE id = $1;

-- name: NextInvoiceNumber :one
SELECT nextval('invoice_number_seq')::bigint;

-- name: SetPaymentMeta :exec
UPDATE payments SET meta = $2 WHERE id = $1;

-- name: ListIncomingInvites :many
SELECT i.id, i.role, i.budget_micro, i.created_at, u.email AS owner_email, u.name AS owner_name
FROM team_invites i JOIN users u ON u.id = i.owner_id
WHERE lower(i.email) = lower(@email::text) AND i.accepted_at IS NULL AND i.created_at > now() - interval '14 days'
ORDER BY i.created_at DESC;

-- name: GetInvite :one
SELECT * FROM team_invites WHERE id = $1 AND accepted_at IS NULL;

-- name: DeleteInviteByID :exec
DELETE FROM team_invites WHERE id = $1;
