package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// What a learner does each day, counted toward a daily goal and a streak. The
// day is Vietnam's (game.Day), the same as the Arena's quests and dictation
// reviews, so "today" means one thing everywhere.

// Activity kinds, and what each is worth toward the day's goal.
const (
	ActTake            = "take"
	ActReview          = "review"
	ActDictation       = "dictation"
	ActDictationReview = "dictation_review"
	ActDialoguePass    = "dialogue_pass"
	ActRoleplayTurn    = "roleplay_turn"
)

var activityPoints = map[string]int{
	ActTake:            2,
	ActReview:          1,
	ActDictation:       5,
	ActDictationReview: 3,
	ActDialoguePass:    1,
	ActRoleplayTurn:    2,
}

// Goals a learner can choose, in points a day.
var Goals = []int{10, 20, 40}

// ErrBadGoal is a goal that is not one of Goals.
var ErrBadGoal = errors.New("a daily goal is 10, 20 or 40 points")

// DefaultGoal is the goal of a learner who has not chosen one.
const DefaultGoal = 20

// GoalGold is what reaching the day's goal adds to the Arena purse, once a day.
const GoalGold = 20

// MaxFreezes is how many missed days a streak can have saved up to cover.
const MaxFreezes = 2

// FreezeEvery is how many days of streak earn a freeze.
const FreezeEvery = 7

const dayLayout = "2006-01-02"

// Streak is a run of days with learning in them.
type Streak struct {
	Count   int
	Best    int
	Freezes int
	// LastDay is the last day with learning in it, "" for never.
	LastDay string
}

// daysBetween is how many days from a to b, both "2006-01-02".
func daysBetween(a, b string) int {
	ta, err1 := time.Parse(dayLayout, a)
	tb, err2 := time.Parse(dayLayout, b)
	if err1 != nil || err2 != nil {
		return 1 << 20
	}
	return int(tb.Sub(ta).Hours() / 24)
}

// Advance is the streak after learning on day: the same day changes nothing;
// the next day adds one; days missed are covered by freezes while there are
// enough, else the streak starts again. Every FreezeEvery days earns a freeze.
func (s Streak) Advance(day string) Streak {
	if s.LastDay == day {
		return s
	}
	if s.LastDay == "" {
		s.Count = 1
	} else {
		missed := daysBetween(s.LastDay, day) - 1
		switch {
		case missed < 0:
			// A day before the last one: the clock is the only way here.
			return s
		case missed == 0:
			s.Count++
		case missed <= s.Freezes:
			s.Freezes -= missed
			s.Count++
		default:
			s.Count = 1
		}
	}
	s.LastDay = day
	if s.Count%FreezeEvery == 0 && s.Freezes < MaxFreezes {
		s.Freezes++
	}
	if s.Count > s.Best {
		s.Best = s.Count
	}
	return s
}

// Standing is the streak as it stands on day, before any learning that day:
// what is shown. Alive while the days missed are no more than the freezes;
// at risk when today has nothing in it yet.
func (s Streak) Standing(day string) (count int, today bool, atRisk bool) {
	if s.LastDay == "" || s.Count == 0 {
		return 0, false, false
	}
	if s.LastDay == day {
		return s.Count, true, false
	}
	missed := daysBetween(s.LastDay, day) - 1
	if missed < 0 || missed > s.Freezes {
		return 0, false, false
	}
	return s.Count, false, true
}

// streakFromDays rebuilds a streak from the days with learning in them, most
// recent first: for a learner whose activity predates the stored streak.
func streakFromDays(days []string) Streak {
	var s Streak
	for i := len(days) - 1; i >= 0; i-- {
		s = s.Advance(days[i])
	}
	return s
}

