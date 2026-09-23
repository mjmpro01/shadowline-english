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
	// CoverKey is the still of the first clip that has one; the API signs it
	// into CoverURL. A playlist has no picture of its own to upload — the
	// pictures are already in it.
	CoverKey  *string   `json:"-"`
	CoverURL  string    `json:"coverUrl"`
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
	(select c.poster_key from clips c
	 where c.playlist_id = p.id and c.poster_key is not null
	 order by c.start_seconds, c.created_at limit 1),
	p.created_at`

func scanPlaylist(row pgx.Row) (Playlist, error) {
	var p Playlist
	err := row.Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.Hot, &p.Position,
		&p.Episodes, &p.Clips, &p.RecentTakes, &p.CoverKey, &p.CreatedAt)
	return p, mapErr(err)
}

func recentInterval() string {
	return itoa(int(recentWindow/time.Hour)) + " hours"
}

// itoa is strconv.Itoa under a shorter name, because it is used inline in SQL
// strings where the long form buries the query.
func itoa(n int) string { return strconv.Itoa(n) }

// ListPlaylists answers the library's front screen.
//
// Hot first, then the order an admin gave them, then alphabetically — so a
// library nobody has curated still reads as a list rather than as insertion
// order, which is the order of nothing a learner can see.
func (s *Store) ListPlaylists(ctx context.Context) ([]Playlist, error) {
	rows, err := s.pool.Query(ctx, `select `+playlistColumns+`
		from playlists p
		order by p.hot desc, p.position, p.title`, recentInterval())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Playlist{}
	for rows.Next() {
		p, err := scanPlaylist(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
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
		keys, err = keysFrom(ctx, tx,
			`select key from clip_sources where playlist_id = $1 and key <> ''`, id)
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
