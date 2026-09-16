// Package store holds every SQL statement the server runs. Queries are written
// by hand rather than generated: there are five tables, and a generator would
// be one more tool to install before the schema can change.
package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// ErrNotFound lets handlers answer 404 without importing pgx.
var ErrNotFound = errors.New("not found")

func mapErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// inTx runs fn inside a transaction, rolling back on error. Used wherever two
// writes have to land together — a take and its scoring job, above all.
func (s *Store) inTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
