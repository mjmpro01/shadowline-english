package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// What is new to a learner, where they left off, and the series they follow.
// A learner follows a series by practising in it, and can stop; an episode is
// new to them until they open it or practise in it.

// NewWindow is how long an episode stays new after it is published.
const NewWindow = 14 * 24 * time.Hour

// MaxNew is how many new episodes the dashboard is sent.
const MaxNew = 30

// recentEpisodes is how far back in a learner's takes "where they left off" is
// looked for.
const recentEpisodes = 20

var vietnamZone = time.FixedZone("ICT", 7*60*60)

// AutoFollow follows a series for a learner who has just practised in it,
// unless they have followed it before — or stopped following it, which is a
// choice practising again does not undo.
func (s *Store) AutoFollow(ctx context.Context, user, playlist uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		insert into series_follows (user_id, playlist_id) values ($1, $2)
		on conflict do nothing`, user, playlist)
	return err
}

// SetFollow follows a series, or stops following it.
func (s *Store) SetFollow(ctx context.Context, user, playlist uuid.UUID, following bool) error {
	_, err := s.pool.Exec(ctx, `
		insert into series_follows (user_id, playlist_id, following) values ($1, $2, $3)
		on conflict (user_id, playlist_id) do update set following = excluded.following, updated_at = now()`,
		user, playlist, following)
	return err
}

// Following is whether a learner follows a series.
func (s *Store) Following(ctx context.Context, user, playlist uuid.UUID) (bool, error) {
	var following bool
	err := s.pool.QueryRow(ctx, `
		select coalesce((select following from series_follows where user_id = $1 and playlist_id = $2), false)`,
		user, playlist).Scan(&following)
	return following, err
}

// MarkEpisodeSeen records that a learner opened an episode: it is no longer
// new to them. ErrNotFound for an episode that does not exist.
func (s *Store) MarkEpisodeSeen(ctx context.Context, user, episode uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		insert into episode_seen (user_id, source_id)
		select $1, id from clip_sources where id = $2
		on conflict do nothing`, user, episode)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var exists bool
	if err := s.pool.QueryRow(ctx, `select exists (select 1 from clip_sources where id = $1)`, episode).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	return nil
}

// Continue is where a learner left off: an episode they were practising, how
// far they are through it, and the next clip in it.
type Continue struct {
	Episode   Episode   `json:"episode"`
	Playlist  *Playlist `json:"playlist"`
	Total     int       `json:"total"`
	Practised int       `json:"practised"`
	Next      Clip      `json:"next"`
}

// ContinueFor is the episode of the learner's latest takes that still has a
// clip they have not practised, and that clip, the first in the episode's
// order. Nil when there is none: no takes, or every episode finished.
func (s *Store) ContinueFor(ctx context.Context, user uuid.UUID) (*Continue, error) {
	var episode uuid.UUID
	err := s.pool.QueryRow(ctx, `
		with recent as (
		  select c.source_id, max(t.recorded_at) as last
		  from takes t join clips c on c.id = t.clip_id
		  where t.user_id = $1 and c.source_id is not null
		  group by c.source_id
		  order by last desc
		  limit $2
		)
		select r.source_id from recent r
		join clip_sources s on s.id = r.source_id and s.published
		where exists (
		  select 1 from clips c
		  where c.source_id = r.source_id
		    and not exists (select 1 from takes t where t.clip_id = c.id and t.user_id = $1)
		)
		order by r.last desc
		limit 1`, user, recentEpisodes).Scan(&episode)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	out := &Continue{}
	if out.Episode, err = s.EpisodeByID(ctx, episode); err != nil {
		return nil, err
	}
	if out.Next, err = scanClip(s.pool.QueryRow(ctx, `
		select `+clipColumns+` from clips
		where source_id = $2
		  and not exists (select 1 from takes t where t.clip_id = clips.id and t.user_id = $1)
		order by start_seconds, title
		limit 1`, user, episode)); err != nil {
		return nil, err
	}
	if err := s.pool.QueryRow(ctx, `
		select count(*)::int,
		       count(*) filter (where exists (select 1 from takes t where t.clip_id = c.id and t.user_id = $1))::int
		from clips c where c.source_id = $2`, user, episode).Scan(&out.Total, &out.Practised); err != nil {
		return nil, err
	}
	if out.Episode.PlaylistID != nil {
		p, err := s.PlaylistByID(ctx, *out.Episode.PlaylistID)
		if err != nil && !errors.Is(err, ErrNotFound) {
			return nil, err
		}
		if err == nil {
			out.Playlist = &p
		}
	}
	return out, nil
}

