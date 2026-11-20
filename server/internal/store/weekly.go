package store

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// The weekly leaderboard: practice points from Monday to Sunday on Vietnam's
// clock, so everyone starts level each week and a learner who joined
// yesterday can be on it. When a week is over its top three keep a medal, and
// those who play the Arena are paid in gold.

// WeeklyGold is what first, second and third place are paid, into the Arena
// purse of a learner who plays.
var WeeklyGold = [3]int{100, 60, 40}

// settleWeeksBack is how many past weeks a settling looks at: a server nobody
// opened for a while still gives out the medals it owes.
const settleWeeksBack = 4

// WeekOf is the week now falls in: Monday 00:00 to the next Monday 00:00,
// Vietnam's clock.
func WeekOf(now time.Time) (start, end time.Time) {
	local := now.In(vietnamZone)
	back := (int(local.Weekday()) + 6) % 7
	start = time.Date(local.Year(), local.Month(), local.Day()-back, 0, 0, 0, 0, vietnamZone)
	return start, start.AddDate(0, 0, 7)
}

// Medals is how many times a learner finished a week first, second and third.
type Medals struct {
	Gold   int `json:"gold"`
	Silver int `json:"silver"`
	Bronze int `json:"bronze"`
}

// WeeklyRow is one learner on the week's board.
type WeeklyRow struct {
	Rank   int       `json:"rank"`
	UserID uuid.UUID `json:"userId"`
	Name   string    `json:"name"`
	Points int       `json:"points"`
	IsYou  bool      `json:"isYou"`
	Medals Medals    `json:"medals"`
}

// WeeklyPlace is one of last week's podium.
type WeeklyPlace struct {
	Place  int    `json:"place"`
	Name   string `json:"name"`
	Points int    `json:"points"`
	IsYou  bool   `json:"isYou"`
}

// WeeklyBoard is the week so far.
type WeeklyBoard struct {
	Week   string    `json:"week"`
	EndsAt time.Time `json:"endsAt"`
	// DaysLeft is the days until it ends, today counted: 1 on a Sunday.
	DaysLeft int         `json:"daysLeft"`
	Rows     []WeeklyRow `json:"rows"`
	// You is the viewer when they are on the board but below the rows shown.
	You      *WeeklyRow    `json:"you"`
	LastWeek []WeeklyPlace `json:"lastWeek"`
}

// rankedWeek ranks a week's learners: by points, then by more pieces of
// learning, then by who got there first. $1 and $2 bound the week's days.
const rankedWeek = `
	with totals as (
	  select user_id, sum(points)::int as points, count(*)::int as events, max(at) as last
	  from learning_events where day >= $1::date and day < $2::date
	  group by user_id
	)
	select (row_number() over (order by t.points desc, t.events desc, t.last, t.user_id))::int as rank,
	       t.user_id, coalesce(nullif(u.name, ''), split_part(u.email, '@', 1)) as name, t.points
	from totals t join users u on u.id = t.user_id
	where t.points > 0`

const medalsOf = `
	(select count(*) from weekly_awards a where a.user_id = r.user_id and a.place = 1)::int,
	(select count(*) from weekly_awards a where a.user_id = r.user_id and a.place = 2)::int,
	(select count(*) from weekly_awards a where a.user_id = r.user_id and a.place = 3)::int`

// WeeklyBoard is the week now falls in: its top `limit`, and the viewer below
// them if they are further down.
func (s *Store) WeeklyBoard(ctx context.Context, viewer uuid.UUID, limit int, now time.Time) (WeeklyBoard, error) {
	start, end := WeekOf(now)
	out := WeeklyBoard{
		Week: start.Format(dayLayout), EndsAt: end, Rows: []WeeklyRow{}, LastWeek: []WeeklyPlace{},
		DaysLeft: int(math.Ceil(end.Sub(now).Hours() / 24)),
	}
	rows, err := s.pool.Query(ctx, `
		select r.rank, r.user_id, r.name, r.points, `+medalsOf+`
		from (`+rankedWeek+`) r
		where r.rank <= $3 or r.user_id = $4
		order by r.rank`, start.Format(dayLayout), end.Format(dayLayout), limit, viewer)
	if err != nil {
		return out, err
	}
	all, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (WeeklyRow, error) {
		var w WeeklyRow
		err := r.Scan(&w.Rank, &w.UserID, &w.Name, &w.Points, &w.Medals.Gold, &w.Medals.Silver, &w.Medals.Bronze)
		w.IsYou = w.UserID == viewer
		return w, err
	})
	if err != nil {
		return out, err
	}
	for _, w := range all {
		if w.Rank <= limit {
			out.Rows = append(out.Rows, w)
		} else {
			you := w
			out.You = &you
		}
	}

	rows, err = s.pool.Query(ctx, `
		select a.place, coalesce(nullif(u.name, ''), split_part(u.email, '@', 1)), a.points, a.user_id = $2
		from weekly_awards a join users u on u.id = a.user_id
		where a.week = $1::date order by a.place`, start.AddDate(0, 0, -7).Format(dayLayout), viewer)
	if err != nil {
		return out, err
	}
	out.LastWeek, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (WeeklyPlace, error) {
		var p WeeklyPlace
		err := r.Scan(&p.Place, &p.Name, &p.Points, &p.IsYou)
		return p, err
	})
	if out.LastWeek == nil {
		out.LastWeek = []WeeklyPlace{}
	}
	return out, err
}

