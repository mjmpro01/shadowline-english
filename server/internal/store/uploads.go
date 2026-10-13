package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// An upload and how far it has got.
//
// Almost nothing here is stored as a status. Whether transcription is still
// running, whether the clips still owe a picture, whether any of it was
// published — all of that is already written down in the job tables and on the
// rows, and a second copy kept in step by hand is a second copy to get wrong.
// So the state machine is read at query time and `Status` is worked out from the
// counts below.
//
// The exception is UploadState, which is the one thing only the transfer knows.
type Upload struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Title string    `json:"title"`
	// HasVideo decides whether its clips are queued for cutting at all.
	HasVideo bool    `json:"hasVideo"`
	Bytes    int64   `json:"bytes"`
	Seconds  float64 `json:"seconds"`

	/* --- what only the transfer knows --- */

	// UploadState is 'uploading', 'fetching', 'stored' or 'failed'.
	UploadState string `json:"uploadState"`
	// Error is why it failed, when it did.
	Error string `json:"error"`
	// SourceURL is the page a linked recording was fetched from, and
	// SourceCredit whose it is; both empty for one uploaded as a file.
	SourceURL    string `json:"sourceUrl"`
	SourceCredit string `json:"sourceCredit"`
	// FetchAttempts is how many times the worker has tried the download.
	FetchAttempts int `json:"fetchAttempts"`

	/* --- read from the queues and the rows --- */

	Published bool `json:"published"`
	Clips     int  `json:"clips"`
	// ClipsWithoutAudio is the count that reached the library with no sound of
	// their own. A take against one of those is kept and measured but not
	// scored, so it is worth an admin's attention rather than silence.
	ClipsWithoutAudio int `json:"clipsWithoutAudio"`
	// CutsLeft is cut jobs still outstanding. The workers delete a job when they
	// finish with it either way, so a row here means work still to do.
	CutsLeft int `json:"cutsLeft"`
	// CutsFailed is clips that should have a picture, have no job left, and have
	// no picture: the cutter gave up on them.
	CutsFailed int `json:"cutsFailed"`
	// CutError is why the cutter gave up, when it kept a reason: each distinct
	// one, joined.
	CutError string `json:"cutError"`
	// Transcript is 'none', 'pending', 'ready' or 'failed'.
	Transcript string `json:"transcript"`
	// TranscribeAttempts is how many times the worker has tried, which is what
	// tells a slow transcript from one going round in circles.
	TranscribeAttempts int    `json:"transcribeAttempts"`
	TranscribeError    string `json:"transcribeError"`

	PlaylistID    *uuid.UUID `json:"playlistId"`
	PlaylistTitle string     `json:"playlistTitle"`

	// Status is the one word the console shows, worked out below.
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

// The statuses an upload can be in, in the order it passes through them.
const (
	// The bytes are on their way.
	UploadUploading = "uploading"
	// A worker is downloading it from the link an admin gave.
	UploadFetching = "fetching"
	// They never arrived.
	UploadFailed = "upload-failed"
	// Stored, and the words are being fetched out of it.
	UploadTranscribing = "transcribing"
	// Stored, but no words are coming — the lines are the admin's to type.
	UploadTranscribeFailed = "transcribe-failed"
	// Stored, with or without words, and nothing published out of it yet.
	UploadReady = "ready"
	// Published, and the cutter still owes some of its clips a picture.
	UploadCutting = "cutting"
	// Published, and the cutter gave up on some of them.
	UploadCutFailed = "cut-failed"
	// Published, with every picture the cutter was ever going to produce.
	UploadDone = "done"
)

// status is the state machine, in one place, from the counts above.
//
// Ordered by what an admin needs to know first: a transfer that is not going to
// finish beats a transcript that is not going to arrive, which beats a picture
// that is missing from some of the clips.
func (u Upload) status() string {
	switch u.UploadState {
	case "uploading":
		return UploadUploading
	case "fetching":
		return UploadFetching
	case "failed":
		return UploadFailed
	}
	switch {
	case u.Transcript == "pending":
		return UploadTranscribing
	case !u.Published && u.Transcript == "failed":
		return UploadTranscribeFailed
	case !u.Published:
		return UploadReady
	case u.CutsLeft > 0:
		return UploadCutting
	case u.CutsFailed > 0:
		return UploadCutFailed
	}
	return UploadDone
}

