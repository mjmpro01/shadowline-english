// Package db opens the connection pool and runs migrations. Migrations are
// embedded in the binary so a deploy is one artifact, not a binary plus a
// directory of SQL that has to travel with it.
package db

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return pool, nil
}

// Migrate applies every embedded migration that has not run yet, in filename
// order, each in its own transaction alongside the row recording it — so a
// migration that fails halfway leaves neither its changes nor its bookkeeping.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `
		create table if not exists schema_migrations (
			name       text primary key,
			applied_at timestamptz not null default now()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	names, err := migrationNames()
	if err != nil {
		return err
	}

	for _, name := range names {
		up, err := upSection(name)
		if err != nil {
			return err
		}
		if err := applyOnce(ctx, pool, name, up); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
	}
	return nil
}

func applyOnce(ctx context.Context, pool *pgxpool.Pool, name, up string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The insert both claims the migration and tells us whether to run it: a
	// concurrent server starting at the same time blocks here and then sees the
	// row, so the SQL below runs exactly once.
	tag, err := tx.Exec(ctx,
		`insert into schema_migrations (name) values ($1) on conflict do nothing`, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Rollback(ctx)
	}
	if _, err := tx.Exec(ctx, up); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func migrationNames() ([]string, error) {
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

// upSection returns everything between the goose-style `-- +goose Up` and
// `-- +goose Down` markers. The markers are kept so the files stay readable by
// goose if this ever outgrows the runner above.
func upSection(name string) (string, error) {
	raw, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		return "", err
	}
	body := string(raw)
	start := strings.Index(body, "-- +goose Up")
	if start < 0 {
		return "", fmt.Errorf("no `-- +goose Up` marker")
	}
	body = body[start+len("-- +goose Up"):]
	if end := strings.Index(body, "-- +goose Down"); end >= 0 {
		body = body[:end]
	}
	if strings.TrimSpace(body) == "" {
		return "", fmt.Errorf("Up section is empty")
	}
	return body, nil
}
