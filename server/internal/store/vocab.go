package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type VocabWord struct {
	ID         uuid.UUID  `json:"id"`
	Word       string     `json:"word"`
	IPA        string     `json:"ipa"`
	Meaning    string     `json:"meaning"`
	Status     string     `json:"status"`
	ClipID     *uuid.UUID `json:"videoId"`
	ReviewedAt *time.Time `json:"reviewedAt"`
	// How far ahead this card is currently scheduled, and when it is next
	// worth asking about. The schedule is the server's: a deck built from a
	// device with a wrong clock would be the wrong deck.
	IntervalDays int       `json:"intervalDays"`
	DueAt        time.Time `json:"dueAt"`
}

// A learner's card reads its pronunciation and meaning from the shared gloss
// when there is one, and keeps its own otherwise.
//
// The gloss belongs to the word, not to anybody's copy of it: one lookup
// answers for every learner who has collected it, including the ones who
// collected it before the lookup finished. The card's own columns are the
// fallback, which is what keeps the starter words — written by hand, never
// looked up — showing what they always showed.
const vocabColumns = `id, word,
	coalesce(nullif((select g.ipa from glosses g where g.word = vocab_words.word), ''), vocab_words.ipa),
	coalesce(nullif((select g.meaning from glosses g where g.word = vocab_words.word), ''), vocab_words.meaning),
	status, clip_id, reviewed_at, interval_days, due_at`

func scanVocab(row pgx.Row) (VocabWord, error) {
	var v VocabWord
	err := row.Scan(&v.ID, &v.Word, &v.IPA, &v.Meaning, &v.Status, &v.ClipID, &v.ReviewedAt,
		&v.IntervalDays, &v.DueAt)
	return v, mapErr(err)
}

func (s *Store) ListVocab(ctx context.Context, userID uuid.UUID) ([]VocabWord, error) {
	rows, err := s.pool.Query(ctx,
		`select `+vocabColumns+` from vocab_words where user_id = $1 order by created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	words := []VocabWord{}
	for rows.Next() {
		v, err := scanVocab(rows)
		if err != nil {
			return nil, err
		}
		words = append(words, v)
	}
	return words, rows.Err()
}

type NewVocabWord struct {
	Word    string     `json:"word"`
	IPA     string     `json:"ipa"`
	Meaning string     `json:"meaning"`
	ClipID  *uuid.UUID `json:"videoId"`
}

// CreateVocabWord is idempotent per learner: tapping the same word twice while
// practising should not produce two cards. The unique index on (user_id, word)
// is what enforces it; this just makes the second tap a no-op that still
// returns the card.
func (s *Store) CreateVocabWord(ctx context.Context, userID uuid.UUID, in NewVocabWord) (VocabWord, error) {
	return scanVocab(s.pool.QueryRow(ctx, `
		insert into vocab_words (user_id, word, ipa, meaning, clip_id)
		values ($1, $2, $3, $4, $5)
		on conflict (user_id, word) do update set
			ipa     = case when excluded.ipa <> '' then excluded.ipa else vocab_words.ipa end,
			meaning = case when excluded.meaning <> '' then excluded.meaning else vocab_words.meaning end
		returning `+vocabColumns,
		userID, in.Word, in.IPA, in.Meaning, in.ClipID))
}

type VocabPatch struct {
	Status *string `json:"status"`
	// Reviewed records that the card came up in memory practice. The timestamp
	// is the server's, so a device with a wrong clock cannot reorder the deck.
	Reviewed bool `json:"reviewed"`
}

// UpdateVocabWord records an answer and moves the card's schedule with it.
//
// Four cases, and the difference between the top two and the bottom two is
// whether anything was actually tested:
//
//   - recalled in practice: one step up the ladder.
//   - forgotten in practice: back to the front.
//   - marked known in the list: retired, which is an instruction about the
//     deck rather than a recall — nothing was tested, so it does not climb.
//   - marked anything else in the list: due again now.
//
// The schedule is computed here rather than in SQL because the ladder is a
// list with a test beside it, and a CASE expression seven steps long is a
// thing nobody would read again.
func (s *Store) UpdateVocabWord(ctx context.Context, userID, id uuid.UUID, p VocabPatch) (VocabWord, error) {
	var current int
	var status string
	err := s.pool.QueryRow(ctx,
		`select interval_days, status from vocab_words where id = $1 and user_id = $2`, id, userID).
		Scan(&current, &status)
	if err != nil {
		return VocabWord{}, mapErr(err)
	}
	if p.Status != nil {
		status = *p.Status
	}

	now := time.Now()
	next := Forgotten(now)
	switch {
	case p.Reviewed && status == "known":
		next = Recalled(current, now)
	case p.Reviewed:
		next = Forgotten(now)
	case status == "known":
		next = Retired(now)
	}

	return scanVocab(s.pool.QueryRow(ctx, `
		update vocab_words set
			status        = coalesce($3, status),
			reviewed_at   = case when $4 then now() else reviewed_at end,
			interval_days = $5,
			due_at        = $6
		where id = $1 and user_id = $2
		returning `+vocabColumns,
		id, userID, p.Status, p.Reviewed, next.IntervalDays, next.DueAt))
}

func (s *Store) DeleteVocabWord(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from vocab_words where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