// NewEpisode is an episode new to a learner, with the series it is in.
type NewEpisode struct {
	Episode
	PlaylistSlug  string    `json:"playlistSlug"`
	PlaylistTitle string    `json:"playlistTitle"`
	Followed      bool      `json:"followed"`
	PublishedAt   time.Time `json:"publishedAt"`
	// Standalone is the episode a series' loose clips hang in: its title says
	// nothing to a learner, so the series' is shown instead.
	Standalone bool `json:"standalone"`
	// SinceLastVisit is published after the last day the learner came before
	// today ended: new since they last looked.
	SinceLastVisit bool `json:"sinceLastVisit"`
}

// NewEpisodes is what is new to a learner: the newest episodes, followed
// series first, and how many are new in each series.
type NewEpisodes struct {
	Episodes []NewEpisode `json:"episodes"`
	// Series is how many episodes are new in each series, by its id.
	Series map[string]int `json:"series"`
}

// unseen is an episode published within the window that the learner has
// neither opened nor practised in. $1 is the learner, $2 the window's start.
const unseen = `s.published and s.published_at >= $2
	and exists (select 1 from clips c where c.source_id = s.id)
	and not exists (select 1 from episode_seen e where e.user_id = $1 and e.source_id = s.id)
	and not exists (
	  select 1 from takes t join clips c on c.id = t.clip_id
	  where t.user_id = $1 and c.source_id = s.id
	)`

// NewFor is what is new to a learner now.
func (s *Store) NewFor(ctx context.Context, user uuid.UUID, now time.Time) (NewEpisodes, error) {
	out := NewEpisodes{Episodes: []NewEpisode{}, Series: map[string]int{}}
	since := now.Add(-NewWindow)

	// The end of the last day they came before today, in Vietnam's day.
	local := now.In(vietnamZone)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, vietnamZone)
	var last *time.Time
	if err := s.pool.QueryRow(ctx, `
		select max(day) from user_days where user_id = $1 and day < $2::date`,
		user, today.Format(dayLayout)).Scan(&last); err != nil {
		return out, err
	}
	var visitEnded *time.Time
	if last != nil {
		end := time.Date(last.Year(), last.Month(), last.Day(), 0, 0, 0, 0, vietnamZone).AddDate(0, 0, 1)
		visitEnded = &end
	}

	rows, err := s.pool.Query(ctx, `
		select `+episodeColumns+`, p.slug, p.title, coalesce(f.following, false), s.published_at, s.key = ''
		from clip_sources s
		join playlists p on p.id = s.playlist_id
		left join series_follows f on f.user_id = $1 and f.playlist_id = s.playlist_id
		where `+unseen+`
		order by coalesce(f.following, false) desc, s.published_at desc
		limit $3`, user, since, MaxNew)
	if err != nil {
		return out, err
	}
	out.Episodes, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (NewEpisode, error) {
		var e NewEpisode
		err := r.Scan(&e.ID, &e.PlaylistID, &e.Title, &e.Position, &e.Published,
			&e.Clips, &e.Seconds, &e.PosterKey, &e.CreatedAt,
			&e.PlaylistSlug, &e.PlaylistTitle, &e.Followed, &e.PublishedAt, &e.Standalone)
		e.SinceLastVisit = visitEnded != nil && !e.PublishedAt.Before(*visitEnded)
		return e, err
	})
	if err != nil {
		return out, err
	}

	rows, err = s.pool.Query(ctx, `
		select s.playlist_id::text, count(*)::int from clip_sources s
		where s.playlist_id is not null and `+unseen+`
		group by s.playlist_id`, user, since)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return out, err
		}
		out.Series[id] = n
	}
	return out, rows.Err()
}
