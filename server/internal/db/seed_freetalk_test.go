package db_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shadowline/server/internal/db"
)

func TestMigrateSeedsFreetalkGlosses(t *testing.T) {
	adminURL := os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" {
		t.Skip("set TEST_DATABASE_URL to run db tests against Postgres")
	}

	ctx := context.Background()
	name := "sl_ft_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	admin, err := pgxpool.New(ctx, adminURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "drop database if exists "+name+" with (force)")
		admin.Close()
	})
	if _, err := admin.Exec(ctx, "create database "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}

	dsn := replaceDatabase(adminURL, name)
	pool, err := db.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var applied time.Time
	if err := pool.QueryRow(ctx,
		`select applied_at from schema_migrations where name = $1`,
		"00008_freetalk_glosses",
	).Scan(&applied); err != nil {
		t.Fatalf("migration row: %v", err)
	}
	if applied.IsZero() {
		t.Fatal("expected 00008_freetalk_glosses to be recorded")
	}

	for _, word := range []string{"we", "the"} {
		var meaning, source string
		if err := pool.QueryRow(ctx,
			`select meaning, source from glosses where word = $1`, word,
		).Scan(&meaning, &source); err != nil {
			t.Fatalf("%s: %v", word, err)
		}
		if meaning == "" {
			t.Fatalf("%s: empty meaning", word)
		}
		if source != "freetalk" {
			t.Fatalf("%s: source = %q, want freetalk", word, source)
		}
	}

	var filled int
	if err := pool.QueryRow(ctx,
		`select count(*)::int from glosses where meaning <> ''`,
	).Scan(&filled); err != nil {
		t.Fatalf("count: %v", err)
	}
	if filled < 10000 {
		t.Fatalf("filled %d glosses, want at least 10000", filled)
	}

	// Second migrate must be a no-op for the seed step (and must not fail).
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}

func TestMigrateFillsEmptyMeaningsOnly(t *testing.T) {
	adminURL := os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" {
		t.Skip("set TEST_DATABASE_URL to run db tests against Postgres")
	}

	ctx := context.Background()
	name := "sl_ft2_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	admin, err := pgxpool.New(ctx, adminURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "drop database if exists "+name+" with (force)")
		admin.Close()
	})
	if _, err := admin.Exec(ctx, "create database "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}

	dsn := replaceDatabase(adminURL, name)
	pool, err := db.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer pool.Close()

	// Apply SQL migrations without the FreeTalk seed by inserting the
	// bookkeeping row first, then plant a gloss the seed must not overwrite.
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Wipe FreeTalk's we and pretend a paid source already defined it, then
	// re-run only by deleting the migration marker.
	if _, err := pool.Exec(ctx, `
		update glosses set meaning = 'already paid', source = 'model' where word = 'we';
		delete from schema_migrations where name = '00008_freetalk_glosses'`); err != nil {
		t.Fatalf("reset: %v", err)
	}

	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("re-seed: %v", err)
	}

	var meaning, source string
	if err := pool.QueryRow(ctx,
		`select meaning, source from glosses where word = $1`, "we",
	).Scan(&meaning, &source); err != nil {
		t.Fatalf("we: %v", err)
	}
	if meaning != "already paid" || source != "model" {
		t.Fatalf("paid gloss overwritten: meaning=%q source=%q", meaning, source)
	}
}

func replaceDatabase(dsn, name string) string {
	// TEST_DATABASE_URL looks like postgres://user:pass@host:5432/dbname
	i := strings.LastIndex(dsn, "/")
	if i < 0 {
		return dsn
	}
	rest := dsn[i+1:]
	if q := strings.Index(rest, "?"); q >= 0 {
		return dsn[:i+1] + name + rest[q:]
	}
	return dsn[:i+1] + name
}
