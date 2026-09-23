package store

import (
	"context"
	"strings"

	"github.com/google/uuid"
)

// The library used to reach the app as one list of every clip in it, fetched
// at sign-in. Measured against forty series it was 7.4MB and four hundred
// milliseconds, most of it signed poster URLs for clips nobody was going to
// open. Everything here exists so that no screen has to ask for the library to
// answer a question about part of it.

// FeaturedClips is what the dashboard offers. An admin picks these, so there
// are a handful of them and no paging.
func (s *Store) FeaturedClips(ctx context.Context) ([]Clip, error) {
	return s.clipsFrom(ctx,
		`select `+clipColumns+` from clips where featured order by created_at, title`)
}

// MaxClipIDs caps a batch lookup. The screens that use one are asking about a
// page of cards or a handful of vocabulary; anything larger is the whole
// library asked for one id at a time.
const MaxClipIDs = 200

// ClipsByIDs answers for the clips a screen already knows it needs — the ones
// a learner's vocabulary came from, the ones behind their lowest scores.
func (s *Store) ClipsByIDs(ctx context.Context, ids []uuid.UUID) ([]Clip, error) {
	if len(ids) == 0 {
		return []Clip{}, nil
	}
	return s.clipsFrom(ctx,
		`select `+clipColumns+` from clips where id = any($1) order by created_at, title`, ids)
}

// NextUp is the clip to offer this learner next: one they have never
// practised, or failing that the one they have scored worst on.
//
// On the server because it is a question about the whole library, and the app
// no longer holds the whole library. It was computed in the browser, which is
// the reason the browser was being sent every clip.
//
// ErrNotFound when the library is empty, which is a real answer and not a
// failure: a fresh install has nothing to offer.
func (s *Store) NextUp(ctx context.Context, userID uuid.UUID) (Clip, error) {
	clip, err := scanClip(s.pool.QueryRow(ctx, `
		select `+clipColumns+` from clips
		where not exists (
			select 1 from takes t where t.clip_id = clips.id and t.user_id = $1
		)
		order by created_at, title
		limit 1`, userID))
	if err == nil || err != ErrNotFound {
		return clip, err
	}

	// Everything has been tried at least once, so the one to go back to is the
	// one that went worst. Judged on the best take of each clip rather than the
	// latest: having already managed 88 on a line means it is not the weak one,
	// whatever today's attempt looked like.
	return scanClip(s.pool.QueryRow(ctx, `
		select `+clipColumns+` from clips
		left join (
			select clip_id, max(score) as best from takes
			where user_id = $1 and score is not null
			group by clip_id
		) b on b.clip_id = clips.id
		order by coalesce(b.best, 0), created_at
		limit 1`, userID))
}

// Summary is the two numbers and one list the app used to work out for itself
// by counting the library it had been sent.
type Summary struct {
	Clips  int `json:"clips"`
	Series int `json:"series"`
	// Every tag in use, sorted. A category cuts across series, so the library
	// offers them as searches rather than as branches.
	Categories []string `json:"categories"`
}

func (s *Store) LibrarySummary(ctx context.Context) (Summary, error) {
	var out Summary
	err := s.pool.QueryRow(ctx, `
		select (select count(*) from clips),
		       (select count(*) from playlists),
		       (select coalesce(array_agg(distinct tag order by tag), '{}')
		        from clips, unnest(categories) tag)`).
		Scan(&out.Clips, &out.Series, &out.Categories)
	return out, err
}

// StudioClips is the clip manager's page: the studio is the one screen whose
// job is the whole library, and the only one that gets to page through it.
//
// The total comes back with the page because the tab is labelled with it.
func (s *Store) StudioClips(ctx context.Context, query string, limit, offset int) ([]Clip, int, error) {
	// Two parameters rather than one: the first says whether anything was
	// typed, the second is what to look for. One parameter doing both ends up
	// as a comparison against "%%", which reads like a typo.
	q := strings.TrimSpace(query)
	like := "%" + escapeLike(q) + "%"

	const match = `$1 = '' or title ilike $2 or playlist ilike $2 or source ilike $2
		or captions::text ilike $2
		or exists (select 1 from unnest(categories) tag where tag ilike $2)`

	var total int
	if err := s.pool.QueryRow(ctx,
		`select count(*) from clips where `+match, q, like).Scan(&total); err != nil {
		return nil, 0, err
	}

	clips, err := s.clipsFrom(ctx, `select `+clipColumns+` from clips
		where `+match+`
		order by created_at, title
		limit $3 offset $4`, q, like, limit, offset)
	return clips, total, err
}

func (s *Store) clipsFrom(ctx context.Context, sql string, args ...any) ([]Clip, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
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

// NextClipNumber is what the next unnamed clip in a playlist should be called.
//
// The studio shows these as placeholders before publishing, so it has to know
// the number without holding the playlist. It continues from the highest one
// already there rather than restarting at one: publishing an episode in a
// single batch is the common case and the two agree there; going back to cut a
// few more lines into the same playlist is where restarting would give it a
// second "Clip 1".
//
// Only names of exactly that shape count. A clip an admin named themselves is
// not part of the sequence and should not push it along.
func (s *Store) NextClipNumber(ctx context.Context, playlist string) (int, error) {
	var next int
	err := s.pool.QueryRow(ctx, `
		select coalesce(max((regexp_match(title, '^[Cc]lip\s+(\d+)$'))[1]::int), 0) + 1
		from clips where playlist = $1`, strings.TrimSpace(playlist)).Scan(&next)
	return next, err
}
