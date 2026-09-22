package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Episode is the middle level of the library: the recording an admin uploaded,
// and the clips cut out of it. The row is clip_sources — it has always been
// there, holding the file the cutter goes back to — and until now no learner
// could see it.
//
// "Episode" rather than "video", though a video is what it usually is, because
// a clip is already called a video everywhere a learner can see one and two
// things under one word in one library is a trap. A playlist is a series, so
// the thing between a series and its clips is an episode.
//
// Counts and cover are read rather than stored, for the same reason a
// playlist's are: a stored count is a count that goes stale.
type Episode struct {
	ID         uuid.UUID  `json:"id"`
	PlaylistID *uuid.UUID `json:"playlistId"`
	Title      string     `json:"title"`
	Position   int        `json:"position"`
	Published  bool       `json:"published"`
	Clips      int        `json:"clips"`
	// Seconds is the practising in this episode, not the length of the
	// recording: the clips are a few seconds each out of a forty-minute file,
	// and the forty minutes is not what anybody is about to shadow.
	Seconds   float64   `json:"seconds"`
	PosterKey *string   `json:"-"`
	PosterURL string    `json:"posterUrl"`
	CreatedAt time.Time `json:"createdAt"`
}

const episodeColumns = `s.id, s.playlist_id, s.title, s.position, s.published,
	(select count(*) from clips c where c.source_id = s.id),
	(select coalesce(sum(c.duration_seconds), 0) from clips c where c.source_id = s.id),
	(select c.poster_key from clips c
	 where c.source_id = s.id and c.poster_key is not null
	 order by c.start_seconds, c.created_at limit 1),
	s.created_at`

func scanEpisode(row pgx.Row) (Episode, error) {
	var e Episode
	err := row.Scan(&e.ID, &e.PlaylistID, &e.Title, &e.Position, &e.Published,
		&e.Clips, &e.Seconds, &e.PosterKey, &e.CreatedAt)
	return e, mapErr(err)
}

// ListEpisodes is a series' episodes. Unpublished uploads are left out: an admin
// half way through cutting one is not something to offer a learner.
func (s *Store) ListEpisodes(ctx context.Context, playlistID uuid.UUID) ([]Episode, error) {
	rows, err := s.pool.Query(ctx, `select `+episodeColumns+`
		from clip_sources s
		where s.playlist_id = $1 and s.published
		order by s.position, s.created_at`, playlistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Episode{}
	for rows.Next() {
		e, err := scanEpisode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// standaloneEpisode is the episode that holds a series' clips with no recording
// behind them — audio the browser sliced, and everything published before
// uploads existed at all.
//
// The library is a tree and every clip has to hang somewhere. One row per
// series rather than one per clip, and its key is empty because there is no
// file: nothing queues cutting or transcription for it — both are queued at
// upload, which never happened — and DeleteUnusedSources takes it away again
// once the last clip leaves.
func standaloneEpisode(ctx context.Context, tx pgx.Tx, playlistID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx,
		`select id from clip_sources where playlist_id = $1 and key = '' limit 1`, playlistID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	err = tx.QueryRow(ctx, `
		insert into clip_sources (playlist_id, name, title, key, content_type, has_video, published)
		values ($1, '', $2, '', '', false, true)
		returning id`, playlistID, StandaloneEpisodeTitle).Scan(&id)
	return id, err
}

// StandaloneEpisodeTitle names that episode. Exported because the migration that
// created the first ones had to write the same words.
const StandaloneEpisodeTitle = "Standalone clips"

func (s *Store) EpisodeByID(ctx context.Context, id uuid.UUID) (Episode, error) {
	return scanEpisode(s.pool.QueryRow(ctx,
		`select `+episodeColumns+` from clip_sources s where s.id = $1`, id))
}

// EpisodePatch is what the studio can change about an episode. Moving it to
// another series moves its clips with it: a clip is in the episode it was cut
// from, and an episode is in one series.
type EpisodePatch struct {
	Title      *string    `json:"title"`
	PlaylistID *uuid.UUID `json:"playlistId"`
	Position   *int       `json:"position"`
	Published  *bool      `json:"published"`
}

func (s *Store) UpdateEpisode(ctx context.Context, id uuid.UUID, p EpisodePatch) (Episode, error) {
	var out Episode
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			update clip_sources set
				title       = coalesce($2, title),
				playlist_id = coalesce($3, playlist_id),
				position    = coalesce($4, position),
				published   = coalesce($5, published)
			where id = $1`, id, p.Title, p.PlaylistID, p.Position, p.Published); err != nil {
			return err
		}
		if p.PlaylistID != nil {
			// The clip keeps a copy of the playlist's name for the library's
			// filter, so moving the episode has to rewrite both.
			if _, err := tx.Exec(ctx, `
				update clips c set playlist_id = p.id, playlist = p.title
				from playlists p
				where c.source_id = $1 and p.id = $2`, id, *p.PlaylistID); err != nil {
				return err
			}
		}
		var err error
		out, err = scanEpisode(tx.QueryRow(ctx,
			`select `+episodeColumns+` from clip_sources s where s.id = $1`, id))
		return err
	})
	return out, err
}
