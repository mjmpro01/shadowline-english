package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Playlist is a series: Friends, a lecture course, a channel. One level above
// the video, which is one level above the clip.
//
// The counts and the cover are read rather than stored. A playlist card is only
// ever shown in a list, the list is one query either way, and a stored count is
// a count that goes wrong the first time anybody deletes a clip.
type Playlist struct {
	ID          uuid.UUID `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	// Hot is an admin's choice of what to push. RecentTakes is the measurement
	// beside it, so a badge nobody has earned is visible as such.
	Hot         bool `json:"hot"`
	RecentTakes int  `json:"recentTakes"`
	Position    int  `json:"position"`
	Episodes    int  `json:"episodes"`
	Clips       int  `json:"clips"`
	// CoverKey is the picture an admin uploaded for the series, or, when there
	// is none, the still of its first clip that has one; the API signs it into
	// CoverURL. OwnCover says which: the console offers to remove an uploaded
	// cover, and there is nothing to remove from a borrowed one.
	CoverKey  *string   `json:"-"`
	CoverURL  string    `json:"coverUrl"`
	OwnCover  bool      `json:"ownCover"`
	CreatedAt time.Time `json:"createdAt"`
}

// recentWindow is what "hot" is counted over. A week rather than a day so a
// quiet Tuesday does not empty the number, and rather than a month so it still
// says something about now.
const recentWindow = 7 * 24 * time.Hour

const playlistColumns = `p.id, p.slug, p.title, p.description, p.hot, p.position,
	(select count(*) from clip_sources s where s.playlist_id = p.id and s.published),
	(select count(*) from clips c where c.playlist_id = p.id),
	(select count(*) from takes t join clips c on c.id = t.clip_id
	 where c.playlist_id = p.id and t.recorded_at > now() - $1::interval),
	coalesce(p.cover_key, (select c.poster_key from clips c
	 where c.playlist_id = p.id and c.poster_key is not null
	 order by c.start_seconds, c.created_at limit 1)),
	p.cover_key is not null,
	p.created_at`

func scanPlaylist(row pgx.Row) (Playlist, error) {
	var p Playlist
	err := row.Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.Hot, &p.Position,
		&p.Episodes, &p.Clips, &p.RecentTakes, &p.CoverKey, &p.OwnCover, &p.CreatedAt)
	return p, mapErr(err)
}

func recentInterval() string {
	return itoa(int(recentWindow/time.Hour)) + " hours"
}

// itoa is strconv.Itoa under a shorter name, because it is used inline in SQL
// strings where the long form buries the query.
func itoa(n int) string { return strconv.Itoa(n) }

// ListPlaylists answers the library's front screen, a page at a time.
//
// Hot first, then the order an admin gave them, then alphabetically — so a
// library nobody has curated still reads as a list rather than as insertion
// order, which is the order of nothing a learner can see. The id breaks the
// last tie, so a page boundary never falls between two series that sort the
// same and shows one of them twice.
//
// limit 0 is every series: the console's pickers need the whole list. total is
// how many there are whatever the page, counted in the same query.
//
// Written apart from playlistColumns, which counts per series with a subquery
// each: right for the one series a page asks for, and for the whole list a
// scan of every clip and every take once per series. Here each count is taken
// once over the table and joined on, and only the cover is looked up per
// series, on the index made for it. 37–48 ms became 3.1 ms on a library of
// 12,650 clips (migration 00015 has the numbers).
func (s *Store) ListPlaylists(ctx context.Context, offset, limit int) ([]Playlist, int, error) {
	return s.listPlaylists(ctx, nil, offset, limit)
}

// SectionPlaylists is the series on one shelf of the library, in the order
// the shelf gives them, a page at a time.
func (s *Store) SectionPlaylists(ctx context.Context, section uuid.UUID, offset, limit int) ([]Playlist, int, error) {
	return s.listPlaylists(ctx, &section, offset, limit)
}

// The whole library, or one shelf of it. The two differ only in which series
// are on the page and in their order: a shelf has an order of its own.
const (
	everySeries = `select p.*, count(*) over () as total from playlists p
			order by p.hot desc, p.position, p.title, p.id`
	everySeriesOrder = `p.hot desc, p.position, p.title, p.id`
	shelfSeries      = `select p.*, m.position as shelf_position, count(*) over () as total
			from playlists p
			join library_section_series m on m.playlist_id = p.id and m.section_id = $4
			order by m.position, p.title, p.id`
	shelfSeriesOrder = `p.shelf_position, p.title, p.id`
)

func (s *Store) listPlaylists(ctx context.Context, section *uuid.UUID, offset, limit int) ([]Playlist, int, error) {
	if offset < 0 {
		offset = 0
	}
	var lim *int
	if limit > 0 {
		lim = &limit
	}
	choose, order := everySeries, everySeriesOrder
	args := []any{recentInterval(), offset, lim}
	if section != nil {
		choose, order = shelfSeries, shelfSeriesOrder
		args = append(args, *section)
	}
	rows, err := s.pool.Query(ctx, `
		with episodes as (
			select playlist_id, count(*) as n from clip_sources
			where published group by playlist_id),
		clip_counts as (
			select playlist_id, count(*) as n from clips
			where playlist_id is not null group by playlist_id),
		recent as (
			select c.playlist_id, count(*) as n
			from takes t join clips c on c.id = t.clip_id
			where t.recorded_at > now() - $1::interval and c.playlist_id is not null
			group by c.playlist_id),
		page as (`+choose+`
			offset $2 limit $3)
		select p.id, p.slug, p.title, p.description, p.hot, p.position,
		       coalesce(e.n, 0), coalesce(cc.n, 0), coalesce(r.n, 0),
		       coalesce(p.cover_key, cover.poster_key), p.cover_key is not null,
		       p.created_at, p.total
		from page p
		left join episodes e on e.playlist_id = p.id
		left join clip_counts cc on cc.playlist_id = p.id
		left join recent r on r.playlist_id = p.id
		left join lateral (
			select c.poster_key from clips c
			where p.cover_key is null and c.playlist_id = p.id and c.poster_key is not null
			order by c.start_seconds, c.created_at limit 1) cover on true
		order by `+order, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []Playlist{}
	total := 0
	for rows.Next() {
		var p Playlist
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.Hot, &p.Position,
			&p.Episodes, &p.Clips, &p.RecentTakes, &p.CoverKey, &p.OwnCover, &p.CreatedAt,
			&total); err != nil {
			return nil, 0, err
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	// A page past the end has no rows to carry the total on.
	if len(out) == 0 && offset > 0 {
		count := `select count(*) from playlists`
		var countArgs []any
		if section != nil {
			count = `select count(*) from library_section_series where section_id = $1`
			countArgs = []any{*section}
		}
		if err := s.pool.QueryRow(ctx, count, countArgs...).Scan(&total); err != nil {
			return nil, 0, err
		}
	}
	return out, total, nil
}

// SetPlaylistCover records a series' uploaded cover, or clears it with nil, and
// answers with the key it replaced so the caller can delete that picture.
func (s *Store) SetPlaylistCover(ctx context.Context, id uuid.UUID, key *string) (old *string, err error) {
	err = s.pool.QueryRow(ctx, `
		update playlists p set cover_key = $2
		from (select cover_key from playlists where id = $1 for update) prev
		where p.id = $1
		returning prev.cover_key`, id, key).Scan(&old)
	return old, mapErr(err)
}

func (s *Store) PlaylistBySlug(ctx context.Context, slug string) (Playlist, error) {
	return scanPlaylist(s.pool.QueryRow(ctx,
		`select `+playlistColumns+` from playlists p where p.slug = $2`, recentInterval(), slug))
}

func (s *Store) PlaylistByID(ctx context.Context, id uuid.UUID) (Playlist, error) {
	return scanPlaylist(s.pool.QueryRow(ctx,
		`select `+playlistColumns+` from playlists p where p.id = $2`, recentInterval(), id))
}

// PlaylistPatch is what the studio can change about a series. Nil means leave
// alone, as everywhere else.
type PlaylistPatch struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Hot         *bool   `json:"hot"`
	Position    *int    `json:"position"`
}

// UpdatePlaylist renames a series without moving its clips: the name lives on
// the playlist row now, and the copy on each clip is kept in step so the
// library's filter and the dashboard keep reading the same word.
func (s *Store) UpdatePlaylist(ctx context.Context, id uuid.UUID, p PlaylistPatch) (Playlist, error) {
	var out Playlist
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			update playlists set
				title       = coalesce($2, title),
				description = coalesce($3, description),
				hot         = coalesce($4, hot),
				position    = coalesce($5, position)
			where id = $1`, id, p.Title, p.Description, p.Hot, p.Position); err != nil {
			return err
		}
		if p.Title != nil {
			if _, err := tx.Exec(ctx,
				`update clips set playlist = $2 where playlist_id = $1`, id, *p.Title); err != nil {
				return err
			}
		}
		var err error
		out, err = scanPlaylist(tx.QueryRow(ctx,
			`select `+playlistColumns+` from playlists p where p.id = $2`, recentInterval(), id))
		return err
	})
	return out, err
}

