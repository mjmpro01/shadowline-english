package store

import (
	"context"

	"github.com/google/uuid"
)

// LeaderboardRow mirrors what the dashboard already renders, so the screen keeps
// its shape when the sample learners go away.
type LeaderboardRow struct {
	UserID uuid.UUID `json:"userId"`
	Name   string    `json:"name"`
	Avg    float64   `json:"avg"`
	Takes  int       `json:"takes"`
	Clips  int       `json:"clips"`
	IsYou  bool      `json:"isYou"`
}

// Leaderboard ranks learners by their average scored take. Learners with no
// scored takes are left out rather than shown as zero — an empty average is not
// a bad one, and the app has been careful elsewhere not to invent numbers.
func (s *Store) Leaderboard(ctx context.Context, viewer uuid.UUID, limit int) ([]LeaderboardRow, error) {
	rows, err := s.pool.Query(ctx, `
		select u.id,
		       coalesce(nullif(u.name, ''), split_part(u.email, '@', 1)) as name,
		       avg(t.score)::float8,
		       count(*)::int,
		       count(distinct t.clip_id)::int
		from users u
		join takes t on t.user_id = u.id and t.score is not null
		group by u.id, name
		order by avg(t.score) desc, count(*) desc
		limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []LeaderboardRow{}
	for rows.Next() {
		var r LeaderboardRow
		if err := rows.Scan(&r.UserID, &r.Name, &r.Avg, &r.Takes, &r.Clips); err != nil {
			return nil, err
		}
		r.IsYou = r.UserID == viewer
		out = append(out, r)
	}
	return out, rows.Err()
}