// CreateUpload writes the row before a byte has been sent.
//
// Nothing is queued here: there is no file yet to transcribe, and a job pointing
// at an empty key would fail its attempts and be dropped before the upload it
// was waiting for had finished.
func (s *Store) CreateUpload(
	ctx context.Context,
	name, contentType string,
	hasVideo bool,
	bytes int64,
	seconds float64,
	createdBy uuid.UUID,
) (Source, error) {
	var author *uuid.UUID
	if createdBy != uuid.Nil {
		author = &createdBy
	}
	var out Source
	err := s.pool.QueryRow(ctx, `
		insert into clip_sources (name, key, content_type, has_video, created_by,
		                          upload_state, bytes, duration_seconds, title)
		values ($1, '', $2, $3, $4, 'uploading', $5, $6, $1)
		returning id, name, key, content_type, has_video`,
		name, contentType, hasVideo, author, bytes, seconds).
		Scan(&out.ID, &out.Name, &out.Key, &out.ContentType, &out.HasVideo)
	return out, mapErr(err)
}

// CreateLinkUpload writes the row for a recording that is to be downloaded
// from a link, and queues the download, in one transaction: a row saying
// 'fetching' with nothing coming to fetch it would say so for ever.
//
// It is taken to be a video — the links it is for are video pages — and the
// worker that stores it fills in its size, length and type.
func (s *Store) CreateLinkUpload(ctx context.Context, name, url string, createdBy uuid.UUID) (Source, error) {
	var author *uuid.UUID
	if createdBy != uuid.Nil {
		author = &createdBy
	}
	var out Source
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			insert into clip_sources (name, key, content_type, has_video, created_by,
			                          upload_state, title, source_url)
			values ($1, '', 'video/mp4', true, $2, 'fetching', $1, $3)
			returning id, name, key, content_type, has_video`,
			name, author, url).
			Scan(&out.ID, &out.Name, &out.Key, &out.ContentType, &out.HasVideo); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `insert into fetch_jobs (source_id, url) values ($1, $2)`, out.ID, url)
		return err
	})
	return out, mapErr(err)
}

// UploadStored records where the bytes went and schedules transcription, in one
// transaction: a stored recording with nothing queued to read it would leave the
// studio waiting for words that were never coming.
func (s *Store) UploadStored(ctx context.Context, id uuid.UUID, key string) error {
	return mapErr(s.inTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update clip_sources set key = $2, upload_state = 'stored', error = ''
			where id = $1 and upload_state = 'uploading'`, id, key)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx,
			`insert into transcribe_jobs (source_id) values ($1) on conflict (source_id) do nothing`, id)
		return err
	}))
}

// UploadFailedWith records why the transfer did not finish.
func (s *Store) UploadFailedWith(ctx context.Context, id uuid.UUID, reason string) error {
	if len(reason) > 500 {
		reason = reason[:500]
	}
	_, err := s.pool.Exec(ctx, `
		update clip_sources set upload_state = 'failed', error = $2
		where id = $1 and upload_state = 'uploading'`, id, reason)
	return mapErr(err)
}