var notSlug = regexp.MustCompile(`[^a-z0-9]+`)

// slugify reduces a title to url characters. Non-latin titles reduce to nothing
// — a series called only in Vietnamese, say — and those fall back to a word
// plus the suffix the caller adds, which is ugly and addressable and never
// collides.
func slugify(title string) string {
	slug := strings.Trim(notSlug.ReplaceAllString(strings.ToLower(title), "-"), "-")
	if slug == "" {
		return "playlist"
	}
	return slug
}

// PlaylistFor finds the series with this title or starts one.
//
// Called on every publish, so that the studio keeps working exactly as it did —
// an admin types a name, and whether that name is new is the store's problem
// rather than a second screen the admin has to visit first.
//
// Matching is case-insensitive: "friends" and "Friends" are one series, and
// finding that out from two rows in the library would be finding out too late.
func (s *Store) PlaylistFor(ctx context.Context, title string) (Playlist, error) {
	return playlistFor(ctx, s.pool, title)
}

// querier is what both a pool and a transaction satisfy, so find-or-create can
// run inside the transaction that publishes a clip.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func playlistFor(ctx context.Context, q querier, title string) (Playlist, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return Playlist{}, ErrNotFound
	}

	var id uuid.UUID
	err := q.QueryRow(ctx, `select id from playlists where lower(title) = lower($1)`, title).Scan(&id)
	if err == nil {
		return scanPlaylist(q.QueryRow(ctx,
			`select `+playlistColumns+` from playlists p where p.id = $2`, recentInterval(), id))
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Playlist{}, err
	}

	base := slugify(title)
	for _, slug := range append([]string{base}, numbered(base)...) {
		err := q.QueryRow(ctx, `
			insert into playlists (slug, title) values ($1, $2)
			on conflict (slug) do nothing
			returning id`, slug, title).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			continue // that slug is taken by a different title; try the next.
		}
		if err != nil {
			return Playlist{}, err
		}
		return scanPlaylist(q.QueryRow(ctx,
			`select `+playlistColumns+` from playlists p where p.id = $2`, recentInterval(), id))
	}
	return Playlist{}, errors.New("could not find a free slug for " + title)
}

