package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// Who comes back: the console's Growth page. Days are Vietnam's, as everywhere
// a learner's day is counted. "Active" is opening the app (user_days);
// "learning" is doing something that counts toward the goal (learning_events).

// GrowthDay is one day of the chart.
type GrowthDay struct {
	Day      string `json:"day"`
	Active   int    `json:"active"`
	Learning int    `json:"learning"`
	Signups  int    `json:"signups"`
	// Published is episodes put on the shelf that day.
	Published int `json:"published"`
}

// Cohort is the learners who joined in one week, and how many came back. A
// count is nil while the cohort is too young for it to be measured.
type Cohort struct {
	Week   string `json:"week"`
	Joined int    `json:"joined"`
	D1     *Share `json:"d1"`
	D7     *Share `json:"d7"`
	D30    *Share `json:"d30"`
}

// Share is how many of those who could have, did.
type Share struct {
	Of  int `json:"of"`
	Did int `json:"did"`
}

// Funnel is the learners who joined in the period, step by step.
type Funnel struct {
	Joined    int `json:"joined"`
	FirstTake int `json:"firstTake"`
	Returned  int `json:"returned"`
	Goal3     int `json:"goal3"`
}

// Growth is the console's Growth page.
type Growth struct {
	Today      string      `json:"today"`
	DAU        int         `json:"dau"`
	WAU        int         `json:"wau"`
	MAU        int         `json:"mau"`
	Learners   int         `json:"learners"`
	Days       []GrowthDay `json:"days"`
	Cohorts    []Cohort    `json:"cohorts"`
	Funnel     Funnel      `json:"funnel"`
	FunnelDays int         `json:"funnelDays"`
}

// CohortWeeks is how many weeks of sign-ups the retention table shows.
const CohortWeeks = 8

// Growth is the last `days` days of who came and who came back.
func (s *Store) Growth(ctx context.Context, days int, now time.Time) (Growth, error) {
	today, _, _ := game.Day(now)
	out := Growth{Today: today, Days: []GrowthDay{}, Cohorts: []Cohort{}, FunnelDays: days}
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			select
			  (select count(distinct user_id) from user_days where day = $1::date)::int,
			  (select count(distinct user_id) from user_days where day > $1::date - 7)::int,
			  (select count(distinct user_id) from user_days where day > $1::date - 30)::int,
			  (select count(*) from users)::int`, today).
			Scan(&out.DAU, &out.WAU, &out.MAU, &out.Learners); err != nil {
			return err
		}

		rows, err := tx.Query(ctx, `
			with d as (select generate_series($1::date - ($2::int - 1), $1::date, '1 day')::date as day)
			select to_char(d.day, 'YYYY-MM-DD'),
			  (select count(*) from user_days u where u.day = d.day)::int,
			  (select count(distinct user_id) from learning_events e where e.day = d.day)::int,
			  (select count(*) from users where (created_at at time zone 'Asia/Ho_Chi_Minh')::date = d.day)::int,
			  (select count(*) from clip_sources s
			   where s.published and (s.published_at at time zone 'Asia/Ho_Chi_Minh')::date = d.day)::int
			from d order by d.day`, today, days)
		if err != nil {
			return err
		}
		out.Days, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (GrowthDay, error) {
			var g GrowthDay
			err := r.Scan(&g.Day, &g.Active, &g.Learning, &g.Signups, &g.Published)
			return g, err
		})
		if err != nil {
			return err
		}

		// Back on day 1; on any day of the second week; on any day of the
		// week from day 30. A cohort member counts toward a share only once
		// that window has begun for them.
		rows, err = tx.Query(ctx, `
			with u as (
			  select id, (created_at at time zone 'Asia/Ho_Chi_Minh')::date as joined from users
			  where (created_at at time zone 'Asia/Ho_Chi_Minh')::date > $1::date - 7 * $2::int
			),
			back as (
			  select u.id, u.joined,
			    exists (select 1 from user_days d where d.user_id = u.id and d.day = u.joined + 1) as d1,
			    exists (select 1 from user_days d where d.user_id = u.id and d.day between u.joined + 7 and u.joined + 13) as d7,
			    exists (select 1 from user_days d where d.user_id = u.id and d.day between u.joined + 30 and u.joined + 36) as d30
			  from u
			)
			select to_char(date_trunc('week', joined)::date, 'YYYY-MM-DD') as week, count(*)::int,
			  count(*) filter (where joined + 1 <= $1::date)::int,  count(*) filter (where joined + 1 <= $1::date and d1)::int,
			  count(*) filter (where joined + 7 <= $1::date)::int,  count(*) filter (where joined + 7 <= $1::date and d7)::int,
			  count(*) filter (where joined + 30 <= $1::date)::int, count(*) filter (where joined + 30 <= $1::date and d30)::int
			from back group by 1 order by 1 desc`, today, CohortWeeks)
		if err != nil {
			return err
		}
		out.Cohorts, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (Cohort, error) {
			var c Cohort
			var of1, did1, of7, did7, of30, did30 int
			err := r.Scan(&c.Week, &c.Joined, &of1, &did1, &of7, &did7, &of30, &did30)
			share := func(of, did int) *Share {
				if of == 0 {
					return nil
				}
				return &Share{Of: of, Did: did}
			}
			c.D1, c.D7, c.D30 = share(of1, did1), share(of7, did7), share(of30, did30)
			return c, err
		})
		if err != nil {
			return err
		}

		return tx.QueryRow(ctx, `
			with u as (
			  select id, (created_at at time zone 'Asia/Ho_Chi_Minh')::date as joined from users
			  where (created_at at time zone 'Asia/Ho_Chi_Minh')::date > $1::date - $2::int
			)
			select count(*)::int,
			  count(*) filter (where exists (select 1 from takes t where t.user_id = u.id))::int,
			  count(*) filter (where exists (select 1 from user_days d where d.user_id = u.id and d.day > u.joined))::int,
			  count(*) filter (where (select count(*) from goal_days g where g.user_id = u.id) >= 3)::int
			from u`, today, days).
			Scan(&out.Funnel.Joined, &out.Funnel.FirstTake, &out.Funnel.Returned, &out.Funnel.Goal3)
	})
	return out, err
}
