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

// TutorAllowance is how many questions the tutor takes.
type TutorAllowance struct {
	// Max questions per learner in any Window; no limit when Max is 0.
	Max    int
	Window time.Duration
	// Daily questions per learner in any 24 hours; no limit when 0. The window
	// stops a burst; this stops thirty every ten minutes all day long.
	Daily int
	// TotalDaily questions from everybody in any 24 hours; no limit when 0. The
	// bill's ceiling: accounts are free, so a per-learner limit alone is a limit
	// per address somebody bothered to make.
	TotalDaily int
}

// TutorRefusal is which allowance turned a question away.
type TutorRefusal string

const (
	TutorAllowed  TutorRefusal = ""
	TutorTooFast  TutorRefusal = "window"
	TutorDayUsed  TutorRefusal = "day"
	TutorAllUsed  TutorRefusal = "everyone"
	tutorDayHours              = 24 * time.Hour
)

// AskTutor records a question if the allowances have room for it, and answers
// with the new row's id — or with which allowance is used up and how long
// until its oldest question falls out of it.
//
// The counts and the insert happen under a lock on the learner's own row, so
// two questions sent at once cannot both be the last one allowed — and every
// API instance counts the same rows. The total across learners is not locked:
// at worst a few questions over, on a number set for the bill.
func (s *Store) AskTutor(ctx context.Context, q Question, a TutorAllowance) (id int64, refused TutorRefusal, wait time.Duration, err error) {
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select 1 from users where id = $1 for update`, q.UserID); err != nil {
			return err
		}
		var now time.Time
		if err := tx.QueryRow(ctx, `select now()`).Scan(&now); err != nil {
			return err
		}
		// check is whether a limit's questions in the last period are used up,
		// and if so how long until the oldest of them leaves it.
		check := func(limit int, period time.Duration, mine bool) (bool, time.Duration, error) {
			if limit <= 0 {
				return false, 0, nil
			}
			var count int
			var oldest *time.Time
			err := tx.QueryRow(ctx, `
				select count(*), min(asked_at) from tutor_questions
				where ($1::uuid is null or user_id = $1) and asked_at > $2::timestamptz - make_interval(secs => $3)`,
				func() any {
					if mine {
						return q.UserID
					}
					return nil
				}(), now, period.Seconds()).Scan(&count, &oldest)
			if err != nil || count < limit || oldest == nil {
				return false, 0, err
			}
			return true, oldest.Add(period).Sub(now), nil
		}
		for _, allowance := range []struct {
			limit  int
			period time.Duration
			mine   bool
			why    TutorRefusal
		}{
			{a.Max, a.Window, true, TutorTooFast},
			{a.Daily, tutorDayHours, true, TutorDayUsed},
			{a.TotalDaily, tutorDayHours, false, TutorAllUsed},
		} {
			full, until, err := check(allowance.limit, allowance.period, allowance.mine)
			if err != nil {
				return err
			}
			if full {
				refused, wait = allowance.why, until
				return nil
			}
		}
		return tx.QueryRow(ctx, `
			insert into tutor_questions (user_id, clip_id, model) values ($1, $2, $3)
			returning id`, q.UserID, q.ClipID, q.Model).Scan(&id)
	})
	return id, refused, wait, err
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