// numbered is the fallbacks for a taken slug: friends-2 … friends-9, and then a
// random suffix, which cannot collide twice in any library anybody will build.
func numbered(base string) []string {
	out := make([]string, 0, 9)
	for n := 2; n < 10; n++ {
		out = append(out, base+"-"+strconv.Itoa(n))
	}
	var buf [4]byte
	_, _ = rand.Read(buf[:])
	return append(out, base+"-"+hex.EncodeToString(buf[:]))
}

// ErrNotEmpty is a series that still has something in it.
var ErrNotEmpty = errors.New("not empty")

// DeletePlaylist removes a series, and only an empty one.
//
// Not a cascade, unlike DeleteEpisode. A series is a shelf: the mistake it
// recovers from is a name typed wrong, not a batch published wrong, and the
// thing it would take with it is a whole season of somebody's practice. An
// admin who does mean that deletes the episodes first, which makes them look
// at what they are deleting on the way.
//
// Empty means no clip points at it, which covers both the episodes and the
// loose clips an episode was invented to hold.
// Returns the recordings of the empty episodes it took with it, so the caller
// can drop the objects.
func (s *Store) DeletePlaylist(ctx context.Context, id uuid.UUID) ([]string, error) {
	var keys []string
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var used bool
		if err := tx.QueryRow(ctx,
			`select exists (select 1 from clips where playlist_id = $1)`, id).Scan(&used); err != nil {
			return err
		}
		if used {
			return ErrNotEmpty
		}
		// The empty episodes it may still hold go with it: an episode with no
		// clips left is one whose clips have already been deleted, and it is
		// being deleted because the series is.
		var err error
		// Its sources' recordings, and its own cover if it was given one.
		keys, err = keysFrom(ctx, tx, `
			select key from clip_sources where playlist_id = $1 and key <> ''
			union all
			select cover_key from playlists where id = $1 and cover_key is not null`, id)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from clip_sources where playlist_id = $1`, id); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `delete from playlists where id = $1`, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
	return keys, err
}
