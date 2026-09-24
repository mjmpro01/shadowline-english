package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Outcomes of a question put to the tutor.
const (
	TutorAnswered = "answered"
	TutorStopped  = "stopped"
	TutorFailed   = "failed"
)

// Question is the start of one question to the tutor: who asked, about what,
// of which model.
type Question struct {
	UserID uuid.UUID
	ClipID *uuid.UUID
	Model  string
}

// AskTutor records a question if the learner has allowance left for it.
//
// At most max questions in any window (no limit when max is 0): it answers with
// the new row's id, or with
// ok false and how long until the oldest question in the window falls out of it.
// The count and the insert happen under a lock on the learner's own row, so two
// questions sent at once cannot both be the last one allowed — and every API
// instance counts the same rows.
func (s *Store) AskTutor(ctx context.Context, q Question, max int, window time.Duration) (id int64, ok bool, wait time.Duration, err error) {
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select 1 from users where id = $1 for update`, q.UserID); err != nil {
			return err
		}
		if max <= 0 {
			ok = true
			return tx.QueryRow(ctx, `
				insert into tutor_questions (user_id, clip_id, model) values ($1, $2, $3)
				returning id`, q.UserID, q.ClipID, q.Model).Scan(&id)
		}
		var count int
		var oldest *time.Time
		if err := tx.QueryRow(ctx, `
			select count(*), min(asked_at) from tutor_questions
			where user_id = $1 and asked_at > now() - make_interval(secs => $2)`,
			q.UserID, window.Seconds()).Scan(&count, &oldest); err != nil {
			return err
		}
		if count >= max && oldest != nil {
			var now time.Time
			if err := tx.QueryRow(ctx, `select now()`).Scan(&now); err != nil {
				return err
			}
			wait = oldest.Add(window).Sub(now)
			return nil
		}
		ok = true
		return tx.QueryRow(ctx, `
			insert into tutor_questions (user_id, clip_id, model) values ($1, $2, $3)
			returning id`, q.UserID, q.ClipID, q.Model).Scan(&id)
	})
	return id, ok, wait, err
}

// TutorAnswer records how a question ended and what the router said it cost.
// Tokens are nil when the router did not say.
func (s *Store) TutorAnswer(ctx context.Context, id int64, outcome string, promptTokens, completionTokens *int) error {
	_, err := s.pool.Exec(ctx, `
		update tutor_questions
		set outcome = $2, prompt_tokens = $3, completion_tokens = $4, answered_at = now()
		where id = $1`, id, outcome, promptTokens, completionTokens)
	return err
}

// TutorDay is one day of the tutor's use.
type TutorDay struct {
	Day              time.Time `json:"day"`
	Questions        int       `json:"questions"`
	Learners         int       `json:"learners"`
	Failed           int       `json:"failed"`
	PromptTokens     int64     `json:"promptTokens"`
	CompletionTokens int64     `json:"completionTokens"`
}

// TutorLearner is one learner's use of the tutor over a period.
type TutorLearner struct {
	UserID           uuid.UUID `json:"userId"`
	Email            string    `json:"email"`
	Name             string    `json:"name"`
	Questions        int       `json:"questions"`
	PromptTokens     int64     `json:"promptTokens"`
	CompletionTokens int64     `json:"completionTokens"`
	LastAsked        time.Time `json:"lastAsked"`
}

// TutorUsage is the tutor's use over the last `days` days, by day (newest
// first, days with no questions left out) and by learner (heaviest first).
//
// Days are UTC days. The console shows them as dates, and a day boundary in
// one time zone is as arbitrary as in another.
func (s *Store) TutorUsage(ctx context.Context, days, learners int) ([]TutorDay, []TutorLearner, error) {
	since := `now() - make_interval(days => $1)`
	rows, err := s.pool.Query(ctx, `
		select date_trunc('day', asked_at at time zone 'UTC') as day,
		       count(*), count(distinct user_id),
		       count(*) filter (where outcome = 'failed'),
		       coalesce(sum(prompt_tokens), 0), coalesce(sum(completion_tokens), 0)
		from tutor_questions
		where asked_at > `+since+`
		group by 1 order by 1 desc`, days)
	if err != nil {
		return nil, nil, err
	}
	byDay, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (TutorDay, error) {
		var d TutorDay
		err := row.Scan(&d.Day, &d.Questions, &d.Learners, &d.Failed, &d.PromptTokens, &d.CompletionTokens)
		return d, err
	})
	if err != nil {
		return nil, nil, err
	}

	rows, err = s.pool.Query(ctx, `
		select u.id, u.email, u.name, count(*),
		       coalesce(sum(q.prompt_tokens), 0), coalesce(sum(q.completion_tokens), 0),
		       max(q.asked_at)
		from tutor_questions q join users u on u.id = q.user_id
		where q.asked_at > `+since+`
		group by u.id
		order by count(*) desc, max(q.asked_at) desc
		limit $2`, days, learners)
	if err != nil {
		return nil, nil, err
	}
	byLearner, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (TutorLearner, error) {
		var l TutorLearner
		err := row.Scan(&l.UserID, &l.Email, &l.Name, &l.Questions,
			&l.PromptTokens, &l.CompletionTokens, &l.LastAsked)
		return l, err
	})
	return byDay, byLearner, err
}
