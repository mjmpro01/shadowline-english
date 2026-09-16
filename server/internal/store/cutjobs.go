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
// the caller is doing. `on conflict do nothing` makes a re-publish idempotent
// rather than a duplicate-key error.
func (s *Store) EnqueueCut(ctx context.Context, tx pgx.Tx, clipID uuid.UUID) error {
	_, err := tx.Exec(ctx,
		`insert into cut_jobs (clip_id) values ($1) on conflict (clip_id) do nothing`, clipID)
	return err
}

// CutQueueDepth is what to watch when video stops appearing: if this climbs,
// add cutter replicas.
func (s *Store) CutQueueDepth(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*)::int from cut_jobs where state = 'queued'`).Scan(&n)
	return n, err
}
