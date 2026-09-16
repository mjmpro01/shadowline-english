package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarKey *string   `json:"avatarKey"`
	IsAdmin   bool      `json:"isAdmin"`
	CreatedAt time.Time `json:"createdAt"`
}

// UpsertUser records the identity the provider vouched for. isAdmin is passed in
// from ADMIN_EMAILS and re-applied on every sign-in, so removing an address from
// that list takes effect the next time the person logs in rather than never.
func (s *Store) UpsertUser(ctx context.Context, email, name string, isAdmin bool) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		insert into users (email, name, is_admin)
		values ($1, $2, $3)
		on conflict (email) do update
			set name = case when excluded.name <> '' then excluded.name else users.name end,
			    is_admin = excluded.is_admin
		returning id, email, name, avatar_key, is_admin, created_at`,
		email, name, isAdmin).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarKey, &u.IsAdmin, &u.CreatedAt)
	return u, mapErr(err)
}

func (s *Store) UserByID(ctx context.Context, id uuid.UUID) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		select id, email, name, avatar_key, is_admin, created_at from users where id = $1`,
		id).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarKey, &u.IsAdmin, &u.CreatedAt)
	return u, mapErr(err)
}

func (s *Store) UpdateProfile(ctx context.Context, id uuid.UUID, name string, avatarKey *string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		update users set name = $2, avatar_key = $3
		where id = $1
		returning id, email, name, avatar_key, is_admin, created_at`,
		id, name, avatarKey).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarKey, &u.IsAdmin, &u.CreatedAt)
	return u, mapErr(err)
}