// lockGoal reads a learner's goal and streak for update, making the row if
// there is none: its streak rebuilt from what was learned before.
func lockGoal(ctx context.Context, tx pgx.Tx, user uuid.UUID) (goal int, chosen bool, s Streak, err error) {
	var last *time.Time
	err = tx.QueryRow(ctx, `
		select daily_points, goal_chosen, streak, best, freezes, last_day
		from learner_goals where user_id = $1 for update`, user).
		Scan(&goal, &chosen, &s.Count, &s.Best, &s.Freezes, &last)
	if err == nil {
		if last != nil {
			s.LastDay = last.Format(dayLayout)
		}
		return goal, chosen, s, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, false, s, err
	}
	rows, err := tx.Query(ctx, `
		select distinct day from learning_events where user_id = $1 order by day desc limit 400`, user)
	if err != nil {
		return 0, false, s, err
	}
	days, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (string, error) {
		var d time.Time
		err := r.Scan(&d)
		return d.Format(dayLayout), err
	})
	if err != nil {
		return 0, false, s, err
	}
	// Only the run that reaches the latest day matters; older days are kept
	// in best.
	s = streakFromDays(days)
	if _, err := tx.Exec(ctx, `
		insert into learner_goals (user_id, streak, best, freezes, last_day)
		values ($1, $2, $3, $4, $5)
		on conflict (user_id) do nothing`, user, s.Count, s.Best, s.Freezes, nullDay(s.LastDay)); err != nil {
		return 0, false, s, err
	}
	err = tx.QueryRow(ctx, `
		select daily_points, goal_chosen from learner_goals where user_id = $1 for update`, user).Scan(&goal, &chosen)
	return goal, chosen, s, err
}

func nullDay(day string) any {
	if day == "" {
		return nil
	}
	return day
}

// LogActivity records a piece of learning: it counts toward today's goal and
// keeps the streak going. Reaching the goal for the first time today puts
// GoalGold in the Arena purse. It answers whether the goal was reached by this.
func (s *Store) LogActivity(ctx context.Context, user uuid.UUID, kind string, now time.Time) (bool, error) {
	points, ok := activityPoints[kind]
	if !ok {
		return false, fmt.Errorf("unknown activity %q", kind)
	}
	day, start, end := game.Day(now)
	reached := false
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		goal, _, streak, err := lockGoal(ctx, tx, user)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into learning_events (user_id, kind, points, at, day) values ($1, $2, $3, $4, $5)`,
			user, kind, points, now, day); err != nil {
			return err
		}
		next := streak.Advance(day)
		if _, err := tx.Exec(ctx, `
			update learner_goals set streak = $2, best = $3, freezes = $4, last_day = $5 where user_id = $1`,
			user, next.Count, next.Best, next.Freezes, day); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into user_days (user_id, day) values ($1, $2) on conflict do nothing`, user, day); err != nil {
			return err
		}
		var today int
		if err := tx.QueryRow(ctx, `
			select coalesce(sum(points), 0)::int from learning_events
			where user_id = $1 and at >= $2 and at < $3`, user, start, end).Scan(&today); err != nil {
			return err
		}
		if today < goal {
			return nil
		}
		tag, err := tx.Exec(ctx, `insert into goal_days (user_id, day) values ($1, $2) on conflict do nothing`, user, day)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		reached = true
		// Into the Arena purse of a learner who plays; nobody is given a farm
		// for reaching a goal.
		tag, err = tx.Exec(ctx, `update game_profiles set gold = gold + $2 where user_id = $1`, user, GoalGold)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		return logEvent(ctx, tx, user, "goal", "", GoalGold)
	})
	return reached, err
}

// SawToday records that a learner opened the app today, for daily actives and
// retention.
func (s *Store) SawToday(ctx context.Context, user uuid.UUID, now time.Time) error {
	day, _, _ := game.Day(now)
	_, err := s.pool.Exec(ctx, `insert into user_days (user_id, day) values ($1, $2) on conflict do nothing`, user, day)
	return err
}

