package store

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Filters for the console's list of accounts.
const (
	UsersAll       = ""
	UsersAdmins    = "admins"
	UsersSuspended = "suspended"
)

// Account is one row of the console's list of people: who they are, what they
// may do, and enough of what they have done to tell an active learner from an
// address that signed in once.
type Account struct {
	ID           uuid.UUID  `json:"id"`
	Email        string     `json:"email"`
	Name         string     `json:"name"`
	IsAdmin      bool       `json:"isAdmin"`
	AdminGranted bool       `json:"adminGranted"`
	SuspendedAt  *time.Time `json:"suspendedAt"`
	CreatedAt    time.Time  `json:"createdAt"`
	LastSignedIn *time.Time `json:"lastSignedIn"`
	Takes        int        `json:"takes"`
	Questions    int        `json:"questions"`
}

// Accounts is the console's list, newest first, searched by name or address and
// filtered to admins or suspended accounts, a page at a time.
func (s *Store) Accounts(ctx context.Context, query, filter string, limit, offset int) ([]Account, int, error) {
	where := []string{"true"}
	args := []any{}
	if q := strings.TrimSpace(query); q != "" {
		args = append(args, "%"+escapeLike(q)+"%")
		where = append(where, "(u.email ilike $1 or u.name ilike $1)")
	}
	switch filter {
	case UsersAdmins:
		where = append(where, "u.is_admin")
	case UsersSuspended:
		where = append(where, "u.suspended_at is not null")
	}
	cond := strings.Join(where, " and ")

	var total int
	if err := s.pool.QueryRow(ctx, `select count(*) from users u where `+cond, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	n := len(args)
	rows, err := s.pool.Query(ctx, `
		select u.id, u.email, u.name, u.is_admin, u.admin_granted, u.suspended_at,
		       u.created_at, u.last_signed_in_at,
		       (select count(*) from takes t where t.user_id = u.id),
		       (select count(*) from tutor_questions q where q.user_id = u.id)
		from users u
		where `+cond+`
		order by u.created_at desc, u.id
		limit $`+itoa(n-1)+` offset $`+itoa(n), args...)
	if err != nil {
		return nil, 0, err
	}
	accounts, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Account, error) {
		var a Account
		err := row.Scan(&a.ID, &a.Email, &a.Name, &a.IsAdmin, &a.AdminGranted, &a.SuspendedAt,
			&a.CreatedAt, &a.LastSignedIn, &a.Takes, &a.Questions)
		return a, err
	})
	return accounts, total, err
}

// AccountByID is one row of the same list.
func (s *Store) AccountByID(ctx context.Context, id uuid.UUID) (Account, error) {
	var a Account
	err := s.pool.QueryRow(ctx, `
		select u.id, u.email, u.name, u.is_admin, u.admin_granted, u.suspended_at,
		       u.created_at, u.last_signed_in_at,
		       (select count(*) from takes t where t.user_id = u.id),
		       (select count(*) from tutor_questions q where q.user_id = u.id)
		from users u where u.id = $1`, id).Scan(&a.ID, &a.Email, &a.Name, &a.IsAdmin,
		&a.AdminGranted, &a.SuspendedAt, &a.CreatedAt, &a.LastSignedIn, &a.Takes, &a.Questions)
	return a, mapErr(err)
}

// AccessChange is what the console changes about an account. Nil leaves it.
type AccessChange struct {
	Admin     *bool
	Suspended *bool
}

// SetAccess gives or takes admin rights and suspends or restores an account.
//
// owner is whether the address is in ADMIN_EMAILS: an owner stays an admin
// whatever is granted, which is what keeps is_admin equal to "an owner, or
// granted". Suspending deletes the account's sessions in the same transaction,
// so the person is signed out now, not when a cookie runs out.
func (s *Store) SetAccess(ctx context.Context, id uuid.UUID, owner bool, change AccessChange) (Account, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if change.Admin != nil {
			tag, err := tx.Exec(ctx, `
				update users set admin_granted = $2, is_admin = $2 or $3 where id = $1`,
				id, *change.Admin, owner)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return ErrNotFound
			}
		}
		if change.Suspended != nil {
			tag, err := tx.Exec(ctx, `
				update users set suspended_at = case when $2 then coalesce(suspended_at, now()) end
				where id = $1`, id, *change.Suspended)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return ErrNotFound
			}
			if *change.Suspended {
				if _, err := tx.Exec(ctx, `delete from sessions where user_id = $1`, id); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return Account{}, err
	}
	return s.AccountByID(ctx, id)
}
