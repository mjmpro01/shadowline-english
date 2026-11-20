package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Milestone achievements. Each track is a ladder of targets counted from the
// tables that already record the learning, so nothing new has to be kept up
// to date as a learner practises; reaching a target unlocks it for good and,
// for a learner who plays the Arena, pays gold.

// AchievementTrack is one ladder: what it counts and the targets on it.
type AchievementTrack struct {
	Track   string
	Targets []int
}

// Achievements is every track, in the order the app shows them.
var Achievements = []AchievementTrack{
	{"takes", []int{1, 50, 200, 1000}},
	{"score", []int{1, 25, 100}},
	{"streak", []int{3, 7, 30, 100}},
	{"goal", []int{1, 7, 30}},
	{"dictation", []int{1, 20, 100}},
	{"perfect", []int{1, 10}},
	{"words", []int{10, 50, 200}},
	{"dialogue", []int{10, 100}},
	{"tutor", []int{1, 50}},
	{"medal", []int{1, 5}},
}

// AchievementGold is what a tier pays, by its place on the ladder.
var AchievementGold = []int{20, 50, 100, 200}

// AchievementID names a tier: "takes.50".
func AchievementID(track string, target int) string { return fmt.Sprintf("%s.%d", track, target) }

// achievementCounts is every track's count for one learner, in one query.
const achievementCounts = `
	select
	  (select count(*) from takes where user_id = $1 and status <> 'failed')::int,
	  (select count(*) from takes where user_id = $1 and score >= 90)::int,
	  coalesce((select best from learner_goals where user_id = $1), 0)::int,
	  (select count(*) from goal_days where user_id = $1)::int,
	  (select count(*) from dictations where user_id = $1)::int,
	  (select count(*) from dictations where user_id = $1 and total > 0 and "right" >= total)::int,
	  (select count(*) from vocab_words where user_id = $1 and status = 'known')::int,
	  (select count(*) from dialogue_passes where user_id = $1)::int,
	  (select count(*) from roleplay_turns t join roleplays r on r.id = t.roleplay_id
	    where r.user_id = $1 and t.role = 'user')::int,
	  (select count(*) from weekly_awards where user_id = $1)::int`

func countAchievements(ctx context.Context, q querier, user uuid.UUID) (map[string]int, error) {
	n := make([]int, len(Achievements))
	dest := make([]any, len(n))
	for i := range n {
		dest[i] = &n[i]
	}
	if err := q.QueryRow(ctx, achievementCounts, user).Scan(dest...); err != nil {
		return nil, err
	}
	out := make(map[string]int, len(n))
	for i, t := range Achievements {
		out[t.Track] = n[i]
	}
	return out, nil
}

// UnlockedAchievement is a tier a learner has reached.
type UnlockedAchievement struct {
	ID     string `json:"id"`
	Track  string `json:"track"`
	Target int    `json:"target"`
	Gold   int    `json:"gold"`
}

func parseAchievement(id string) (track string, target int, ok bool) {
	dot := strings.LastIndexByte(id, '.')
	if dot < 0 {
		return "", 0, false
	}
	if _, err := fmt.Sscanf(id[dot+1:], "%d", &target); err != nil {
		return "", 0, false
	}
	return id[:dot], target, true
}

