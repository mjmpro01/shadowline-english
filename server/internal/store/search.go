package store

import (
	"context"
	"strings"
)

// Results is what one search across the library finds, at each of its three
// levels. A learner remembering "the one where Ross says pivot" is not telling
// us whether pivot is a series, an episode or a line, so all three are looked
// in and each is answered separately rather than mixed into one ranked list
// where a series and a six-second clip would sit side by side meaning
// different things.
type Results struct {
	Playlists []Playlist `json:"playlists"`
	Episodes  []Episode  `json:"episodes"`
	Clips     []Clip     `json:"clips"`
}

// MinSearch is the shortest query worth running. One letter matches most of the
// library and answers nothing.
const MinSearch = 2

// searchLimit caps each level. The screen shows a section per level and nobody
// reads the four hundredth result; a query this broad wants narrowing, not
// paginating.
const searchLimit = 40

// Search looks for a fragment anywhere in the library.
//
// `ilike '%fragment%'` rather than full text: a learner types half a line they
// half remember, and to_tsquery is built for whole words. The trigram indexes
// added with the playlists table are what make that fragment search an index
// lookup instead of a scan of every caption in the library.
func (s *Store) Search(ctx context.Context, query string) (Results, error) {
	out := Results{Playlists: []Playlist{}, Episodes: []Episode{}, Clips: []Clip{}}
	query = strings.TrimSpace(query)
	if len(query) < MinSearch {
		return out, nil
	}
	like := "%" + escapeLike(query) + "%"

	rows, err := s.pool.Query(ctx, `select `+playlistColumns+`
		from playlists p
		where p.title ilike $2 or p.description ilike $2
		order by p.hot desc, p.title
		limit `+itoa(searchLimit), recentInterval(), like)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		p, err := scanPlaylist(rows)
		if err != nil {
			rows.Close()
			return out, err
		}
		out.Playlists = append(out.Playlists, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	rows, err = s.pool.Query(ctx, `select `+episodeColumns+`
		from clip_sources s
		where s.published and s.title ilike $1
		order by s.position, s.created_at
		limit `+itoa(searchLimit), like)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		v, err := scanEpisode(rows)
		if err != nil {
			rows.Close()
			return out, err
		}
		out.Episodes = append(out.Episodes, v)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	// A clip is found by its name, by the series or recording it came from, by
	// its tags, or by the words spoken in it — the last being the one learners
	// actually use, and the reason the captions are searched as text rather
	// than picked apart.
	//
	// Named matches come before spoken ones: somebody who types a clip's name
	// wants that clip, not every line that happens to contain the word.
	rows, err = s.pool.Query(ctx, `select `+clipColumns+`
		from clips
		where title ilike $1 or playlist ilike $1 or source ilike $1
		   or captions::text ilike $1
		   or exists (select 1 from unnest(categories) tag where tag ilike $1)
		order by (case when title ilike $1 then 0 else 1 end), playlist, start_seconds, title
		limit `+itoa(searchLimit), like)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		c, err := scanClip(rows)
		if err != nil {
			return out, err
		}
		out.Clips = append(out.Clips, c)
	}
	return out, rows.Err()
}

// escapeLike neutralises what LIKE treats as a wildcard, so searching for a
// literal underscore or percent finds one rather than everything.
func escapeLike(text string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(text)
}
