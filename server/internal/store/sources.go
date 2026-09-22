package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Source is a file an admin cut a batch of clips out of, kept whole.
//
// It exists because cutting video happens after publishing, on a worker that
// was not there when the boundaries were chosen. One row per upload, shared by
// every clip taken from it: a fifty-minute recording is stored once, not once
// per line.
type Source struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Key         string    `json:"-"`
	ContentType string    `json:"-"`
	// HasVideo decides whether clips cut from this source are queued for
	// cutting. An audio upload has a source row too — transcription wants the
	// file either way — and queueing a cut for one would only fail.
	HasVideo bool `json:"hasVideo"`
}

// CreateSource records the upload and schedules its transcription, in one
// transaction: a source that exists with nothing queued to read it would leave
// the studio waiting for words that were never coming.
func (s *Store) CreateSource(ctx context.Context, name, key, contentType string, hasVideo bool, createdBy uuid.UUID) (Source, error) {
	var author *uuid.UUID
	if createdBy != uuid.Nil {
		author = &createdBy
	}
	var out Source
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			insert into clip_sources (name, key, content_type, has_video, created_by)
			values ($1, $2, $3, $4, $5)
			returning id, name, key, content_type, has_video`,
			name, key, contentType, hasVideo, author).
			Scan(&out.ID, &out.Name, &out.Key, &out.ContentType, &out.HasVideo); err != nil {
			return err
		}
		_, err := tx.Exec(ctx,
			`insert into transcribe_jobs (source_id) values ($1) on conflict (source_id) do nothing`, out.ID)
		return err
	})
	return out, mapErr(err)
}

func (s *Store) SourceByID(ctx context.Context, id uuid.UUID) (Source, error) {
	var out Source
	err := s.pool.QueryRow(ctx,
		`select id, name, key, content_type, has_video from clip_sources where id = $1`, id).
		Scan(&out.ID, &out.Name, &out.Key, &out.ContentType, &out.HasVideo)
	return out, mapErr(err)
}

// Word is one spoken word, when it was said, and how to say it.
type Word struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
	IPA   string  `json:"ipa"`
}

// Transcript is what the studio polls for. Pending is the ordinary first
// answer: transcribing an hour takes minutes, and the screen says so rather
// than looking broken.
type Transcript struct {
	Status   string `json:"status"` // "pending", "ready" or "failed"
	Language string `json:"language"`
	Words    []Word `json:"words"`
}

func (s *Store) TranscriptBySource(ctx context.Context, id uuid.UUID) (Transcript, error) {
	out := Transcript{Words: []Word{}}
	var raw []byte
	err := s.pool.QueryRow(ctx,
		`select words, language from transcripts where source_id = $1`, id).Scan(&raw, &out.Language)
	if err == nil {
		out.Status = "ready"
		return out, json.Unmarshal(raw, &out.Words)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}

	// No transcript yet: either one is still coming, or every attempt is spent
	// and none ever will be. The studio shows different words for each.
	var queued bool
	if err := s.pool.QueryRow(ctx,
		`select exists (select 1 from transcribe_jobs where source_id = $1)`, id).Scan(&queued); err != nil {
		return out, err
	}
	out.Status = "failed"
	if queued {
		out.Status = "pending"
	}
	return out, nil
}

// DeleteUnusedSources removes sources no clip refers to any more, returning
// their keys so the caller can drop the objects.
//
// Without this a source outlives every clip cut from it, and the biggest file
// in the system is the one nothing ever deletes.
func (s *Store) DeleteUnusedSources(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		delete from clip_sources
		where not exists (select 1 from clips where clips.source_id = clip_sources.id)
		returning key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		// A video holding clips published before uploads existed has no file
		// behind it, so there is nothing for the caller to delete.
		if key != "" {
			keys = append(keys, key)
		}
	}
	return keys, rows.Err()
}

// StoreLatestTranscript writes a transcript against the newest source and drops
// its queued job, which is what the transcriber does when it finishes.
//
// For the browser tests only — they cannot run Whisper, and the studio's job is
// to display the words rather than to produce them. The API layer registers the
// route that reaches this only when the fake provider is in use.
func (s *Store) StoreLatestTranscript(ctx context.Context, language string, words []Word) error {
	raw, err := json.Marshal(words)
	if err != nil {
		return err
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		var id uuid.UUID
		err := tx.QueryRow(ctx,
			`select id from clip_sources order by created_at desc limit 1`).Scan(&id)
		if err != nil {
			return mapErr(err)
		}
		if _, err := tx.Exec(ctx, `
			insert into transcripts (source_id, words, language)
			values ($1, $2, $3)
			on conflict (source_id) do update
			set words = excluded.words, language = excluded.language`, id, raw, language); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `delete from transcribe_jobs where source_id = $1`, id)
		return err
	})
}
