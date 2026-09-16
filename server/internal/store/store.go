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

// TruncateAll empties every table. Used by the test-only reset route; `cascade`
// covers the foreign keys, and restarting the identities keeps job ids
// predictable across a test run.
func (s *Store) TruncateAll(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		truncate users, clips, clip_sources, takes, vocab_words, scoring_jobs, cut_jobs, sessions
		restart identity cascade`)
	return err
}