// SyncAchievements counts a learner's tracks and unlocks every tier reached
// that was not unlocked yet, paying its gold once. It answers the tiers it
// unlocked. For a learner who was here before achievements, the first count
// unlocks what they had already earned as seen, so they are not greeted by a
// celebration for every one of them.
func (s *Store) SyncAchievements(ctx context.Context, user uuid.UUID, now time.Time) ([]UnlockedAchievement, error) {
	var out []UnlockedAchievement
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		out = nil
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext('shadowline.achievements.' || $1::text))`, user); err != nil {
			return err
		}
		// A learner who was here before achievements: unlocked as seen.
		quiet, err := tx.Exec(ctx, `delete from achievement_quiet where user_id = $1`, user)
		if err != nil {
			return err
		}
		quietly := quiet.RowsAffected() == 1
		counts, err := countAchievements(ctx, tx, user)
		if err != nil {
			return err
		}
		var seen *time.Time
		if quietly {
			seen = &now
		}
		for _, t := range Achievements {
			for i, target := range t.Targets {
				if counts[t.Track] < target {
					break
				}
				id := AchievementID(t.Track, target)
				gold := AchievementGold[i]
				tag, err := tx.Exec(ctx, `
					insert into learner_achievements (user_id, id, unlocked_at, seen_at, gold)
					values ($1, $2, $3, $4, 0) on conflict do nothing`, user, id, now, seen)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					continue
				}
				// Into the purse of a learner who plays; the tier either way.
				paid, err := tx.Exec(ctx, `update game_profiles set gold = gold + $2 where user_id = $1`, user, gold)
				if err != nil {
					return err
				}
				if paid.RowsAffected() == 0 {
					gold = 0
				} else {
					if err := logEvent(ctx, tx, user, "achievement", id, gold); err != nil {
						return err
					}
					if _, err := tx.Exec(ctx, `update learner_achievements set gold = $3 where user_id = $1 and id = $2`, user, id, gold); err != nil {
						return err
					}
				}
				out = append(out, UnlockedAchievement{ID: id, Track: t.Track, Target: target, Gold: gold})
			}
		}
		return nil
	})
	return out, err
}

// AchievementTier is one target on a track, unlocked or not.
type AchievementTier struct {
	ID         string     `json:"id"`
	Target     int        `json:"target"`
	Gold       int        `json:"gold"`
	UnlockedAt *time.Time `json:"unlockedAt"`
}

// AchievementProgress is a track as a learner stands on it.
type AchievementProgress struct {
	Track string            `json:"track"`
	Count int               `json:"count"`
	Tiers []AchievementTier `json:"tiers"`
}

// AchievementBoard is all of a learner's tracks.
type AchievementBoard struct {
	Tracks   []AchievementProgress `json:"tracks"`
	Unlocked int                   `json:"unlocked"`
	Total    int                   `json:"total"`
}

// AchievementsOf is where a learner stands on every track.
func (s *Store) AchievementsOf(ctx context.Context, user uuid.UUID) (AchievementBoard, error) {
	out := AchievementBoard{Tracks: []AchievementProgress{}}
	counts, err := countAchievements(ctx, s.pool, user)
	if err != nil {
		return out, err
	}
	rows, err := s.pool.Query(ctx, `select id, unlocked_at, gold from learner_achievements where user_id = $1`, user)
	if err != nil {
		return out, err
	}
	type got struct {
		at   time.Time
		gold int
	}
	unlocked := map[string]got{}
	var id string
	var g got
	if _, err := pgx.ForEachRow(rows, []any{&id, &g.at, &g.gold}, func() error {
		unlocked[id] = g
		return nil
	}); err != nil {
		return out, err
	}
	for _, t := range Achievements {
		p := AchievementProgress{Track: t.Track, Count: counts[t.Track], Tiers: []AchievementTier{}}
		for i, target := range t.Targets {
			tier := AchievementTier{ID: AchievementID(t.Track, target), Target: target, Gold: AchievementGold[i]}
			if u, ok := unlocked[tier.ID]; ok {
				at := u.at
				tier.UnlockedAt, tier.Gold = &at, u.gold
				out.Unlocked++
			}
			p.Tiers = append(p.Tiers, tier)
			out.Total++
		}
		out.Tracks = append(out.Tracks, p)
	}
	return out, nil
}

// UnseenAchievements is what a learner has unlocked and not yet been shown,
// oldest first.
func (s *Store) UnseenAchievements(ctx context.Context, user uuid.UUID) ([]UnlockedAchievement, error) {
	rows, err := s.pool.Query(ctx, `
		select id, gold from learner_achievements
		where user_id = $1 and seen_at is null order by unlocked_at, id`, user)
	if err != nil {
		return nil, err
	}
	out := []UnlockedAchievement{}
	var id string
	var gold int
	_, err = pgx.ForEachRow(rows, []any{&id, &gold}, func() error {
		if track, target, ok := parseAchievement(id); ok {
			out = append(out, UnlockedAchievement{ID: id, Track: track, Target: target, Gold: gold})
		}
		return nil
	})
	return out, err
}

// MarkAchievementsSeen records that a learner has been shown these.
func (s *Store) MarkAchievementsSeen(ctx context.Context, user uuid.UUID, ids []string, now time.Time) error {
	_, err := s.pool.Exec(ctx, `
		update learner_achievements set seen_at = $3
		where user_id = $1 and id = any($2) and seen_at is null`, user, ids, now)
	return err
}

// UnnotifiedAchievements is what a learner unlocked more than `wait` ago and
// has neither seen in the app nor been told of by push, oldest first. The wait
// gives the app's own celebration the first chance.
func (s *Store) UnnotifiedAchievements(ctx context.Context, user uuid.UUID, now time.Time, wait time.Duration) ([]UnlockedAchievement, error) {
	rows, err := s.pool.Query(ctx, `
		select id, gold from learner_achievements
		where user_id = $1 and seen_at is null and notified_at is null and unlocked_at <= $2
		order by unlocked_at, id`, user, now.Add(-wait))
	if err != nil {
		return nil, err
	}
	out := []UnlockedAchievement{}
	var id string
	var gold int
	_, err = pgx.ForEachRow(rows, []any{&id, &gold}, func() error {
		if track, target, ok := parseAchievement(id); ok {
			out = append(out, UnlockedAchievement{ID: id, Track: track, Target: target, Gold: gold})
		}
		return nil
	})
	return out, err
}

// MarkAchievementsNotified records that a learner was told of these by push.
func (s *Store) MarkAchievementsNotified(ctx context.Context, user uuid.UUID, ids []string, now time.Time) error {
	_, err := s.pool.Exec(ctx, `
		update learner_achievements set notified_at = $3 where user_id = $1 and id = any($2)`, user, ids, now)
	return err
}
