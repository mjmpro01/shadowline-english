package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Role-play sessions with the tutor, kept to be read again: what was said on
// both sides, each of the learner's lines said better, and the feedback at the
// end.

// ErrRoleplayEnded is a turn sent to a session that has had its feedback.
var ErrRoleplayEnded = errors.New("this role-play has ended")

// Roleplay is one session, as the list shows it.
type Roleplay struct {
	ID         uuid.UUID  `json:"id"`
	Scenario   string     `json:"scenario"`
	DialogueID *uuid.UUID `json:"dialogueId"`
	Title      string     `json:"title"`
	Topic      string     `json:"topic"`
	// OwnSide is the side of a dialogue the learner plays.
	OwnSide   string     `json:"ownSide"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	EndedAt   *time.Time `json:"endedAt"`
}

// RoleplayTurn is one thing said in a session.
type RoleplayTurn struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	// On the learner's turns: how it would sound more natural, and why.
	Better string `json:"better"`
	Why    string `json:"why"`
}

// RoleplaySession is a session with everything said in it.
type RoleplaySession struct {
	Roleplay
	Turns []RoleplayTurn `json:"turns"`
	// The report, once it has ended; null before.
	Feedback json.RawMessage `json:"feedback"`
}

const roleplayColumns = `id, scenario, dialogue_id, title, topic, own_side, created_at, updated_at, ended_at`

func scanRoleplay(row pgx.Row, r *Roleplay, more ...any) error {
	return row.Scan(append([]any{&r.ID, &r.Scenario, &r.DialogueID, &r.Title, &r.Topic, &r.OwnSide,
		&r.CreatedAt, &r.UpdatedAt, &r.EndedAt}, more...)...)
}

// StartRoleplay keeps a new session and the tutor's opening line, together.
func (s *Store) StartRoleplay(ctx context.Context, user uuid.UUID, r Roleplay, opening string) (RoleplaySession, error) {
	var out RoleplaySession
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := scanRoleplay(tx.QueryRow(ctx, `
			insert into roleplays (user_id, scenario, dialogue_id, title, topic, own_side)
			values ($1, $2, $3, $4, $5, $6) returning `+roleplayColumns,
			user, r.Scenario, r.DialogueID, r.Title, r.Topic, r.OwnSide), &out.Roleplay); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `insert into roleplay_turns (roleplay_id, role, content) values ($1, 'assistant', $2)`,
			out.ID, opening)
		return err
	})
	out.Turns = []RoleplayTurn{{Role: "assistant", Content: opening}}
	return out, err
}

// Roleplays is a learner's sessions, the latest first.
func (s *Store) Roleplays(ctx context.Context, user uuid.UUID, limit int) ([]Roleplay, error) {
	rows, err := s.pool.Query(ctx, `select `+roleplayColumns+` from roleplays
		where user_id = $1 order by updated_at desc limit $2`, user, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Roleplay, error) {
		var r Roleplay
		err := scanRoleplay(row, &r)
		return r, err
	})
}

// RoleplaySession is one of this learner's sessions with everything said in
// it, or ErrNotFound — also for somebody else's.
func (s *Store) RoleplaySession(ctx context.Context, user, id uuid.UUID) (RoleplaySession, error) {
	var out RoleplaySession
	var feedback []byte
	err := scanRoleplay(s.pool.QueryRow(ctx, `select `+roleplayColumns+`, feedback from roleplays
		where id = $1 and user_id = $2`, id, user), &out.Roleplay, &feedback)
	if err != nil {
		return out, mapErr(err)
	}
	if feedback != nil {
		out.Feedback = feedback
	}
	rows, err := s.pool.Query(ctx, `select role, content, better, why from roleplay_turns
		where roleplay_id = $1 order by id`, id)
	if err != nil {
		return out, err
	}
	out.Turns, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (RoleplayTurn, error) {
		var t RoleplayTurn
		err := row.Scan(&t.Role, &t.Content, &t.Better, &t.Why)
		return t, err
	})
	return out, err
}

// AddRoleplayTurns keeps the learner's line, as said and said better, and the
// tutor's reply to it — unless the session has ended since it was read.
func (s *Store) AddRoleplayTurns(ctx context.Context, id uuid.UUID, said, better, why, reply string) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		var ended *time.Time
		if err := tx.QueryRow(ctx, `select ended_at from roleplays where id = $1 for update`, id).Scan(&ended); err != nil {
			return mapErr(err)
		}
		if ended != nil {
			return ErrRoleplayEnded
		}
		if _, err := tx.Exec(ctx, `
			insert into roleplay_turns (roleplay_id, role, content, better, why) values
			($1, 'user', $2, $3, $4), ($1, 'assistant', $5, '', '')`, id, said, better, why, reply); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `update roleplays set updated_at = now() where id = $1`, id)
		return err
	})
}

// EndRoleplay keeps the feedback and closes the session to further turns.
func (s *Store) EndRoleplay(ctx context.Context, id uuid.UUID, feedback any) error {
	raw, err := json.Marshal(feedback)
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `update roleplays set feedback = $2, ended_at = now(), updated_at = now()
		where id = $1 and ended_at is null`, id, raw)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRoleplayEnded
	}
	return nil
}

// DeleteRoleplay takes one of a learner's own sessions away.
func (s *Store) DeleteRoleplay(ctx context.Context, user, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from roleplays where id = $1 and user_id = $2`, id, user)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
