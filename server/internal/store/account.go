package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// AskedQuestion is what is kept of a question to the tutor: not its words,
// which were never stored, only that it was asked.
type AskedQuestion struct {
	AskedAt          time.Time  `json:"askedAt"`
	ClipID           *uuid.UUID `json:"clipId"`
	Outcome          string     `json:"outcome"`
	PromptTokens     *int       `json:"promptTokens"`
	CompletionTokens *int       `json:"completionTokens"`
}

// QuestionsOf is every question one learner has put to the tutor, oldest first.
func (s *Store) QuestionsOf(ctx context.Context, userID uuid.UUID) ([]AskedQuestion, error) {
	rows, err := s.pool.Query(ctx, `
		select asked_at, clip_id, outcome, prompt_tokens, completion_tokens
		from tutor_questions where user_id = $1 order by asked_at`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (AskedQuestion, error) {
		var q AskedQuestion
		err := row.Scan(&q.AskedAt, &q.ClipID, &q.Outcome, &q.PromptTokens, &q.CompletionTokens)
		return q, err
	})
}

// ClipTitlesFor names the clips one learner has recorded takes of, so an
// export says "One step at a time" rather than a uuid.
func (s *Store) ClipTitlesFor(ctx context.Context, userID uuid.UUID) (map[uuid.UUID]string, error) {
	rows, err := s.pool.Query(ctx, `
		select distinct c.id, c.title from takes t join clips c on c.id = t.clip_id
		where t.user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID]string{}
	for rows.Next() {
		var id uuid.UUID
		var title string
		if err := rows.Scan(&id, &title); err != nil {
			return nil, err
		}
		out[id] = title
	}
	return out, rows.Err()
}

// DeleteAccount removes a user and everything that is theirs — takes, words,
// sessions, questions — and answers with the stored objects that were theirs
// too, for the caller to delete once the rows are gone: the avatar (clips
// bucket) and each take's recording and dub (takes bucket).
//
// Rows first, objects after. A crash in between leaves objects nothing points
// at, which cost storage; the other order would leave rows pointing at objects
// that are gone, which break screens.
func (s *Store) DeleteAccount(ctx context.Context, userID uuid.UUID) (avatar *string, takeKeys []string, err error) {
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `select avatar_key from users where id = $1 for update`,
			userID).Scan(&avatar); err != nil {
			return mapErr(err)
		}
		rows, err := tx.Query(ctx, `
			select key from takes, unnest(array[audio_key, dub_key]) as key
			where user_id = $1 and key is not null`, userID)
		if err != nil {
			return err
		}
		takeKeys, err = pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `delete from users where id = $1`, userID)
		return err
	})
	return avatar, takeKeys, err
}
