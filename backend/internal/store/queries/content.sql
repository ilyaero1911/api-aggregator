-- name: GetIdentity :one
SELECT * FROM user_identities WHERE provider = $1 AND subject = $2;

-- name: CreateIdentity :exec
INSERT INTO user_identities (provider, subject, user_id, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;

-- name: ListUserIdentities :many
SELECT provider, email, created_at FROM user_identities WHERE user_id = $1 ORDER BY created_at;

-- name: SetConsent :exec
UPDATE users SET pd_consent_at = now(), pd_consent_version = $2 WHERE id = $1;

-- name: ListPages :many
SELECT * FROM content_pages ORDER BY slug;

-- name: GetPage :one
SELECT * FROM content_pages WHERE slug = $1;

-- name: UpsertPage :one
INSERT INTO content_pages (slug, title_ru, title_en, body_ru, body_en) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (slug) DO UPDATE SET title_ru = EXCLUDED.title_ru, title_en = EXCLUDED.title_en, body_ru = EXCLUDED.body_ru,
    body_en = EXCLUDED.body_en, version = content_pages.version + 1, updated_at = now()
RETURNING *;

-- name: ListAnnouncements :many
SELECT * FROM announcements WHERE published OR @include_drafts::boolean ORDER BY pinned DESC, created_at DESC LIMIT 100;

-- name: UserAnnouncements :many
SELECT a.*, (r.user_id IS NOT NULL)::boolean AS read FROM announcements a
LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
WHERE a.published ORDER BY a.pinned DESC, a.created_at DESC LIMIT 50;

-- name: MarkAnnouncementsRead :exec
INSERT INTO announcement_reads (user_id, announcement_id)
SELECT $1, id FROM announcements WHERE published ON CONFLICT DO NOTHING;

-- name: CreateAnnouncement :one
INSERT INTO announcements (title_ru, title_en, body_ru, body_en, kind, published, pinned) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: UpdateAnnouncement :one
UPDATE announcements SET title_ru = $2, title_en = $3, body_ru = $4, body_en = $5, kind = $6, published = $7, pinned = $8, updated_at = now()
WHERE id = $1 RETURNING *;

-- name: DeleteAnnouncement :exec
DELETE FROM announcements WHERE id = $1;

-- name: AddUserEvent :exec
INSERT INTO user_events (user_id, kind, details, ip) VALUES ($1, $2, $3, $4);

-- name: ListUserEvents :many
SELECT * FROM user_events WHERE user_id = $1 ORDER BY id DESC LIMIT $2;
