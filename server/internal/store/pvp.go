package store

import (
	"context"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/arena"
)

// Duels against shadows: another learner's fighter, played by the machine with
// their stats and gear, or a sparring bot from the tower when there are too few
// learners about. A result moves the attacker's rating and their week on the
// Arena board, whose top three are paid when the week is over.

// ErrPvPSelf is a learner asking to fight their own shadow.
var ErrPvPSelf = errors.New("you cannot fight your own shadow")

// rivalCount is how many opponents are offered at a time.
const rivalCount = 3

// ArenaWeekGold is the coins first, second and third on a week's Arena board
// are paid.
var ArenaWeekGold = [3]int{150, 90, 60}

// Rival is someone to fight: a learner's shadow, or a sparring bot.
type Rival struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Character arena.Character `json:"character"`
	Level     int             `json:"level"`
	Rating    int             `json:"rating"`
	Bot       bool            `json:"bot"`
}

// Rivals is who a learner can fight now: the learners rated nearest them who
// they have not fought in the last day, and sparring bots to make up three.
func (s *Store) Rivals(ctx context.Context, user uuid.UUID, now time.Time) ([]Rival, error) {
	var level, rating int
	err := s.pool.QueryRow(ctx, `select level, rating from fighters where user_id = $1`, user).Scan(&level, &rating)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoFighter
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		select f.user_id, f.name, f.character, f.level, f.rating
		from fighters f
		where f.user_id <> $1
		  and not exists (
		    select 1 from duels d
		    where d.user_id = $1 and d.kind = 'pvp' and d.opponent_user = f.user_id and d.started_at > $3)
		order by abs(f.rating - $2), f.level desc, f.created_at
		limit $4`, user, rating, now.Add(-24*time.Hour), rivalCount)
	if err != nil {
		return nil, err
	}
	type found struct {
		id uuid.UUID
		r  Rival
	}
	out := []Rival{}
	var f found
	var character string
	if _, err := pgx.ForEachRow(rows, []any{&f.id, &f.r.Name, &character, &f.r.Level, &f.r.Rating}, func() error {
		f.r.ID, f.r.Character = f.id.String(), characterOf(character)
		out = append(out, f.r)
		return nil
	}); err != nil {
		return nil, err
	}
	// Bots make up the rest: a floor below, level with, and above the learner.
	seen := map[int]bool{}
	for _, step := range []int{0, 1, -1, 2, -2} {
		if len(out) >= rivalCount {
			break
		}
		floor := arena.BotFloor(level, step)
		if seen[floor] {
			continue
		}
		seen[floor] = true
		b, _ := arena.Bot(floor)
		out = append(out, Rival{ID: b.ID, Name: b.Name.Vi, Character: b.Character, Level: b.Level, Rating: b.Rating, Bot: true})
	}
	return out, nil
}

// rivalOpponent is the opponent a rival id names: a bot, or a learner's shadow
// as they stand now.
func rivalOpponent(ctx context.Context, tx pgx.Tx, user uuid.UUID, rival string) (arena.Opponent, *uuid.UUID, error) {
	if floor, ok := strings.CutPrefix(rival, "bot:"); ok {
		n, err := strconv.Atoi(floor)
		if err != nil {
			return arena.Opponent{}, nil, ErrNotFound
		}
		b, ok := arena.Bot(n)
		if !ok {
			return arena.Opponent{}, nil, ErrNotFound
		}
		return b, nil, nil
	}
	id, err := uuid.Parse(rival)
	if err != nil {
		return arena.Opponent{}, nil, ErrNotFound
	}
	if id == user {
		return arena.Opponent{}, nil, ErrPvPSelf
	}
	var name, character string
	var level, rating int
	err = tx.QueryRow(ctx, `select name, character, level, rating from fighters where user_id = $1`, id).
		Scan(&name, &character, &level, &rating)
	if errors.Is(err, pgx.ErrNoRows) {
		return arena.Opponent{}, nil, ErrNotFound
	}
	if err != nil {
		return arena.Opponent{}, nil, err
	}
	return arena.Shadow(id.String(), name, characterOf(character), level, rating), &id, nil
}

// StartPvP starts a duel against a rival's shadow, for a unit of energy, or
// answers the duel already under way.
func (s *Store) StartPvP(ctx context.Context, user uuid.UUID, rival string, now time.Time) (DuelView, error) {
	var view DuelView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		f, err := lockFighter(ctx, tx, user)
		if err != nil {
			return err
		}
		if d, err := activeDuel(ctx, tx, user); err != nil || d != nil {
			if d != nil {
				view = d.view()
			}
			return err
		}
		o, oppUser, err := rivalOpponent(ctx, tx, user, rival)
		if err != nil {
			return err
		}
		view, err = s.openDuel(ctx, tx, user, f, "pvp", 0, o, oppUser, now)
		return err
	})
	return view, err
}

// pvpFinish settles a duel against a shadow: the rating moves, the record and
// the week's board count it, and a win pays coins and experience. Nothing
// here unlocks the tower.
func (s *Store) pvpFinish(ctx context.Context, tx pgx.Tx, user uuid.UUID, d *duelRow, f fighterRow, won bool, now time.Time) error {
	o := d.opponent
	next := max(arena.MinRating, f.rating+arena.Elo(f.rating, o.Rating, won))
	d.ratingDelta = next - f.rating
	level, xp := f.level, f.xp
	if won {
		d.state = "won"
		d.coins, d.xp = arena.PvPCoins(f.level, o.Level), arena.PvPXP
		if err := credit(ctx, tx, user, "pvp", o.ID, d.coins); err != nil {
			return err
		}
		level, xp = arena.AddXP(f.level, f.xp, d.xp)
		d.levelUp = level > f.level
		points := 3
		if o.Rating > f.rating {
			points++
		}
		start, _ := WeekOf(now)
		if _, err := tx.Exec(ctx, `
			insert into arena_week_points (user_id, week, wins, points) values ($1, $2::date, 1, $3)
			on conflict (user_id, week) do update
			set wins = arena_week_points.wins + 1, points = arena_week_points.points + excluded.points`,
			user, start.Format(dayLayout), points); err != nil {
			return err
		}
	} else {
		d.state = "lost"
	}
	wins, losses := 0, 1
	if won {
		wins, losses = 1, 0
	}
	_, err := tx.Exec(ctx, `
		update fighters set rating = $2, level = $3, xp = $4, pvp_wins = pvp_wins + $5, pvp_losses = pvp_losses + $6
		where user_id = $1`, user, next, level, xp, wins, losses)
	return err
}

// ArenaRow is one fighter on the week's Arena board.
type ArenaRow struct {
	Rank      int       `json:"rank"`
	UserID    uuid.UUID `json:"userId"`
	Name      string    `json:"name"`
	Character string    `json:"character"`
	Points    int       `json:"points"`
	Wins      int       `json:"wins"`
	Rating    int       `json:"rating"`
	IsYou     bool      `json:"isYou"`
}

// ArenaBoardView is the week's Arena board.
type ArenaBoardView struct {
	Week     string        `json:"week"`
	DaysLeft int           `json:"daysLeft"`
	Rows     []ArenaRow    `json:"rows"`
	You      *ArenaRow     `json:"you"`
	LastWeek []WeeklyPlace `json:"lastWeek"`
	Prizes   [3]int        `json:"prizes"`
}

const rankedArenaWeek = `
	select (row_number() over (order by p.points desc, p.wins desc, f.rating desc, p.user_id))::int as rank,
	       p.user_id, f.name, f.character, p.points, p.wins, f.rating
	from arena_week_points p join fighters f on f.user_id = p.user_id
	where p.week = $1::date and p.points > 0`

// ArenaBoard is the week's Arena board: its top `limit`, and the viewer below
// them if they are further down.
func (s *Store) ArenaBoard(ctx context.Context, viewer uuid.UUID, limit int, now time.Time) (ArenaBoardView, error) {
	start, end := WeekOf(now)
	out := ArenaBoardView{
		Week: start.Format(dayLayout), Rows: []ArenaRow{}, LastWeek: []WeeklyPlace{}, Prizes: ArenaWeekGold,
		DaysLeft: int(math.Ceil(end.Sub(now).Hours() / 24)),
	}
	rows, err := s.pool.Query(ctx, `select * from (`+rankedArenaWeek+`) r where r.rank <= $2 or r.user_id = $3 order by r.rank`,
		start.Format(dayLayout), limit, viewer)
	if err != nil {
		return out, err
	}
	var r ArenaRow
	if _, err := pgx.ForEachRow(rows, []any{&r.Rank, &r.UserID, &r.Name, &r.Character, &r.Points, &r.Wins, &r.Rating}, func() error {
		row := r
		row.IsYou = row.UserID == viewer
		if row.Rank <= limit {
			out.Rows = append(out.Rows, row)
		} else {
			out.You = &row
		}
		return nil
	}); err != nil {
		return out, err
	}
	rows, err = s.pool.Query(ctx, `
		select a.place, f.name, a.points, a.user_id = $2
		from arena_awards a join fighters f on f.user_id = a.user_id
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

// SettleArenaWeeks pays the top three of every recent Arena week that is over
// and not paid yet. Safe to call from every request: one settles at a time,
// and a week only once.
func (s *Store) SettleArenaWeeks(ctx context.Context, now time.Time) error {
	current, _ := WeekOf(now)
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext('shadowline.arena.settle'))`); err != nil {
			return err
		}
		for back := settleWeeksBack; back >= 1; back-- {
			week := current.AddDate(0, 0, -7*back).Format(dayLayout)
			var settled bool
			if err := tx.QueryRow(ctx, `select exists (select 1 from arena_settled where week = $1::date)`, week).Scan(&settled); err != nil {
				return err
			}
			if settled {
				continue
			}
			rows, err := tx.Query(ctx, `select r.rank, r.user_id, r.points from (`+rankedArenaWeek+`) r where r.rank <= 3 order by r.rank`, week)
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
				coins := ArenaWeekGold[w.place-1]
				if err := credit(ctx, tx, w.user, "arena_week", week, coins); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `
					insert into arena_awards (week, place, user_id, points, coins) values ($1::date, $2, $3, $4, $5)`,
					week, w.place, w.user, w.points, coins); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `insert into arena_settled (week) values ($1::date)`, week); err != nil {
				return err
			}
		}
		return nil
	})
}
