package store

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"math/rand"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/arena"
)

// Word duels against the tower. The server keeps the duel and decides every
// answer; the browser is sent the question without its answer, and what each
// answer did.

// Refusals a duel can give.
var (
	ErrFloorLocked = errors.New("that floor is not open yet")
	ErrNoEnergy    = errors.New("no energy left for a duel")
	ErrDuelOver    = errors.New("that duel is over")
	ErrDuelStale   = errors.New("that answer is for a turn already played")
)

// reviewWords is how many words of their own a learner needs before every
// question is about one of them; with fewer, every other question is.
const reviewWords = 8

// DuelView is a duel as the browser sees it: never the answer.
type DuelView struct {
	ID       int64          `json:"id"`
	Floor    int            `json:"floor"`
	Opponent arena.Opponent `json:"opponent"`
	State    string         `json:"state"`
	HP       int            `json:"hp"`
	HPMax    int            `json:"hpMax"`
	OppHP    int            `json:"oppHp"`
	OppMax   int            `json:"oppMax"`
	Rage     int            `json:"rage"`
	Combo    int            `json:"combo"`
	Turn     int            `json:"turn"`
	// Question is nil once the duel is over.
	Question *arena.Question `json:"question"`
	Block    bool            `json:"block"`
	// Seconds is the time the question gives; Deadline when it runs out.
	Seconds  int       `json:"seconds"`
	Deadline time.Time `json:"deadline"`
	Right    int       `json:"right"`
	Wrong    int       `json:"wrong"`
	// What a win paid.
	Coins      int      `json:"coins"`
	XP         int      `json:"xp"`
	Drop       string   `json:"drop"`
	LevelUp    bool     `json:"levelUp"`
	FirstClear bool     `json:"firstClear"`
	Words      []string `json:"words"`
}

// DuelTurn is what one answer did.
type DuelTurn struct {
	arena.Result
	Right  bool        `json:"right"`
	Late   bool        `json:"late"`
	Answer string      `json:"answer"`
	Entry  arena.Entry `json:"entry"`
}

type duelRow struct {
	id                      int64
	floor                   int
	state                   string
	hp, hpMax, atk, def     int
	answerTime, rageStat    int
	oppHP, oppMax           int
	rage, combo, turn       int
	question                arena.Question
	block                   bool
	issuedAt, deadline      time.Time
	asked, reviewed         []string
	right, wrong, coins, xp int
	drop                    string
	levelUp, firstClear     bool
}

const duelColumns = `id, floor, state, hp, hp_max, atk, def, answer_time, rage_stat, opp_hp, opp_max,
	rage, combo, turn, question, q_word, q_answer, q_block, issued_at, deadline, asked, reviewed,
	right_count, wrong_count, coins, xp, drop_item, level_up, first_clear`

func scanDuel(row pgx.Row) (duelRow, error) {
	var d duelRow
	var raw []byte
	err := row.Scan(&d.id, &d.floor, &d.state, &d.hp, &d.hpMax, &d.atk, &d.def, &d.answerTime, &d.rageStat,
		&d.oppHP, &d.oppMax, &d.rage, &d.combo, &d.turn, &raw, &d.question.Word, &d.question.Answer, &d.block,
		&d.issuedAt, &d.deadline, &d.asked, &d.reviewed, &d.right, &d.wrong, &d.coins, &d.xp, &d.drop,
		&d.levelUp, &d.firstClear)
	if err != nil {
		return d, err
	}
	word, answer := d.question.Word, d.question.Answer
	if err := json.Unmarshal(raw, &d.question); err != nil {
		return d, err
	}
	d.question.Word, d.question.Answer = word, answer
	return d, nil
}

func (d duelRow) view() DuelView {
	o, _ := arena.Floor(d.floor)
	v := DuelView{
		ID: d.id, Floor: d.floor, Opponent: o, State: d.state,
		HP: d.hp, HPMax: d.hpMax, OppHP: d.oppHP, OppMax: d.oppMax,
		Rage: d.rage, Combo: d.combo, Turn: d.turn, Block: d.block,
		Seconds: int(d.deadline.Sub(d.issuedAt).Round(time.Second) / time.Second), Deadline: d.deadline,
		Right: d.right, Wrong: d.wrong, Coins: d.coins, XP: d.xp, Drop: d.drop,
		LevelUp: d.levelUp, FirstClear: d.firstClear, Words: d.reviewed,
	}
	if v.Words == nil {
		v.Words = []string{}
	}
	if d.state == "active" {
		q := d.question
		v.Question = &q
	}
	return v
}

