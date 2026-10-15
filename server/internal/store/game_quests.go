package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// The Arena's quests: the story, and three small tasks a day.
//
// Progress is counted from what is already written down — the game's events,
// the learner's takes and flashcard reviews — each time it is asked for, so
// nothing has to remember to bump a counter. Only rewards already taken are
// stored, so none is taken twice.

type MainQuest struct {
	Index int `json:"step"`
	game.Step
	Progress int  `json:"progress"`
	Done     bool `json:"done"`
}

type DailyQuest struct {
	game.Daily
	Progress int  `json:"progress"`
	Done     bool `json:"done"`
	Claimed  bool `json:"claimed"`
}

type DailyChest struct {
	Ready   bool        `json:"ready"`
	Claimed bool        `json:"claimed"`
	Reward  game.Reward `json:"reward"`
	// Streak is the days in a row every task was finished, today included once
	// the chest is open. Bonus is what the next chest adds for it.
	Streak int         `json:"streak"`
	Bonus  game.Reward `json:"bonus"`
}

type Quests struct {
	// Main is null once the story so far is told.
	Main      *MainQuest   `json:"main"`
	Day       string       `json:"day"`
	EndsAt    time.Time    `json:"endsAt"`
	Daily     []DailyQuest `json:"daily"`
	Chest     DailyChest   `json:"chest"`
	Claimable int          `json:"claimable"`
}

// forever is the far end of a count that has no end.
var forever = time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC)

// countFor counts what a quest counts, between from and to.
func countFor(ctx context.Context, tx pgx.Tx, user uuid.UUID, c game.Counter, from, to time.Time) (int, error) {
	var sql string
	args := []any{user, from, to}
	switch c.Kind {
	case "event":
		sql = `select count(*)::int from game_events
		       where user_id = $1 and at >= $2 and at < $3 and kind = $4`
		args = append(args, c.Item)
	case "words":
		sql = `select count(*)::int from game_events
		       where user_id = $1 and at >= $2 and at < $3 and kind = 'harvest' and item <> ''`
	case "spent":
		sql = `select coalesce(sum(-gold), 0)::int from game_events
		       where user_id = $1 and at >= $2 and at < $3 and gold < 0`
	case "takes":
		sql = `select count(*)::int from takes
		       where user_id = $1 and recorded_at >= $2 and recorded_at < $3
		         and ($4 = 0 or (status = 'scored' and score >= $4))`
		args = append(args, c.MinScore)
	case "reviews":
		sql = `select count(*)::int from vocab_words
		       where user_id = $1 and reviewed_at >= $2 and reviewed_at < $3`
	default:
		return 0, fmt.Errorf("unknown quest counter %q", c.Kind)
	}
	var n int
	err := tx.QueryRow(ctx, sql, args...).Scan(&n)
	return n, err
}

func mainProgress(ctx context.Context, tx pgx.Tx, user uuid.UUID, p profileRow) (*MainQuest, error) {
	if p.mainStep >= len(game.MainQuests) {
		return nil, nil
	}
	step := game.MainQuests[p.mainStep]
	q := &MainQuest{Index: p.mainStep, Step: step}
	if step.Target > 0 {
		from := p.mainStepAt
		if step.Counter.Ever {
			from = time.Time{}
		}
		n, err := countFor(ctx, tx, user, step.Counter, from, forever)
		if err != nil {
			return nil, err
		}
		q.Progress = min(n, step.Target)
	}
	q.Done = q.Progress >= step.Target
	return q, nil
}

func claimedToday(ctx context.Context, tx pgx.Tx, user uuid.UUID, day time.Time) (map[string]bool, error) {
	rows, err := tx.Query(ctx, `
		select quest from game_quest_claims where user_id = $1 and day = $2`, user, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var q string
		if err := rows.Scan(&q); err != nil {
			return nil, err
		}
		out[q] = true
	}
	return out, rows.Err()
}

// chestStreak is how many days in a row up to `through` the chest was opened.
func chestStreak(ctx context.Context, tx pgx.Tx, user uuid.UUID, through time.Time) (int, error) {
	rows, err := tx.Query(ctx, `
		select day from game_quest_claims
		where user_id = $1 and quest = 'chest' and day <= $2
		order by day desc limit 400`, user, through)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	streak := 0
	want := through
	for rows.Next() {
		var day time.Time
		if err := rows.Scan(&day); err != nil {
			return 0, err
		}
		if day.Format("2006-01-02") != want.Format("2006-01-02") {
			break
		}
		streak++
		want = want.AddDate(0, 0, -1)
	}
	return streak, rows.Err()
}

