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
	// SuspendedAt is set while the account is suspended: it cannot sign in.
	SuspendedAt *time.Time `json:"-"`
}

// userColumns is what every read of a user selects, in the order scanUser
// reads it.
const userColumns = `id, email, name, avatar_key, is_admin, created_at, suspended_at`

func scanUser(row interface{ Scan(...any) error }) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.AvatarKey, &u.IsAdmin, &u.CreatedAt, &u.SuspendedAt)
	return u, mapErr(err)
}

// UpsertUser records the identity the provider vouched for, and the sign-in.
//
// owner is whether the address is in ADMIN_EMAILS, and is re-read on every
// sign-in, so taking an address off that list takes effect the next time the
// person logs in. It no longer decides alone: an admin somebody made one in the
// console stays one (admin_granted), which it used not to.
//
// A suspended account comes back with SuspendedAt set; the caller refuses it.
func (s *Store) UpsertUser(ctx context.Context, email, name string, owner bool) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `
		insert into users (email, name, is_admin, last_signed_in_at)
		values ($1, $2, $3, now())
		on conflict (email) do update
			set name = case when excluded.name <> '' then excluded.name else users.name end,
			    is_admin = excluded.is_admin or users.admin_granted,
			    last_signed_in_at = now()
		returning `+userColumns,
		email, name, owner))
}

func (s *Store) UserByID(ctx context.Context, id uuid.UUID) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `select `+userColumns+` from users where id = $1`, id))
}

func (s *Store) UpdateProfile(ctx context.Context, id uuid.UUID, name string, avatarKey *string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `
		update users set name = $2, avatar_key = $3
		where id = $1
		returning `+userColumns,
		id, name, avatarKey))
}
