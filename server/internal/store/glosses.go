package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Looking a word up is the fifth queue. It is here rather than in the request
// because the answer comes from a model over the network: a handler that waited
// for it would hold a connection open for seconds, and the same word would be
// looked up again by every learner who ever taps it.
//
// The cache is the point. A gloss is written once and read for ever, so the
// cost and the wait belong to the first person to tap a word and to nobody
// after them.

// Gloss is what a word means and how it is said.
//
// Either half can be empty and the two arrive from different places: `IPA` is
// a CMUdict lookup and free, `Meaning` is a model call and is not. A gloss row
// with an IPA and no meaning is what a worker running without an API key
// leaves behind, and it is still worth showing.
type Gloss struct {
	Word    string `json:"word"`
	IPA     string `json:"ipa"`
	Meaning string `json:"meaning"`
}

// GlossFor reads a word's gloss. ErrNotFound means nobody has looked it up yet,
// which is the ordinary first answer rather than a failure.
func (s *Store) GlossFor(ctx context.Context, word string) (Gloss, error) {
	var g Gloss
	err := s.pool.QueryRow(ctx,
		`select word, ipa, meaning from glosses where word = $1`, word).Scan(&g.Word, &g.IPA, &g.Meaning)
	if errors.Is(err, pgx.ErrNoRows) {
		return Gloss{}, ErrNotFound
	}
	return g, err
}

// EnqueueGloss schedules a lookup, once. A word half the class taps at the same
// moment is one job, not thirty.
//
// The context is kept from the first request and not overwritten by later ones:
// the job may already be running against it, and a second learner's sentence
// would change the answer under the first.
func (s *Store) EnqueueGloss(ctx context.Context, word, context_ string) error {
	_, err := s.pool.Exec(ctx,
		`insert into gloss_jobs (word, context) values ($1, $2) on conflict (word) do nothing`,
		word, context_)
	return err
}

// GlossQueued reports whether a lookup is still running, which is what tells
// the popup to keep waiting rather than to give up on the word.
func (s *Store) GlossQueued(ctx context.Context, word string) (bool, error) {
	var queued bool
	err := s.pool.QueryRow(ctx,
		`select exists (select 1 from gloss_jobs where word = $1)`, word).Scan(&queued)
	return queued, err
}
