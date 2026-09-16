package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// CreateSession stores the opaque session id. The cookie carries only this id,
// so signing out is a delete here rather than something the client can undo by
// keeping an old token.
func (s *Store) CreateSession(ctx context.Context, id string, userID uuid.UUID, expires time.Time) error {
	_, err := s.pool.Exec(ctx,
		`insert into sessions (id, user_id, expires_at) values ($1, $2, $3)`, id, userID, expires)
	return mapErr(err)
}

func (s *Store) UserBySession(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		select u.id, u.email, u.name, u.avatar_key, u.is_admin, u.created_at
		from sessions s join users u on u.id = s.user_id
		where s.id = $1 and s.expires_at > now()`,
		id).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarKey, &u.IsAdmin, &u.CreatedAt)
	return u, mapErr(err)
}

func (s *Store) DeleteSession(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `delete from sessions where id = $1`, id)
	return err
}

// DeleteExpiredSessions is called on a timer; without it the table only grows.
func (s *Store) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `delete from sessions where expires_at <= now()`)
	return tag.RowsAffected(), err
}