// uploadColumns is the read model: the row, plus what the queues and the clips
// say about it. Correlated subqueries rather than joins because each one counts
// a different thing over a different table, and grouping four of those together
// is a query nobody can read.
const uploadColumns = `
	s.id, s.name, s.title, s.has_video, s.bytes, s.duration_seconds,
	s.upload_state, s.error, s.source_url, s.source_credit, s.published, s.created_at,
	s.playlist_id, coalesce(p.title, ''),
	(select count(*)::int from clips c where c.source_id = s.id),
	(select count(*)::int from clips c where c.source_id = s.id and c.audio_key is null),
	-- Work left: a job not given up on. The cutter deletes a job when it
	-- finishes, and marks it failed, keeping the reason, when it gives up.
	(select count(*)::int from cut_jobs j join clips c on c.id = j.clip_id
	 where c.source_id = s.id and j.state <> 'failed'),
	-- Gave up: no job still working on it, and missing what the cut should
	-- have made — its sound always, its picture when the recording has one.
	(select count(*)::int from clips c
	 where c.source_id = s.id
	   and (c.audio_key is null or (s.has_video and c.video_key is null))
	   and not exists (select 1 from cut_jobs j where j.clip_id = c.id and j.state <> 'failed')),
	-- Why, when the cutter said: each distinct reason once. Empty for a cut
	-- given up on before reasons were kept, or never tried by a cutter that
	-- could cut sound at all.
	coalesce((select string_agg(distinct j.error, ' · ') from cut_jobs j
	          join clips c on c.id = j.clip_id
	          where c.source_id = s.id and j.state = 'failed' and j.error is not null), ''),
	-- A failed job stays, for its reason, and is not work still coming.
	exists (select 1 from transcribe_jobs t where t.source_id = s.id and t.state <> 'failed'),
	exists (select 1 from transcripts t where t.source_id = s.id),
	coalesce((select t.attempts from transcribe_jobs t where t.source_id = s.id), 0),
	coalesce((select t.error from transcribe_jobs t where t.source_id = s.id), ''),
	coalesce((select f.attempts from fetch_jobs f where f.source_id = s.id), 0)`

func scanUpload(row pgx.Row) (Upload, error) {
	var u Upload
	var queued, transcribed bool
	if err := row.Scan(
		&u.ID, &u.Name, &u.Title, &u.HasVideo, &u.Bytes, &u.Seconds,
		&u.UploadState, &u.Error, &u.SourceURL, &u.SourceCredit, &u.Published, &u.CreatedAt,
		&u.PlaylistID, &u.PlaylistTitle,
		&u.Clips, &u.ClipsWithoutAudio, &u.CutsLeft, &u.CutsFailed, &u.CutError,
		&queued, &transcribed, &u.TranscribeAttempts, &u.TranscribeError, &u.FetchAttempts,
	); err != nil {
		return Upload{}, err
	}
	u.Transcript = transcriptState(u.UploadState, queued, transcribed)
	u.Status = u.status()
	return u, nil
}

// transcriptState reads the same three facts the studio's own transcript
// endpoint reads, and in the same order: a job still waiting means the words are
// coming, a transcript with no job means they arrived, and neither — no job, or
// only a failed one kept for its reason — means the worker gave up. Nothing is queued until the bytes have landed, so an upload
// still in flight reports none rather than a failure.
func transcriptState(uploadState string, queued, transcribed bool) string {
	switch {
	case queued:
		return "pending"
	case transcribed:
		return "ready"
	case uploadState != "stored":
		return "none"
	}
	return "failed"
}

// Uploads is the history: every recording an admin has sent, newest first.
//
// `state` filters by the derived status rather than by a column, because that is
// what the console shows and what somebody means by "show me the failed ones".
// It is applied in Go for the same reason the status is worked out there — one
// definition, not one in SQL and another beside it.
func (s *Store) Uploads(ctx context.Context, query, state string, limit, offset int) ([]Upload, int, error) {
	like := "%" + escapeLike(strings.TrimSpace(query)) + "%"
	args := []any{strings.TrimSpace(query) != "", like}
	// The episode that holds clips published before uploads existed has no file
	// behind it. Nobody uploaded it, so it is not history.
	where := `(s.key <> '' or s.upload_state <> 'stored')
		and ($1::bool = false or s.name ilike $2 or s.title ilike $2)`

	sql := `select ` + uploadColumns + `
		from clip_sources s
		left join playlists p on p.id = s.playlist_id
		where ` + where + `
		order by s.created_at desc`

	// Without a state filter this is an ordinary page: the window goes into the
	// query, and the count is one cheap query of its own.
	//
	// With one it cannot be, because the status is worked out in Go from the
	// counts above — there is no column to filter on, deliberately, and a second
	// copy of the state machine in SQL is the thing that would rot. So the rows
	// are read in order and the matching ones kept. That reads the whole history
	// for a filtered page, which is the price of not storing a status; at the
	// scale of one admin's uploads it is a few hundred rows.
	if state == "" {
		var total int
		if err := s.pool.QueryRow(ctx,
			`select count(*)::int from clip_sources s where `+where, args...).Scan(&total); err != nil {
			return nil, 0, err
		}
		found, err := s.uploadsFrom(ctx, sql+` limit $3 offset $4`, append(args, limit, offset)...)
		return found, total, err
	}

	all, err := s.uploadsFrom(ctx, sql, args...)
	if err != nil {
		return nil, 0, err
	}
	matching := []Upload{}
	for _, u := range all {
		if u.Status == state {
			matching = append(matching, u)
		}
	}
	total := len(matching)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return matching[offset:end], total, nil
}