// fighterRow is a fighter locked for a duel.
type fighterRow struct {
	level, xp, floor int
	energy           int
	energyAt         time.Time
}

func lockFighter(ctx context.Context, tx pgx.Tx, user uuid.UUID) (fighterRow, error) {
	var f fighterRow
	err := tx.QueryRow(ctx, `
		select level, xp, floor, energy, energy_at from fighters where user_id = $1 for update`, user).
		Scan(&f.level, &f.xp, &f.floor, &f.energy, &f.energyAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return f, ErrNoFighter
	}
	return f, err
}

// fighterStats is a fighter's stats in the gear they wear now.
func fighterStats(ctx context.Context, tx pgx.Tx, user uuid.UUID, level int) (arena.Stats, error) {
	rows, err := tx.Query(ctx, `select item from fighter_equipped where user_id = $1`, user)
	if err != nil {
		return arena.Stats{}, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return arena.Stats{}, err
	}
	var worn []arena.Item
	for _, id := range ids {
		if it, ok := arena.ItemByID(id); ok {
			worn = append(worn, it)
		}
	}
	return arena.StatsOf(level, worn), nil
}

// addEnergy gives a fighter energy for practice, up to the most they can
// save. A learner with no fighter yet has none to give.
func addEnergy(ctx context.Context, tx pgx.Tx, user uuid.UUID, n int, now time.Time) error {
	if n <= 0 {
		return nil
	}
	f, err := lockFighter(ctx, tx, user)
	if errors.Is(err, ErrNoFighter) {
		return nil
	}
	if err != nil {
		return err
	}
	current, _ := arena.Energy(f.energy, f.energyAt, now)
	energy, at := arena.SetEnergy(f.energy, f.energyAt, now, current+n)
	_, err = tx.Exec(ctx, `update fighters set energy = $2, energy_at = $3 where user_id = $1`, user, energy, at)
	return err
}

// duelWord is the word for the next question: the learner's own, due ones
// first, not asked yet this duel; or, for a learner with few words yet, now
// and then a common one from the floor's band.
func duelWord(ctx context.Context, tx pgx.Tx, user uuid.UUID, o arena.Opponent, asked []string, turn int) (arena.Entry, bool, error) {
	if asked == nil {
		asked = []string{} // nil goes to Postgres as null, and "= any(null)" matches nothing
	}
	var mine int
	if err := tx.QueryRow(ctx, `
		select count(*)::int from vocab_words v left join glosses g on g.word = v.word
		where v.user_id = $1
		  and coalesce(nullif(g.ipa, ''), v.ipa) <> '' and coalesce(nullif(g.meaning, ''), v.meaning) <> ''`,
		user).Scan(&mine); err != nil {
		return arena.Entry{}, false, err
	}
	var e arena.Entry
	if mine > 0 && (mine >= reviewWords || turn%2 == 1) {
		err := tx.QueryRow(ctx, `
			select v.word, coalesce(nullif(g.ipa, ''), v.ipa), coalesce(nullif(g.meaning, ''), v.meaning)
			from vocab_words v left join glosses g on g.word = v.word
			where v.user_id = $1 and not (v.word = any($2))
			  and coalesce(nullif(g.ipa, ''), v.ipa) <> '' and coalesce(nullif(g.meaning, ''), v.meaning) <> ''
			order by v.due_at, v.created_at limit 1`, user, asked).Scan(&e.Word, &e.IPA, &e.Meaning)
		if err == nil {
			return e, true, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return e, false, err
		}
	}
	err := tx.QueryRow(ctx, `
		select g.word, g.ipa, g.meaning
		from word_ranks rk join glosses g on g.word = rk.word
		where rk.rank between $1 and $2 and g.ipa <> '' and g.meaning <> '' and not (g.word = any($3))
		order by random() limit 1`, o.RankLo, o.RankHi, asked).Scan(&e.Word, &e.IPA, &e.Meaning)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, false, nil
	}
	return e, err == nil, err
}

// duelWrongAnswers are words from the floor's band to choose among.
func duelWrongAnswers(ctx context.Context, tx pgx.Tx, o arena.Opponent, target string) ([]arena.Entry, error) {
	rows, err := tx.Query(ctx, `
		select g.word, g.ipa, g.meaning
		from word_ranks rk join glosses g on g.word = rk.word
		where rk.rank between $1 and $2 and g.ipa <> '' and g.meaning <> '' and g.word <> $3
		order by random() limit 16`, o.RankLo, max(o.RankHi, 2000), target)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (arena.Entry, error) {
		var e arena.Entry
		err := r.Scan(&e.Word, &e.IPA, &e.Meaning)
		return e, err
	})
}

