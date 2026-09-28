package db_test

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shadowline/server/internal/db"
)

// A clip cut by a cutter from before sound was cut on the server has its
// picture and no sound, and no job left to make one. 00017 queues it again;
// a clip that has its sound, or already has a job, is left alone.
func TestMissingSoundIsQueuedAgain(t *testing.T) {
	adminURL := os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" {
		t.Skip("set TEST_DATABASE_URL to run db tests against Postgres")
	}
	ctx := context.Background()
	name := "sl_rq_" + strings.ReplaceAll(uuid.NewString(), "-", "")
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
	pool, err := db.Open(ctx, replaceDatabase(adminURL, name))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	// The state an old cutter left: a stored recording, three clips cut from
	// it — one with a picture and no sound, one with both, one with no sound
	// whose cut is still queued — and a starter clip with no recording at all.
	var source uuid.UUID
	if err := pool.QueryRow(ctx, `
		insert into clip_sources (name, key, content_type) values ('friends.mp4', 'source/f.mp4', 'video/mp4')
		returning id`).Scan(&source); err != nil {
		t.Fatalf("source: %v", err)
	}
	clip := func(title string, audio, video *string) uuid.UUID {
		var id uuid.UUID
		if err := pool.QueryRow(ctx, `
			insert into clips (title, source_id, audio_key, video_key) values ($1, $2, $3, $4)
			returning id`, title, source, audio, video).Scan(&id); err != nil {
			t.Fatalf("clip %s: %v", title, err)
		}
		return id
	}
	key := func(s string) *string { return &s }
	silent := clip("picture, no sound", nil, key("v1.mp4"))
	whole := clip("both", key("a2.wav"), key("v2.mp4"))
	queued := clip("still queued", nil, nil)
	if _, err := pool.Exec(ctx, `insert into cut_jobs (clip_id, attempts) values ($1, 2)`, queued); err != nil {
		t.Fatalf("queued job: %v", err)
	}
	if _, err := pool.Exec(ctx, `insert into clips (title) values ('starter')`); err != nil {
		t.Fatalf("starter clip: %v", err)
	}

	// Run 00017 again over that state.
	if _, err := pool.Exec(ctx,
		`delete from schema_migrations where name = '00017_requeue_missing_sound.sql'`); err != nil {
		t.Fatalf("forget 00017: %v", err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate again: %v", err)
	}

	jobs := map[uuid.UUID]int{}
	rows, err := pool.Query(ctx, `select clip_id, attempts from cut_jobs`)
	if err != nil {
		t.Fatalf("read jobs: %v", err)
	}
	for rows.Next() {
		var id uuid.UUID
		var attempts int
		if err := rows.Scan(&id, &attempts); err != nil {
			t.Fatalf("scan: %v", err)
		}
		jobs[id] = attempts
	}
	if len(jobs) != 2 {
		t.Fatalf("%d jobs after the migration, want 2: %v", len(jobs), jobs)
	}
	if _, ok := jobs[silent]; !ok {
		t.Fatal("the clip with a picture and no sound was not queued")
	}
	if _, ok := jobs[whole]; ok {
		t.Fatal("a clip that has its sound was queued")
	}
	if jobs[queued] != 2 {
		t.Fatalf("the job already waiting was replaced: attempts %d, want 2", jobs[queued])
	}
}
