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

// EnqueueCut schedules a clip's video, in the same transaction as whatever else
// the caller is doing.
//
// The insert selects rather than values: a source with no picture produces no
// row, so an audio upload — which has a source of its own now, because
// transcription wants the file either way — never hands the cutter a job whose
// only possible outcome is failing three times.
//
// `on conflict do nothing` makes a re-publish idempotent rather than a
// duplicate-key error.
// Reports whether a job was actually written. It is not for every clip with a
// source — an audio upload has one too — and the caller needs to know, because
// the existence of the job is what makes the clip say its picture is coming.
func (s *Store) EnqueueCut(ctx context.Context, tx pgx.Tx, clipID uuid.UUID) (bool, error) {
	tag, err := tx.Exec(ctx, `
		insert into cut_jobs (clip_id)
		select c.id from clips c
		join clip_sources s on s.id = c.source_id
		where c.id = $1 and s.has_video
		on conflict (clip_id) do nothing`, clipID)
	return tag.RowsAffected() > 0, err
}

// CutQueueDepth is what to watch when video stops appearing: if this climbs,
// add cutter replicas.
func (s *Store) CutQueueDepth(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*)::int from cut_jobs where state = 'queued'`).Scan(&n)
	return n, err
}