// duelAsk makes the next question: one of the floor's kinds, or a quick
// listen for the opponent's big attack.
func duelAsk(ctx context.Context, tx pgx.Tx, user uuid.UUID, o arena.Opponent, asked []string, turn int, block bool, r *rand.Rand) (arena.Question, error) {
	kinds := o.Kinds
	if block {
		kinds = []string{arena.AskListen}
	}
	for try := 0; try < 6; try++ {
		target, ok, err := duelWord(ctx, tx, user, o, asked, turn)
		if err != nil {
			return arena.Question{}, err
		}
		if !ok {
			// Every word asked already: start the list again.
			asked = nil
			continue
		}
		pool, err := duelWrongAnswers(ctx, tx, o, target.Word)
		if err != nil {
			return arena.Question{}, err
		}
		for _, i := range r.Perm(len(kinds)) {
			if q, ok := arena.NewQuestion(kinds[i], target, pool, r); ok {
				return q, nil
			}
		}
		asked = append(asked, target.Word)
	}
	return arena.Question{}, errors.New("no word to ask about")
}

// duelReview moves a word's flashcard schedule for an answer, the way the
// flashcard screen would. Words not in the learner's vocabulary have none.
func duelReview(ctx context.Context, tx pgx.Tx, user uuid.UUID, word string, right bool, now time.Time) error {
	var id uuid.UUID
	var current int
	err := tx.QueryRow(ctx, `
		select id, interval_days from vocab_words where user_id = $1 and word = $2 for update`,
		user, word).Scan(&id, &current)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	status, next := "learning", Forgotten(now)
	if right {
		status, next = "known", Recalled(current, now)
	}
	_, err = tx.Exec(ctx, `
		update vocab_words set status = $2, reviewed_at = $3, interval_days = $4, due_at = $5
		where id = $1`, id, status, now, next.IntervalDays, next.DueAt)
	return err
}

func newDuelRand() *rand.Rand { return rand.New(rand.NewSource(time.Now().UnixNano())) }

func activeDuel(ctx context.Context, tx pgx.Tx, user uuid.UUID) (*duelRow, error) {
	d, err := scanDuel(tx.QueryRow(ctx, `
		select `+duelColumns+` from duels where user_id = $1 and state = 'active' for update`, user))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// setQuestion puts the next question on a duel, with its time.
func (d *duelRow) setQuestion(q arena.Question, o arena.Opponent, block bool, now time.Time) {
	d.question, d.block, d.issuedAt = q, block, now
	d.deadline = now.Add(time.Duration(arena.AnswerSeconds(d.answerTime, o, q.Kind, block)) * time.Second)
	d.asked = append(d.asked, q.Word)
}

func saveDuel(ctx context.Context, tx pgx.Tx, d *duelRow) error {
	raw, err := json.Marshal(d.question)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update duels set state = $2, hp = $3, opp_hp = $4, rage = $5, combo = $6, turn = $7,
		       question = $8, q_word = $9, q_answer = $10, q_block = $11, issued_at = $12, deadline = $13,
		       asked = $14, reviewed = $15, right_count = $16, wrong_count = $17, coins = $18, xp = $19,
		       drop_item = $20, level_up = $21, first_clear = $22,
		       ended_at = case when $2 = 'active' then null else now() end
		where id = $1`,
		d.id, d.state, d.hp, d.oppHP, d.rage, d.combo, d.turn, raw, d.question.Word, d.question.Answer,
		d.block, d.issuedAt, d.deadline, d.asked, d.reviewed, d.right, d.wrong, d.coins, d.xp, d.drop,
		d.levelUp, d.firstClear)
	return err
}

// StartDuel starts a duel on a floor, for a unit of energy, or answers the
// duel already under way.
func (s *Store) StartDuel(ctx context.Context, user uuid.UUID, floor int, now time.Time) (DuelView, error) {
	o, ok := arena.Floor(floor)
	if !ok {
		return DuelView{}, ErrNotFound
	}
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
		if floor > f.floor {
			return ErrFloorLocked
		}
		energy, _ := arena.Energy(f.energy, f.energyAt, now)
		if energy < 1 {
			return ErrNoEnergy
		}
		energy, at := arena.SetEnergy(f.energy, f.energyAt, now, energy-1)
		if _, err := tx.Exec(ctx, `update fighters set energy = $2, energy_at = $3 where user_id = $1`, user, energy, at); err != nil {
			return err
		}
		stats, err := fighterStats(ctx, tx, user, f.level)
		if err != nil {
			return err
		}
		d := duelRow{
			floor: floor, state: "active", hp: stats.HP, hpMax: stats.HP, atk: stats.Atk, def: stats.Def,
			answerTime: stats.Time, rageStat: stats.Rage, oppHP: o.HP, oppMax: o.HP, turn: 1,
		}
		q, err := duelAsk(ctx, tx, user, o, nil, 1, false, newDuelRand())
		if err != nil {
			return err
		}
		d.setQuestion(q, o, false, now)
		raw, err := json.Marshal(d.question)
		if err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			insert into duels (user_id, floor, hp, hp_max, atk, def, answer_time, rage_stat, opp_hp, opp_max,
			                   question, q_word, q_answer, issued_at, deadline, asked)
			values ($1, $2, $3, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14) returning id`,
			user, floor, d.hp, d.atk, d.def, d.answerTime, d.rageStat, d.oppHP, raw, q.Word, q.Answer,
			d.issuedAt, d.deadline, d.asked).Scan(&d.id); err != nil {
			return err
		}
		view = d.view()
		return nil
	})
	return view, err
}

