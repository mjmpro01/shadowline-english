package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Coins: the one currency. Every point of practice pays one, the day's goal,
// the weekly medals and the achievements pay more, and the Arena's shop is
// where they are spent. Every coin in and out is in coin_events.

// ErrNotEnoughCoins is a purchase the wallet cannot pay for.
var ErrNotEnoughCoins = errors.New("not enough coins")

// credit adds coins to a learner's wallet, and to the ledger.
func credit(ctx context.Context, tx pgx.Tx, user uuid.UUID, kind, item string, amount int) error {
	if amount <= 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `
		insert into wallets (user_id, coins) values ($1, $2)
		on conflict (user_id) do update set coins = wallets.coins + excluded.coins, updated_at = now()`,
		user, amount); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `insert into coin_events (user_id, kind, item, amount) values ($1, $2, $3, $4)`,
		user, kind, item, amount)
	return err
}

// debit takes coins from a learner's wallet, or refuses with
// ErrNotEnoughCoins and takes nothing.
func debit(ctx context.Context, tx pgx.Tx, user uuid.UUID, kind, item string, amount int) error {
	if amount <= 0 {
		return nil
	}
	tag, err := tx.Exec(ctx, `
		update wallets set coins = coins - $2, updated_at = now() where user_id = $1 and coins >= $2`,
		user, amount)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotEnoughCoins
	}
	_, err = tx.Exec(ctx, `insert into coin_events (user_id, kind, item, amount) values ($1, $2, $3, $4)`,
		user, kind, item, -amount)
	return err
}

// CoinEvent is one line of a learner's ledger.
type CoinEvent struct {
	Kind   string    `json:"kind"`
	Item   string    `json:"item"`
	Amount int       `json:"amount"`
	At     time.Time `json:"at"`
}

// Wallet is a learner's coins and the latest of where they came from.
type Wallet struct {
	Coins  int         `json:"coins"`
	Today  int         `json:"today"`
	Recent []CoinEvent `json:"recent"`
}

// Coins is a learner's balance.
func (s *Store) Coins(ctx context.Context, user uuid.UUID) (int, error) {
	var coins int
	err := s.pool.QueryRow(ctx, `select coalesce((select coins from wallets where user_id = $1), 0)`, user).Scan(&coins)
	return coins, err
}

// WalletOf is a learner's coins, what they earned today, and their last ten
// movements.
func (s *Store) WalletOf(ctx context.Context, user uuid.UUID, now time.Time) (Wallet, error) {
	out := Wallet{Recent: []CoinEvent{}}
	_, start, end := VietnamDay(now)
	if err := s.pool.QueryRow(ctx, `
		select coalesce((select coins from wallets where user_id = $1), 0),
		       coalesce((select sum(amount) from coin_events
		                 where user_id = $1 and amount > 0 and at >= $2 and at < $3), 0)::int`,
		user, start, end).Scan(&out.Coins, &out.Today); err != nil {
		return out, err
	}
	rows, err := s.pool.Query(ctx, `
		select kind, item, amount, at from coin_events where user_id = $1 order by id desc limit 10`, user)
	if err != nil {
		return out, err
	}
	out.Recent, err = pgx.CollectRows(rows, pgx.RowToStructByPos[CoinEvent])
	if out.Recent == nil {
		out.Recent = []CoinEvent{}
	}
	return out, err
}

// SetCoins sets a learner's balance outright. For the end-to-end tests only.
func (s *Store) SetCoins(ctx context.Context, user uuid.UUID, coins int) error {
	_, err := s.pool.Exec(ctx, `
		insert into wallets (user_id, coins) values ($1, $2)
		on conflict (user_id) do update set coins = excluded.coins, updated_at = now()`, user, coins)
	return err
}
