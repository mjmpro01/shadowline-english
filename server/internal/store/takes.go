package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type TakeStatus string

const (
	TakePending TakeStatus = "pending"
	TakeScored  TakeStatus = "scored"
	TakeFailed  TakeStatus = "failed"
)

type Take struct {
	ID         uuid.UUID          `json:"id"`
	ClipID     uuid.UUID          `json:"videoId"`
	Score      *float64           `json:"score"`
	Scores     map[string]float64 `json:"scores"`
	Analysis   json.RawMessage    `json:"analysis"`
	Status     TakeStatus         `json:"status"`
	Error      *string            `json:"error,omitempty"`
	RecordedAt time.Time          `json:"recordedAt"`
	HasAudio   bool               `json:"hasAudio"`
	AudioKey   *string            `json:"-"`
}

const takeColumns = `id, clip_id, score, scores, analysis, status, error, recorded_at, audio_key`

func scanTake(row pgx.Row) (Take, error) {
	var t Take
	var scores, analysis []byte
	err := row.Scan(&t.ID, &t.ClipID, &t.Score, &scores, &analysis, &t.Status, &t.Error, &t.RecordedAt, &t.AudioKey)
	if err != nil {
		return t, mapErr(err)
	}
	if len(scores) > 0 {
		if err := json.Unmarshal(scores, &t.Scores); err != nil {
			return t, err
		}
	}
	// Left as raw JSON: the contour is only ever handed back to the browser, and
	// decoding a few hundred points per take to re-encode them would be waste.
	if len(analysis) > 0 && string(analysis) != "null" {
		t.Analysis = analysis
	}
	t.HasAudio = t.AudioKey != nil
	return t, nil
}

func (s *Store) ListTakes(ctx context.Context, userID uuid.UUID) ([]Take, error) {
	rows, err := s.pool.Query(ctx,
		`select `+takeColumns+` from takes where user_id = $1 order by recorded_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	takes := []Take{}
	for rows.Next() {
		t, err := scanTake(rows)
		if err != nil {
			return nil, err
		}
		takes = append(takes, t)
	}
	return takes, rows.Err()
}

// TakeByID scopes to the owner, so a guessed id from another account is a 404
// rather than someone else's recording.
func (s *Store) TakeByID(ctx context.Context, userID, id uuid.UUID) (Take, error) {
	return scanTake(s.pool.QueryRow(ctx,
		`select `+takeColumns+` from takes where id = $1 and user_id = $2`, id, userID))
}

// CreateTakeWithJob writes the take and its scoring job in one transaction. That
// is the whole reason the queue lives in Postgres: there is no window where a
// take exists with nothing scheduled to score it.
func (s *Store) CreateTakeWithJob(ctx context.Context, userID, clipID uuid.UUID, audioKey string, enqueue bool) (Take, error) {
	var take Take
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			insert into takes (user_id, clip_id, audio_key, status)
			values ($1, $2, $3, $4)
			returning `+takeColumns,
			userID, clipID, audioKey, statusFor(enqueue))
		t, err := scanTake(row)
		if err != nil {
			return err
		}
		take = t

		if !enqueue {
			return nil
		}
		_, err = tx.Exec(ctx, `insert into scoring_jobs (take_id) values ($1)`, t.ID)
		return err
	})
	return take, err
}

// statusFor: a clip with no source audio has nothing to score against, so the
// take is final on arrival rather than sitting pending forever.
func statusFor(enqueue bool) TakeStatus {
	if enqueue {
		return TakePending
	}
	return TakeScored
}

func (s *Store) DeleteTake(ctx context.Context, userID, id uuid.UUID) (*string, error) {
	var key *string
	err := s.pool.QueryRow(ctx,
		`delete from takes where id = $1 and user_id = $2 returning audio_key`, id, userID).Scan(&key)
	return key, mapErr(err)
}