// ActiveDuel is the duel under way, or nil.
func (s *Store) ActiveDuel(ctx context.Context, user uuid.UUID) (*DuelView, error) {
	d, err := scanDuel(s.pool.QueryRow(ctx, `
		select `+duelColumns+` from duels where user_id = $1 and state = 'active'`, user))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	v := d.view()
	return &v, nil
}

// AnswerDuel plays one answer: right and in time hits the opponent, wrong or
// late and they hit back. turn is the turn the answer is for: a second answer
// to the same turn is refused, so a double tap is played once.
func (s *Store) AnswerDuel(ctx context.Context, user uuid.UUID, id int64, turn int, answer string, special bool, now time.Time) (DuelTurn, DuelView, error) {
	var out DuelTurn
	var view DuelView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		f, err := lockFighter(ctx, tx, user)
		if err != nil {
			return err
		}
		d, err := activeDuel(ctx, tx, user)
		if err != nil {
			return err
		}
		if d == nil || d.id != id {
			return ErrDuelOver
		}
		if turn != d.turn {
			return ErrDuelStale
		}
		o, _ := arena.Floor(d.floor)
		q := d.question

		out.Late = now.After(d.deadline.Add(arena.Grace))
		out.Right = !out.Late && q.Right(answer)
		out.Answer = q.Answer
		out.Entry = arena.Entry{Word: q.Word}
		_ = tx.QueryRow(ctx, `
			select coalesce(nullif(g.ipa, ''), v.ipa, ''), coalesce(nullif(g.meaning, ''), v.meaning, '')
			from (select $2::text as word) w
			left join glosses g on g.word = w.word
			left join vocab_words v on v.user_id = $1 and v.word = w.word`, user, q.Word).
			Scan(&out.Entry.IPA, &out.Entry.Meaning)

		out.Result = arena.Resolve(arena.Fight{
			Atk: d.atk, Def: d.def, RageStat: d.rageStat, OppAtk: o.Atk, OppDef: o.Def,
			Rage: d.rage, Combo: d.combo, Block: d.block, Special: special,
			Elapsed: now.Sub(d.issuedAt), Allowed: d.deadline.Sub(d.issuedAt),
			Right: out.Right, HP: d.hp, OppHP: d.oppHP,
		})
		d.hp, d.oppHP, d.rage, d.combo = out.HP, out.OppHP, out.Rage, out.Combo
		if out.Right {
			d.right++
		} else {
			d.wrong++
		}
		if !slices.Contains(d.reviewed, q.Word) {
			if err := duelReview(ctx, tx, user, q.Word, out.Right, now); err != nil {
				return err
			}
			d.reviewed = append(d.reviewed, q.Word)
		}

		switch {
		case d.oppHP <= 0:
			if err := s.win(ctx, tx, user, d, f, o); err != nil {
				return err
			}
		case d.hp <= 0:
			// Knocked out: the energy is already spent; nothing else is taken.
			d.state = "lost"
		default:
			d.turn++
			block := arena.IsTelegraph(d.turn, o)
			next, err := duelAsk(ctx, tx, user, o, d.asked, d.turn, block, newDuelRand())
			if err != nil {
				return err
			}
			d.setQuestion(next, o, block, now)
		}
		if err := saveDuel(ctx, tx, d); err != nil {
			return err
		}
		view = d.view()
		return nil
	})
	return out, view, err
}

