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
	// EmailVerifiedAt is when the address was proven to belong to whoever signs
	// in to this account. Once set, an unverified identity cannot sign in to it.
	EmailVerifiedAt *time.Time `json:"-"`
	// NativeLanguage is the language tag the learner chose as their own, or
	// nil until they have been asked.
	NativeLanguage *string `json:"nativeLanguage"`
}

// userColumns is what every read of a user selects, in the order scanUser
// reads it.
const userColumns = `id, email, name, avatar_key, is_admin, created_at, suspended_at, email_verified_at, native_language`

func scanUser(row interface{ Scan(...any) error }) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.AvatarKey, &u.IsAdmin, &u.CreatedAt, &u.SuspendedAt, &u.EmailVerifiedAt, &u.NativeLanguage)
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
// UpsertUser records a sign-in. verified says whether the identity proved it
// owns the address; the first time one does, the account remembers it.
func (s *Store) UpsertUser(ctx context.Context, email, name string, owner, verified bool) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `
		insert into users (email, name, is_admin, last_signed_in_at, email_verified_at)
		values ($1, $2, $3, now(), case when $4 then now() end)
		on conflict (email) do update
			set name = case when excluded.name <> '' then excluded.name else users.name end,
			    is_admin = excluded.is_admin or users.admin_granted,
			    last_signed_in_at = now(),
			    email_verified_at = coalesce(users.email_verified_at, excluded.email_verified_at)
		returning `+userColumns,
		email, name, owner, verified))
}

// UserByEmail is the account an address names, or ErrNotFound. Case does not
// matter: Google may hand back "Ada@Example.com" for the address Keycloak
// knows as "ada@example.com", and the question is whose address it is.
func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx,
		`select `+userColumns+` from users where lower(email) = lower($1) order by created_at limit 1`, email))
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

// SetNativeLanguage records the language the learner calls their own.
func (s *Store) SetNativeLanguage(ctx context.Context, id uuid.UUID, language string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `
		update users set native_language = $2
		where id = $1
		returning `+userColumns,
		id, language))
}