func (s *Store) uploadsFrom(ctx context.Context, sql string, args ...any) ([]Upload, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Upload{}
	for rows.Next() {
		u, err := scanUpload(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) UploadByID(ctx context.Context, id uuid.UUID) (Upload, error) {
	u, err := scanUpload(s.pool.QueryRow(ctx, `
		select `+uploadColumns+`
		from clip_sources s
		left join playlists p on p.id = s.playlist_id
		where s.id = $1`, id))
	return u, mapErr(err)
}

// ErrNotStored is an upload whose file never arrived, so there is nothing for a
// worker to be retried against.
var ErrNotStored = errors.New("the recording itself never arrived")

// Retried is what RetryUpload put back on the queues.
type Retried struct {
	// Fetch is 1 when a download from a link that gave up was started again.
	Fetch      int `json:"fetch"`
	Transcribe int `json:"transcribe"`
	Cuts       int `json:"cuts"`
}

// RetryUpload puts the work that gave up back on the queue.
//
// A recording that was to be downloaded from a link and never was is the one
// case with no file to retry against and still something to retry: the
// download itself, which goes back on its queue from the start.
//
// Otherwise transcription first: with no transcript and a failed job (or none at all) the
// worker has given up, and resetting the job puts it back. Then the cuts, one job per clip that should have a
// picture and has none. Answers how many of each it queued, because "nothing to
// retry" is a real outcome and the console should say so rather than implying it
// has started something.
func (s *Store) RetryUpload(ctx context.Context, id uuid.UUID) (out Retried, err error) {
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		var state, url string
		if err := tx.QueryRow(ctx,
			`select upload_state, source_url from clip_sources where id = $1 for update`, id).
			Scan(&state, &url); err != nil {
			return err
		}
		if state == "failed" && url != "" {
			if _, err := tx.Exec(ctx, `
				update clip_sources set upload_state = 'fetching', error = '' where id = $1`, id); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `
				insert into fetch_jobs (source_id, url) values ($1, $2)
				on conflict (source_id) do update
				set state = 'queued', attempts = 0, error = null, locked_at = null,
				    created_at = now()`, id, url)
			out.Fetch = 1
			return err
		}
		if state != "stored" {
			return ErrNotStored
		}

		// A job the transcriber gave up on is still there, as 'failed', and goes
		// back to the start of its attempts; a recording from before failed
		// jobs were kept has none, and gets one.
		tag, err := tx.Exec(ctx, `
			insert into transcribe_jobs (source_id)
			select $1
			where not exists (select 1 from transcripts where source_id = $1)
			on conflict (source_id) do update
			set state = 'queued', attempts = 0, error = null, locked_at = null,
			    created_at = now()
			where transcribe_jobs.state = 'failed'`, id)
		if err != nil {
			return err
		}
		out.Transcribe = int(tag.RowsAffected())

		tag, err = tx.Exec(ctx, `
			insert into cut_jobs (clip_id)
			select c.id from clips c join clip_sources s on s.id = c.source_id
			where c.source_id = $1
			  and (c.audio_key is null or (s.has_video and c.video_key is null))
			on conflict (clip_id) do update
			set state = 'queued', attempts = 0, error = null, locked_at = null,
			    created_at = now()
			where cut_jobs.state = 'failed'`, id)
		if err != nil {
			return err
		}
		out.Cuts = int(tag.RowsAffected())
		return nil
	})
	return out, mapErr(err)
}