// win pays for a duel won: the floor's coins, twice over the first time it
// falls, when the next floor opens; experience, and a chance of gear.
func (s *Store) win(ctx context.Context, tx pgx.Tx, user uuid.UUID, d *duelRow, f fighterRow, o arena.Opponent) error {
	d.state = "won"
	d.coins, d.xp = o.Coins, o.XP
	tag, err := tx.Exec(ctx, `insert into duel_clears (user_id, floor) values ($1, $2) on conflict do nothing`, user, d.floor)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		d.firstClear = true
		d.coins *= 2
		f.floor = max(f.floor, min(d.floor+1, len(arena.Tower)))
	}
	if err := credit(ctx, tx, user, "duel", o.ID, d.coins); err != nil {
		return err
	}
	level, xp := arena.AddXP(f.level, f.xp, d.xp)
	d.levelUp = level > f.level
	if _, err := tx.Exec(ctx, `update fighters set level = $2, xp = $3, floor = $4 where user_id = $1`,
		user, level, xp, f.floor); err != nil {
		return err
	}
	if o.Drop != "" && newDuelRand().Intn(100) < o.DropChance {
		tag, err := tx.Exec(ctx, `insert into fighter_gear (user_id, item) values ($1, $2) on conflict do nothing`, user, o.Drop)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 1 {
			d.drop = o.Drop
		}
	}
	return nil
}

// FleeDuel gives up the duel under way.
func (s *Store) FleeDuel(ctx context.Context, user uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		update duels set state = 'fled', ended_at = now() where user_id = $1 and state = 'active'`, user)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrDuelOver
	}
	return err
}

// TowerFloor is one floor as a learner sees it.
type TowerFloor struct {
	arena.Opponent
	Locked  bool `json:"locked"`
	Cleared bool `json:"cleared"`
}

// TowerView is the tower, a fighter's energy, and the duel under way.
type TowerView struct {
	Floors     []TowerFloor `json:"floors"`
	Energy     int          `json:"energy"`
	EnergyMax  int          `json:"energyMax"`
	NextEnergy *time.Time   `json:"nextEnergy"`
	// NextEnergyIn is the minutes until then, rounded up; 0 when full.
	NextEnergyIn int    `json:"nextEnergyIn"`
	Level        int    `json:"level"`
	XP           int    `json:"xp"`
	XPNext       int    `json:"xpNext"`
	ActiveDuel   *int64 `json:"activeDuel"`
}

// TowerOf is the tower as a learner stands in it.
func (s *Store) TowerOf(ctx context.Context, user uuid.UUID, now time.Time) (TowerView, error) {
	out := TowerView{EnergyMax: arena.EnergyMax, Floors: []TowerFloor{}}
	var f fighterRow
	err := s.pool.QueryRow(ctx, `select level, xp, floor, energy, energy_at from fighters where user_id = $1`, user).
		Scan(&f.level, &f.xp, &f.floor, &f.energy, &f.energyAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrNoFighter
	}
	if err != nil {
		return out, err
	}
	energy, next := arena.Energy(f.energy, f.energyAt, now)
	out.Energy, out.Level, out.XP, out.XPNext = energy, f.level, f.xp, arena.XPForNext(f.level)
	if !next.IsZero() {
		out.NextEnergy = &next
		out.NextEnergyIn = max(1, int(math.Ceil(next.Sub(now).Minutes())))
	}
	rows, err := s.pool.Query(ctx, `select floor from duel_clears where user_id = $1`, user)
	if err != nil {
		return out, err
	}
	cleared, err := pgx.CollectRows(rows, pgx.RowTo[int])
	if err != nil {
		return out, err
	}
	for _, o := range arena.Tower {
		out.Floors = append(out.Floors, TowerFloor{Opponent: o, Locked: o.Floor > f.floor, Cleared: slices.Contains(cleared, o.Floor)})
	}
	var active int64
	if err := s.pool.QueryRow(ctx, `select id from duels where user_id = $1 and state = 'active'`, user).Scan(&active); err == nil {
		out.ActiveDuel = &active
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}
	return out, nil
}

// DuelAnswerKey is the answer to the question a learner is being asked. For
// the end-to-end tests only.
func (s *Store) DuelAnswerKey(ctx context.Context, user uuid.UUID) (string, error) {
	var answer string
	err := s.pool.QueryRow(ctx, `select q_answer from duels where user_id = $1 and state = 'active'`, user).Scan(&answer)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return answer, err
}

// SetFighterEnergy sets a fighter's energy outright. For the tests only.
func (s *Store) SetFighterEnergy(ctx context.Context, user uuid.UUID, energy int, now time.Time) error {
	_, err := s.pool.Exec(ctx, `update fighters set energy = $2, energy_at = $3 where user_id = $1`, user, energy, now)
	return err
}