func readQuests(ctx context.Context, tx pgx.Tx, user uuid.UUID, p profileRow, now time.Time) (Quests, error) {
	day, start, end := game.Day(now)
	out := Quests{Day: day, EndsAt: end, Daily: []DailyQuest{}}

	main, err := mainProgress(ctx, tx, user, p)
	if err != nil {
		return out, err
	}
	out.Main = main
	if main != nil && main.Done {
		out.Claimable++
	}

	claimed, err := claimedToday(ctx, tx, user, start)
	if err != nil {
		return out, err
	}
	allClaimed := true
	for _, d := range game.DailyFor(user.String(), day) {
		n, err := countFor(ctx, tx, user, d.Counter, start, end)
		if err != nil {
			return out, err
		}
		q := DailyQuest{Daily: d, Progress: min(n, d.Target), Claimed: claimed[d.ID]}
		q.Done = q.Progress >= d.Target
		if q.Done && !q.Claimed {
			out.Claimable++
		}
		allClaimed = allClaimed && q.Claimed
		out.Daily = append(out.Daily, q)
	}

	out.Chest = DailyChest{Ready: allClaimed, Claimed: claimed["chest"], Reward: game.DailyChest}
	today := start
	if !out.Chest.Claimed {
		// Until today's chest is open, the streak is the one it would extend.
		today = start.AddDate(0, 0, -1)
	}
	out.Chest.Streak, err = chestStreak(ctx, tx, user, today)
	if err != nil {
		return out, err
	}
	if !out.Chest.Claimed {
		out.Chest.Bonus = game.StreakBonus(out.Chest.Streak + 1)
	}
	if out.Chest.Ready && !out.Chest.Claimed {
		out.Claimable++
	}
	return out, nil
}

// GameQuests is the story step the player is on and the day's tasks.
func (s *Store) GameQuests(ctx context.Context, user uuid.UUID) (Quests, error) {
	var out Quests
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		out, err = readQuests(ctx, tx, user, p, now)
		return err
	})
	return out, err
}

func applyReward(ctx context.Context, tx pgx.Tx, user uuid.UUID, p *profileRow, now time.Time, r game.Reward) error {
	p.gold += r.Gold
	if r.Stamina > 0 {
		current, _ := game.Stamina(p.stamina, p.staminaAt, now)
		p.stamina, p.staminaAt = game.SetStamina(p.stamina, p.staminaAt, now, current+r.Stamina)
	}
	for item, qty := range r.Items {
		if err := addItem(ctx, tx, user, item, qty); err != nil {
			return err
		}
	}
	return nil
}

func addRewards(a, b game.Reward) game.Reward {
	out := game.Reward{Gold: a.Gold + b.Gold, Stamina: a.Stamina + b.Stamina, Items: map[string]int{}}
	for _, r := range []game.Reward{a, b} {
		for k, v := range r.Items {
			out.Items[k] += v
		}
	}
	return out
}

// ClaimQuest takes a finished quest's reward: "main" for the story step,
// "chest" for the day's chest, or one of the day's task ids. It answers with
// what was given, the state after, and the quests after.
func (s *Store) ClaimQuest(ctx context.Context, user uuid.UUID, id string) (game.Reward, GameState, Quests, error) {
	var given game.Reward
	var state GameState
	var quests Quests
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		before, err := readQuests(ctx, tx, user, p, now)
		if err != nil {
			return err
		}
		_, today, _ := game.Day(now)

		switch id {
		case "main":
			if before.Main == nil {
				return refuse("no_quest", "the story so far is told")
			}
			if !before.Main.Done {
				return refuse("not_done", "that quest is not finished yet")
			}
			given = before.Main.Reward
			p.mainStep++
			p.mainStepAt = now
		case "chest":
			if before.Chest.Claimed {
				return refuse("claimed", "today's chest is already open")
			}
			if !before.Chest.Ready {
				return refuse("not_done", "finish today's tasks first")
			}
			given = addRewards(before.Chest.Reward, before.Chest.Bonus)
			if _, err := tx.Exec(ctx, `
				insert into game_quest_claims (user_id, quest, day) values ($1, 'chest', $2)`,
				user, today); err != nil {
				return err
			}
		default:
			var task *DailyQuest
			for i := range before.Daily {
				if before.Daily[i].ID == id {
					task = &before.Daily[i]
				}
			}
			if task == nil {
				return refuse("no_quest", "that is not one of today's tasks")
			}
			if task.Claimed {
				return refuse("claimed", "already claimed")
			}
			if !task.Done {
				return refuse("not_done", "that task is not finished yet")
			}
			given = task.Reward
			if _, err := tx.Exec(ctx, `
				insert into game_quest_claims (user_id, quest, day) values ($1, $2, $3)`,
				user, id, today); err != nil {
				return err
			}
		}

		if err := applyReward(ctx, tx, user, &p, now, given); err != nil {
			return err
		}
		if err := saveProfile(ctx, tx, user, p); err != nil {
			return err
		}
		if state, err = readState(ctx, tx, user, p, now); err != nil {
			return err
		}
		quests, err = readQuests(ctx, tx, user, p, now)
		return err
	})
	return given, state, quests, err
}