// SettleWeeks gives out the medals of every recent week that is over and has
// not been settled: its top three, and their gold for those who play. Safe to
// call from every request: one settles at a time, and a week only once.
func (s *Store) SettleWeeks(ctx context.Context, now time.Time) error {
	current, _ := WeekOf(now)
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext('shadowline.weekly.settle'))`); err != nil {
			return err
		}
		for back := settleWeeksBack; back >= 1; back-- {
			start := current.AddDate(0, 0, -7*back)
			week := start.Format(dayLayout)
			var settled bool
			if err := tx.QueryRow(ctx, `select exists (select 1 from weekly_settled where week = $1::date)`, week).Scan(&settled); err != nil {
				return err
			}
			if settled {
				continue
			}
			rows, err := tx.Query(ctx, `select r.rank, r.user_id, r.points from (`+rankedWeek+`) r where r.rank <= 3 order by r.rank`,
				week, start.AddDate(0, 0, 7).Format(dayLayout))
			if err != nil {
				return err
			}
			type winner struct {
				place  int
				user   uuid.UUID
				points int
			}
			winners, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (winner, error) {
				var w winner
				err := r.Scan(&w.place, &w.user, &w.points)
				return w, err
			})
			if err != nil {
				return err
			}
			for _, w := range winners {
				gold := WeeklyGold[w.place-1]
				// Into the purse of a learner who plays; a medal either way.
				tag, err := tx.Exec(ctx, `update game_profiles set gold = gold + $2 where user_id = $1`, w.user, gold)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					gold = 0
				} else if err := logEvent(ctx, tx, w.user, "weekly", week, gold); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `
					insert into weekly_awards (week, place, user_id, points, gold) values ($1::date, $2, $3, $4, $5)`,
					week, w.place, w.user, w.points, gold); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `insert into weekly_settled (week) values ($1::date)`, week); err != nil {
				return err
			}
		}
		return nil
	})
}

// MedalAward is one medal: the week it was won and the place.
type MedalAward struct {
	Week  string `json:"week"`
	Place int    `json:"place"`
}

// LearnerMedals is a learner's medals: the counts, and the latest few.
type LearnerMedals struct {
	Medals
	Recent []MedalAward `json:"recent"`
}

// MedalsOf is a learner's medals.
func (s *Store) MedalsOf(ctx context.Context, user uuid.UUID) (LearnerMedals, error) {
	out := LearnerMedals{Recent: []MedalAward{}}
	if err := s.pool.QueryRow(ctx, `
		select count(*) filter (where place = 1)::int, count(*) filter (where place = 2)::int,
		       count(*) filter (where place = 3)::int
		from weekly_awards where user_id = $1`, user).Scan(&out.Gold, &out.Silver, &out.Bronze); err != nil {
		return out, err
	}
	rows, err := s.pool.Query(ctx, `
		select to_char(week, 'YYYY-MM-DD'), place from weekly_awards
		where user_id = $1 order by week desc limit 5`, user)
	if err != nil {
		return out, err
	}
	out.Recent, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (MedalAward, error) {
		var m MedalAward
		err := r.Scan(&m.Week, &m.Place)
		return m, err
	})
	if out.Recent == nil {
		out.Recent = []MedalAward{}
	}
	return out, err
}

// Race is a learner close to a top-three place on the week's board: holding
// one with fourth place close behind, or just outside with third close ahead.
type Race struct {
	Rank   int
	Points int
	// Gap is the points between them and the place that matters: fourth's
	// lead to catch them, or what they need to catch third.
	Gap int
}

// RaceHold and RaceChase are how close counts: fourth within RaceHold of a
// learner in the top three, or a learner within RaceChase of third.
const (
	RaceHold  = 10
	RaceChase = 20
)

// WeeklyRace is where a learner stands in this week's race for a medal, or nil
// when nothing is close: well clear, far behind, or not on the board.
func (s *Store) WeeklyRace(ctx context.Context, user uuid.UUID, now time.Time) (*Race, error) {
	start, end := WeekOf(now)
	var rank, points, third, fourth int
	err := s.pool.QueryRow(ctx, `
		with r as (`+rankedWeek+`)
		select me.rank, me.points,
		       coalesce((select points from r where rank = 3), 0),
		       coalesce((select points from r where rank = 4), 0)
		from r me where me.user_id = $3`,
		start.Format(dayLayout), end.Format(dayLayout), user).Scan(&rank, &points, &third, &fourth)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	switch {
	case rank <= 3 && fourth > 0 && points-fourth <= RaceHold:
		return &Race{Rank: rank, Points: points, Gap: points - fourth}, nil
	case rank > 3 && rank <= 10 && points > 0 && third-points <= RaceChase:
		return &Race{Rank: rank, Points: points, Gap: third - points}, nil
	}
	return nil, nil
}

// LastWeekPlace is the place a learner finished last week, 0 for none, and the
// gold it paid.
func (s *Store) LastWeekPlace(ctx context.Context, user uuid.UUID, now time.Time) (place, gold int, err error) {
	start, _ := WeekOf(now)
	err = s.pool.QueryRow(ctx, `
		select place, gold from weekly_awards where user_id = $1 and week = $2::date`,
		user, start.AddDate(0, 0, -7).Format(dayLayout)).Scan(&place, &gold)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, nil
	}
	return place, gold, err
}
