package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// The queue is a table, not a broker. One take produces one job; at ten thousand
// learners recording fifty takes a day that is about six jobs a second, and the
// cost of scoring one is a second of Python — so the bottleneck is worker CPU,
// which no broker changes. Postgres also lets the job be written in the same
// transaction as the take, which a broker cannot.
//
// The interface below is deliberately narrow (claim, complete, fail, release) so
// swapping in NATS or Kafka later touches this file and nothing else.

// MaxAttempts is how many times a job may be claimed before it is left alone.
// Three covers a worker crashing mid-job; beyond that the take is genuinely
// unscoreable and retrying only burns CPU.
const MaxAttempts = 3

// StaleAfter is how long a claimed job may sit before another worker may take
// it. Scoring a six-second clip is sub-second work, so five minutes only ever
// catches a worker that died.
const StaleAfter = 5 * time.Minute

type Job struct {
	ID       int64     `json:"id"`
	TakeID   uuid.UUID `json:"takeId"`
	Attempts int       `json:"attempts"`
	ClipID   uuid.UUID `json:"clipId"`
	// Keys of the two recordings to compare.
	TakeAudioKey string `json:"takeAudioKey"`
	ClipAudioKey string `json:"clipAudioKey"`
}

// ErrNoJobs is returned by ClaimJob when the queue is empty, which is the
// common case and not a failure.
var ErrNoJobs = errors.New("no jobs queued")

// ClaimJob takes one job and marks it running. `for update skip locked` is what
// lets many workers poll the same table without blocking each other or handing
// the same job to two of them.
func (s *Store) ClaimJob(ctx context.Context) (Job, error) {
	var j Job
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var id int64
		err := tx.QueryRow(ctx, `
			select id from scoring_jobs
			where (state = 'queued')
			   or (state = 'running' and locked_at < now() - $1::interval)
			order by created_at
			for update skip locked
			limit 1`, StaleAfter.String()).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoJobs
		}
		if err != nil {
			return err
		}

		return tx.QueryRow(ctx, `
			update scoring_jobs
			set state = 'running', attempts = attempts + 1, locked_at = now()
			from takes t, clips c
			where scoring_jobs.id = $1
			  and t.id = scoring_jobs.take_id
			  and c.id = t.clip_id
			returning scoring_jobs.id, scoring_jobs.take_id, scoring_jobs.attempts,
			          t.clip_id, t.audio_key, c.audio_key`, id).
			Scan(&j.ID, &j.TakeID, &j.Attempts, &j.ClipID, &j.TakeAudioKey, &j.ClipAudioKey)
	})
	return j, err
}

// CompleteJob records the result and removes the job, both at once, so a take
// can never read as scored while its job is still queued.
func (s *Store) CompleteJob(ctx context.Context, jobID int64, takeID uuid.UUID, score float64, scores map[string]float64, analysis json.RawMessage) error {
	scoresJSON, err := json.Marshal(scores)
	if err != nil {
		return err
	}
	if len(analysis) == 0 {
		analysis = json.RawMessage("null")
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			update takes set score = $2, scores = $3, analysis = $4, status = 'scored', error = null
			where id = $1`, takeID, score, scoresJSON, []byte(analysis)); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `delete from scoring_jobs where id = $1`, jobID)
		return err
	})
}

// FailJob puts the job back for another attempt, or gives up and marks the take
// failed once it has had MaxAttempts. Either way the learner's screen stops
// saying "measuring" forever.
func (s *Store) FailJob(ctx context.Context, jobID int64, takeID uuid.UUID, attempts int, reason string) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if attempts >= MaxAttempts {
			if _, err := tx.Exec(ctx,
				`update takes set status = 'failed', error = $2 where id = $1`, takeID, reason); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `delete from scoring_jobs where id = $1`, jobID)
			return err
		}
		_, err := tx.Exec(ctx,
			`update scoring_jobs set state = 'queued', locked_at = null, error = $2 where id = $1`,
			jobID, reason)
		return err
	})
}

// QueueDepth is what a dashboard or an alert would watch: if this climbs, add
// worker replicas.
func (s *Store) QueueDepth(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*)::int from scoring_jobs where state = 'queued'`).Scan(&n)
	return n, err
}