// SetGoal sets a learner's daily goal, one of Goals.
func (s *Store) SetGoal(ctx context.Context, user uuid.UUID, points int) error {
	valid := false
	for _, g := range Goals {
		valid = valid || g == points
	}
	if !valid {
		return ErrBadGoal
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, _, _, err := lockGoal(ctx, tx, user); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `update learner_goals set daily_points = $2, goal_chosen = true where user_id = $1`, user, points)
		return err
	})
}

// TodayStreak is the streak as the app shows it.
type TodayStreak struct {
	Count   int  `json:"count"`
	Best    int  `json:"best"`
	Freezes int  `json:"freezes"`
	Today   bool `json:"today"`
	AtRisk  bool `json:"atRisk"`
}

// TodayArena is the day's three Arena tasks, for a learner who plays.
type TodayArena struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

// Today is what a learner has done today and what is left to do.
type Today struct {
	Day        string `json:"day"`
	Goal       int    `json:"goal"`
	GoalChosen bool   `json:"goalChosen"`
	Points     int    `json:"points"`
	Reached    bool   `json:"reached"`
	// GoalGold is what reaching the goal adds to the Arena purse; 0 for a
	// learner who does not play.
	GoalGold int         `json:"goalGold"`
	Streak   TodayStreak `json:"streak"`
	// NextClip is the clip to practise next; nil for an empty library.
	NextClip       *Clip       `json:"nextClip"`
	VocabDue       int         `json:"vocabDue"`
	DictationsDue  int         `json:"dictationsDue"`
	FirstDictation *Dictation  `json:"firstDictation"`
	Arena          *TodayArena `json:"arena"`
}

// Today is the learner's day so far, and the list of what is worth doing.
func (s *Store) Today(ctx context.Context, user uuid.UUID, now time.Time) (Today, error) {
	day, start, end := game.Day(now)
	out := Today{Day: day}
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		goal, chosen, streak, err := lockGoal(ctx, tx, user)
		if err != nil {
			return err
		}
		out.Goal, out.GoalChosen = goal, chosen
		out.Streak.Count, out.Streak.Today, out.Streak.AtRisk = streak.Standing(day)
		out.Streak.Best, out.Streak.Freezes = streak.Best, streak.Freezes
		if err := tx.QueryRow(ctx, `
			select coalesce(sum(points), 0)::int from learning_events
			where user_id = $1 and at >= $2 and at < $3`, user, start, end).Scan(&out.Points); err != nil {
			return err
		}
		out.Reached = out.Points >= goal
		return tx.QueryRow(ctx, `
			select count(*)::int from vocab_words
			where user_id = $1 and due_at <= $2`, user, now).Scan(&out.VocabDue)
	})
	if err != nil {
		return out, err
	}

	// The next line of the episode they were in, when there is one: the same
	// clip the dashboard's "pick up where you left off" offers. Otherwise the
	// library's next.
	cont, err := s.ContinueFor(ctx, user)
	if err != nil {
		return out, err
	}
	if cont != nil {
		out.NextClip = &cont.Next
	} else {
		clip, err := s.NextUp(ctx, user)
		switch {
		case err == nil:
			out.NextClip = &clip
		case !errors.Is(err, ErrNotFound):
			return out, err
		}
	}

	dictations, err := s.Dictations(ctx, user, now)
	if err != nil {
		return out, err
	}
	out.DictationsDue = len(dictations.Due)
	if len(dictations.Due) > 0 {
		out.FirstDictation = &dictations.Due[0]
	}

	// The Arena's tasks, only for a learner who has been there: asking makes
	// a farm for whoever asks.
	var plays bool
	if err := s.pool.QueryRow(ctx, `select exists (select 1 from game_profiles where user_id = $1)`, user).Scan(&plays); err != nil {
		return out, err
	}
	if plays {
		quests, err := s.GameQuests(ctx, user)
		if err != nil {
			return out, err
		}
		arena := &TodayArena{Total: len(quests.Daily)}
		for _, q := range quests.Daily {
			if q.Done {
				arena.Done++
			}
		}
		out.Arena = arena
		out.GoalGold = GoalGold
	}
	return out, nil
}
