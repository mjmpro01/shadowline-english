package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Muxing a learner's voice onto the clip's picture is the fourth queue, and the
// only one somebody is watching a spinner for: a cut and a transcript happen
// while an admin gets on with something else, but a dub is requested by name
// and waited on. That is why it has its own worker rather than queueing behind
// a batch of cuts.
//
// Requested rather than automatic: a line gets practised a dozen times and
// nobody wants a file for each attempt.

// ErrNoVideo is returned when the clip behind a take has no picture to dub onto
// — an audio clip, or one whose cut has not landed.
var ErrNoVideo = errors.New("this clip has no video to dub")

// EnqueueDub schedules a take's dub, once. A second request while one is
// already queued is the same request, not a second job.
func (s *Store) EnqueueDub(ctx context.Context, takeID uuid.UUID) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		var hasVideo bool
		err := tx.QueryRow(ctx, `
			select c.video_key is not null
			from takes t join clips c on c.id = t.clip_id
			where t.id = $1 and t.audio_key is not null`, takeID).Scan(&hasVideo)
		if errors.Is(err, pgx.ErrNoRows) {
			// Either the take is gone or it has no recording. Both mean there
			// is nothing to dub, and neither is a server error.
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if !hasVideo {
			return ErrNoVideo
		}
		_, err = tx.Exec(ctx,
			`insert into dub_jobs (take_id) values ($1) on conflict (take_id) do nothing`, takeID)
		return err
	})
}

// DubQueued reports whether a take's dub is still being made, which is what
// tells the screen to keep waiting rather than to offer a file.
func (s *Store) DubQueued(ctx context.Context, takeID uuid.UUID) (bool, error) {
	var queued bool
	err := s.pool.QueryRow(ctx,
		`select exists (select 1 from dub_jobs where take_id = $1)`, takeID).Scan(&queued)
	return queued, err
}

// DubQueueDepth is what to watch when dubs stop appearing.
func (s *Store) DubQueueDepth(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*)::int from dub_jobs where state = 'queued'`).Scan(&n)
	return n, err
}
