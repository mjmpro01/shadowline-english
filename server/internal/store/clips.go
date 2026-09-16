package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CaptionLine struct {
	Text string `json:"text"`
	IPA  string `json:"ipa"`
}

type Clip struct {
	ID              uuid.UUID     `json:"id"`
	Title           string        `json:"title"`
	Source          string        `json:"source"`
	Playlist        string        `json:"playlist"`
	Categories      []string      `json:"categories"`
	Featured        bool          `json:"featured"`
	TimestampLabel  string        `json:"timestamp"`
	DurationSeconds float64       `json:"durationSeconds"`
	Summary         string        `json:"summary"`
	Captions        []CaptionLine `json:"captions"`
	AudioKey        *string       `json:"-"`
	CreatedAt       time.Time     `json:"createdAt"`
}

const clipColumns = `id, title, source, playlist, categories, featured, timestamp_label,
	duration_seconds, summary, captions, audio_key, created_at`

func scanClip(row pgx.Row) (Clip, error) {
	var c Clip
	var captions []byte
	err := row.Scan(&c.ID, &c.Title, &c.Source, &c.Playlist, &c.Categories, &c.Featured,
		&c.TimestampLabel, &c.DurationSeconds, &c.Summary, &captions, &c.AudioKey, &c.CreatedAt)
	if err != nil {
		return c, mapErr(err)
	}
	if err := json.Unmarshal(captions, &c.Captions); err != nil {
		return c, err
	}
	return c, nil
}

func (s *Store) ListClips(ctx context.Context) ([]Clip, error) {
	rows, err := s.pool.Query(ctx, `select `+clipColumns+` from clips order by created_at, title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	clips := []Clip{}
	for rows.Next() {
		c, err := scanClip(rows)
		if err != nil {
			return nil, err
		}
		clips = append(clips, c)
	}
	return clips, rows.Err()
}

func (s *Store) ClipByID(ctx context.Context, id uuid.UUID) (Clip, error) {
	return scanClip(s.pool.QueryRow(ctx, `select `+clipColumns+` from clips where id = $1`, id))
}

// NewClip is what the studio publishes: everything but the id, which the server
// assigns so two admins cutting at once cannot collide.
type NewClip struct {
	Title           string        `json:"title"`
	Source          string        `json:"source"`
	Playlist        string        `json:"playlist"`
	Categories      []string      `json:"categories"`
	Featured        bool          `json:"featured"`
	TimestampLabel  string        `json:"timestamp"`
	DurationSeconds float64       `json:"durationSeconds"`
	Summary         string        `json:"summary"`
	Captions        []CaptionLine `json:"captions"`
}

func (s *Store) CreateClip(ctx context.Context, in NewClip, createdBy uuid.UUID) (Clip, error) {
	captions, err := json.Marshal(orEmpty(in.Captions))
	if err != nil {
		return Clip{}, err
	}
	return scanClip(s.pool.QueryRow(ctx, `
		insert into clips (title, source, playlist, categories, featured, timestamp_label,
		                   duration_seconds, summary, captions, created_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		returning `+clipColumns,
		in.Title, in.Source, in.Playlist, orEmpty(in.Categories), in.Featured, in.TimestampLabel,
		in.DurationSeconds, in.Summary, captions, createdBy))
}

// ClipPatch carries only the fields the studio's second tab can change. Nil
// means "leave alone", which is why every field is a pointer.
type ClipPatch struct {
	Title      *string        `json:"title"`
	Playlist   *string        `json:"playlist"`
	Categories *[]string      `json:"categories"`
	Featured   *bool          `json:"featured"`
	Summary    *string        `json:"summary"`
	Captions   *[]CaptionLine `json:"captions"`
}

func (s *Store) UpdateClip(ctx context.Context, id uuid.UUID, p ClipPatch) (Clip, error) {
	var captions any
	if p.Captions != nil {
		raw, err := json.Marshal(orEmpty(*p.Captions))
		if err != nil {
			return Clip{}, err
		}
		captions = raw
	}
	var categories any
	if p.Categories != nil {
		categories = orEmpty(*p.Categories)
	}
	return scanClip(s.pool.QueryRow(ctx, `
		update clips set
			title      = coalesce($2, title),
			playlist   = coalesce($3, playlist),
			categories = coalesce($4, categories),
			featured   = coalesce($5, featured),
			summary    = coalesce($6, summary),
			captions   = coalesce($7, captions)
		where id = $1
		returning `+clipColumns,
		id, p.Title, p.Playlist, categories, p.Featured, p.Summary, captions))
}

func (s *Store) SetClipAudioKey(ctx context.Context, id uuid.UUID, key string) error {
	tag, err := s.pool.Exec(ctx, `update clips set audio_key = $2 where id = $1`, id, key)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteClip returns the audio keys that are now orphaned — the clip's own and
// every take recorded against it — so the caller can remove the objects. The
// rows go with the clip through `on delete cascade`.
func (s *Store) DeleteClip(ctx context.Context, id uuid.UUID) (clipKey *string, takeKeys []string, err error) {
	rows, err := s.pool.Query(ctx, `select audio_key from takes where clip_id = $1 and audio_key is not null`, id)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			rows.Close()
			return nil, nil, err
		}
		takeKeys = append(takeKeys, k)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	err = s.pool.QueryRow(ctx, `delete from clips where id = $1 returning audio_key`, id).Scan(&clipKey)
	if err != nil {
		return nil, nil, mapErr(err)
	}
	return clipKey, takeKeys, nil
}

// orEmpty keeps null out of the database: a missing JSON array should be stored
// as `[]`, not as SQL null, so readers never have to check for both.
func orEmpty[T any](in []T) []T {
	if in == nil {
		return []T{}
	}
	return in
}
