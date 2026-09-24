package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Cutting a clip's video out of its source is queued the same way scoring is —
// a table, claimed with `for update skip locked` — but it is a separate queue
// with its own worker.
//
// The two look alike and behave nothing alike. A learner watches the Practice
// screen waiting for a score, so scoring latency is the thing to protect;
// nobody waits on a cut, and one cut is an ffmpeg process that can run for
// seconds. Sharing a queue would let a batch of cuts sit in front of the score
// somebody is watching for.
//
// The claim and finish halves live in the Python cutter, next to ffmpeg. This
// side only ever enqueues.

// EnqueueCut schedules a clip's cut, in the same transaction as whatever else
// the caller is doing: its sound always, and its picture and still when the
// source has one.
//
// The sound used to be cut in the admin's browser and uploaded per clip — 563 kB
// for six seconds, 220 MB for a batch of four hundred, after the recording
// itself had already been sent once. The server has the recording, and the
// cutter was already reading it for the picture.
//
// The insert selects rather than values: a clip with no stored source produces
// no row, so a clip published without one — or before its upload landed — is
// never handed to a cutter that has nothing to cut it from. `on conflict do
// nothing` makes a re-publish idempotent rather than a duplicate-key error.
//
// Reports whether a job was written, and whether the source has a picture:
// together they say whether the clip's sound, and its picture, are coming.
func (s *Store) EnqueueCut(ctx context.Context, tx pgx.Tx, clipID uuid.UUID) (queued, picture bool, err error) {
	err = tx.QueryRow(ctx, `
		with source as (
			select s.has_video from clips c
			join clip_sources s on s.id = c.source_id
			where c.id = $1 and s.upload_state = 'stored'),
		job as (
			insert into cut_jobs (clip_id)
			select $1 from source
			on conflict (clip_id) do nothing
			returning 1)
		select exists (select 1 from job), coalesce((select has_video from source), false)`,
		clipID).Scan(&queued, &picture)
	return queued, picture, err
}

// CutQueueDepth is what to watch when video stops appearing: if this climbs,
// add cutter replicas.
func (s *Store) CutQueueDepth(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*)::int from cut_jobs where state = 'queued'`).Scan(&n)
	return n, err
}
