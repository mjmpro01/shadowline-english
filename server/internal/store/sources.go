package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

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
// than looking broken — and says which part of the wait it is in, so a queue
// nothing is reading looks different from a model that is busy.
type Transcript struct {
	Status   string `json:"status"` // "pending", "ready" or "failed"
	Language string `json:"language"`
	Words    []Word `json:"words"`

	// Stage is "queued" or "running" while pending, and empty otherwise.
	Stage string `json:"stage,omitempty"`
	// Ahead is how many recordings were queued before this one and are still
	// waiting, while it is queued.
	Ahead int `json:"ahead"`
	// Attempts the transcriber has made, out of MaxTranscribeAttempts.
	Attempts    int `json:"attempts"`
	MaxAttempts int `json:"maxAttempts"`
	// Error is why the last attempt failed: on a failed transcript, why it gave
	// up; on a pending one, why the attempt before this one did not work.
	Error string `json:"error,omitempty"`
	// QueuedAt is when the recording landed and was queued; StartedAt when the
	// attempt now running began.
	QueuedAt  *time.Time `json:"queuedAt,omitempty"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
	// Transcriber is whether the worker is running, from its heartbeat. Nil
	// when it has never been seen at all.
	Transcriber *Worker `json:"transcriber"`
}

// MaxTranscribeAttempts is how many times the transcriber tries a recording
// before giving up. It is the worker's MAX_ATTEMPTS, in
// scoring/shadowline/transcribequeue.py, and has to stay the same.
const MaxTranscribeAttempts = 3

// TranscriberService is the name the transcription worker beats under.
const TranscriberService = "transcribing"

// Worker is a worker's last heartbeat.
type Worker struct {
	SeenAt time.Time `json:"seenAt"`
	// Busy is whether it was working on something at that beat.
	Busy bool `json:"busy"`
	// Online is whether the beat is recent: a worker beats every ten seconds,
	// so three missed beats and a little more means it has stopped.
	Online bool `json:"online"`
}

// workerSilentAfter is how long without a heartbeat before a worker counts as
// not running.
const workerSilentAfter = "45 seconds"

// WorkerStatus is a service's last heartbeat, or nil if it has never beaten.
func (s *Store) WorkerStatus(ctx context.Context, service string) (*Worker, error) {
	var w Worker
	err := s.pool.QueryRow(ctx, `
		select seen_at, busy, seen_at > now() - $2::interval
		from worker_heartbeats where service = $1`, service, workerSilentAfter).
		Scan(&w.SeenAt, &w.Busy, &w.Online)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (s *Store) TranscriptBySource(ctx context.Context, id uuid.UUID) (Transcript, error) {
	out := Transcript{Words: []Word{}, MaxAttempts: MaxTranscribeAttempts}

	// The transcript and the job in one statement, so both come from the same
	// moment. Read one after the other, a transcriber finishing in between —
	// writing the words and deleting the job — reads as neither, which is
	// "failed", and the studio stops asking for words that have just arrived.
	var raw []byte
	var language, state, errText *string
	var attempts *int
	var ahead int
	var queuedAt, startedAt *time.Time
	err := s.pool.QueryRow(ctx, `
		select t.words, t.language, j.state, j.attempts, j.error, j.created_at, j.locked_at,
		       (select count(*)::int from transcribe_jobs a
		        where a.state = 'queued' and a.created_at < j.created_at)
		from (select $1::uuid as id) src
		left join transcripts t on t.source_id = src.id
		left join transcribe_jobs j on j.source_id = src.id`, id).
		Scan(&raw, &language, &state, &attempts, &errText, &queuedAt, &startedAt, &ahead)
	if err != nil {
		return out, err
	}
	if raw != nil {
		out.Status = "ready"
		if language != nil {
			out.Language = *language
		}
		return out, json.Unmarshal(raw, &out.Words)
	}

	if out.Transcriber, err = s.WorkerStatus(ctx, TranscriberService); err != nil {
		return out, err
	}

	// No transcript yet: one is still coming, or the transcriber gave up (a
	// failed job, kept for its reason), or — from before failed jobs were kept —
	// there is no job at all and the reason is lost.
	if state == nil {
		out.Status = "failed"
		return out, nil
	}
	out.Attempts = *attempts
	if errText != nil {
		out.Error = *errText
	}
	out.QueuedAt = queuedAt
	switch *state {
	case "failed":
		out.Status = "failed"
	case "running":
		out.Status, out.Stage, out.StartedAt = "pending", "running", startedAt
	default:
		// Only meaningful while this one is waiting in the queue too.
		out.Status, out.Stage, out.Ahead = "pending", "queued", ahead
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

// FailLatestTranscript marks the newest source's transcription job as given up,
// with a reason, which is what the transcriber does after its last attempt.
//
// For the browser tests only, like StoreLatestTranscript.
func (s *Store) FailLatestTranscript(ctx context.Context, reason string) error {
	tag, err := s.pool.Exec(ctx, `
		update transcribe_jobs
		set state = 'failed', attempts = $1, error = $2, locked_at = null
		where source_id = (select id from clip_sources order by created_at desc limit 1)`,
		MaxTranscribeAttempts, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
