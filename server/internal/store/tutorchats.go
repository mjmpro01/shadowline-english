package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// TutorConversation is one conversation with the tutor, as the list shows it.
type TutorConversation struct {
	ID        uuid.UUID  `json:"id"`
	Title     string     `json:"title"`
	ClipID    *uuid.UUID `json:"clipId"`
	ClipTitle *string    `json:"clipTitle"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// TutorTurn is one message in a conversation.
type TutorTurn struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// TutorConversations is a learner's conversations, the latest first.
func (s *Store) TutorConversations(ctx context.Context, userID uuid.UUID, limit int) ([]TutorConversation, error) {
	rows, err := s.pool.Query(ctx, `
		select c.id, c.title, c.clip_id, k.title, c.created_at, c.updated_at
		from tutor_conversations c left join clips k on k.id = c.clip_id
		where c.user_id = $1
		order by c.updated_at desc
		limit $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (TutorConversation, error) {
		var c TutorConversation
		err := row.Scan(&c.ID, &c.Title, &c.ClipID, &c.ClipTitle, &c.CreatedAt, &c.UpdatedAt)
		return c, err
	})
}

// TutorConversation is one of this learner's conversations, or ErrNotFound —
// also for somebody else's.
func (s *Store) TutorConversation(ctx context.Context, userID, id uuid.UUID) (TutorConversation, error) {
	var c TutorConversation
	err := s.pool.QueryRow(ctx, `
		select c.id, c.title, c.clip_id, k.title, c.created_at, c.updated_at
		from tutor_conversations c left join clips k on k.id = c.clip_id
		where c.id = $1 and c.user_id = $2`, id, userID).
		Scan(&c.ID, &c.Title, &c.ClipID, &c.ClipTitle, &c.CreatedAt, &c.UpdatedAt)
	return c, mapErr(err)
}

// TutorTurns is a conversation's messages, oldest first. The caller has
// checked whose it is.
func (s *Store) TutorTurns(ctx context.Context, conversationID uuid.UUID) ([]TutorTurn, error) {
	rows, err := s.pool.Query(ctx, `
		select role, content from tutor_messages
		where conversation_id = $1 order by id`, conversationID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (TutorTurn, error) {
		var t TutorTurn
		err := row.Scan(&t.Role, &t.Content)
		return t, err
	})
}

// StartTutorConversation opens an empty conversation, titled after its first
// question.
func (s *Store) StartTutorConversation(ctx context.Context, userID uuid.UUID, clipID *uuid.UUID, title string) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `
		insert into tutor_conversations (user_id, clip_id, title) values ($1, $2, $3)
		returning id`, userID, clipID, title).Scan(&id)
	return id, err
}

// RecordTutorExchange keeps a question and the answer it got, together.
func (s *Store) RecordTutorExchange(ctx context.Context, conversationID uuid.UUID, question, answer string) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			insert into tutor_messages (conversation_id, role, content)
			values ($1, 'user', $2), ($1, 'assistant', $3)`,
			conversationID, question, answer); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `update tutor_conversations set updated_at = now() where id = $1`, conversationID)
		return err
	})
}

// DeleteTutorConversation removes one of this learner's conversations and
// everything in it, or answers ErrNotFound.
func (s *Store) DeleteTutorConversation(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`delete from tutor_conversations where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DropEmptyTutorConversation removes a conversation that never got an
// exchange: one started for a question the tutor failed to answer.
func (s *Store) DropEmptyTutorConversation(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		delete from tutor_conversations c where c.id = $1
		and not exists (select 1 from tutor_messages m where m.conversation_id = c.id)`, id)
	return err
}
