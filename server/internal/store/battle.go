package store

import (
	"context"
	"encoding/json"
	"errors"
	"math/rand"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// Fights in the woods.
//
// A fight is turns of single-word questions. The server asks, keeps the answer
// to itself, and decides each turn: whether the answer was right and in time,
// who loses health, how the fight ends. The words are the learner's own,
// those due for review first, so a fight is flashcard practice and moves each
// word's schedule the way a flashcard would.

// BattleView is a fight as the browser draws it: never the answer.
type BattleView struct {
	ID           int64         `json:"id"`
	Spawn        string        `json:"spawn"`
	Monster      game.Monster  `json:"monster"`
	MonsterHP    int           `json:"monsterHp"`
	HP           int           `json:"hp"`
	HPMax        int           `json:"hpMax"`
	Round        int           `json:"round"`
	State        string        `json:"state"`
	Question     game.Question `json:"question"`
	IssuedAt     time.Time     `json:"issuedAt"`
	Deadline     time.Time     `json:"deadline"`
	Right        int           `json:"right"`
	Wrong        int           `json:"wrong"`
	HitsTaken    int           `json:"hitsTaken"`
	Gold         int           `json:"gold"`
	Drop         string        `json:"drop"`
	Fine         int           `json:"fine"`
	Words        []string      `json:"words"`
	ServerNow    time.Time     `json:"now"`
	MonsterHPMax int           `json:"monsterHpMax"`
	// Phase of the fight, from 1, of Phases: a boss changes as it tires.
	Phase  int `json:"phase"`
	Phases int `json:"phases"`
}

// Turn is what one answer did.
type Turn struct {
	Right bool `json:"right"`
	// Late: the answer came after the time was up, and counts as wrong.
	Late bool `json:"late"`
	// The word asked about, with what the dictionary says, and the answer that
	// was right — shown to the learner after every turn, right or wrong.
	Entry  game.Entry `json:"entry"`
	Answer string     `json:"answer"`
	// Strike is what the player did to the monster; Hit what it did back.
	Strike int `json:"strike"`
	Hit    int `json:"hit"`
}

type battleRow struct {
	id        int64
	spawn     string
	monster   string
	monsterHP int
	round     int
	hitsTaken int
	right     int
	wrong     int
	question  game.Question
	issuedAt  time.Time
	deadline  time.Time
	asked     []string
	reviewed  []string
	state     string
	gold      int
	drop      string
	fine      int
}

const battleColumns = `id, spawn, monster, monster_hp, round, hits_taken, right_count, wrong_count,
	question, q_word, q_answer, issued_at, deadline, asked, reviewed, state, gold, drop_item, fine`

func scanBattle(row pgx.Row) (battleRow, error) {
	var b battleRow
	var q []byte
	err := row.Scan(&b.id, &b.spawn, &b.monster, &b.monsterHP, &b.round, &b.hitsTaken, &b.right, &b.wrong,
		&q, &b.question.Word, &b.question.Answer, &b.issuedAt, &b.deadline, &b.asked, &b.reviewed,
		&b.state, &b.gold, &b.drop, &b.fine)
	if err != nil {
		return b, err
	}
	word, answer := b.question.Word, b.question.Answer
	if err := json.Unmarshal(q, &b.question); err != nil {
		return b, err
	}
	b.question.Word, b.question.Answer = word, answer
	return b, nil
}

func (b battleRow) view(p profileRow, now time.Time) BattleView {
	m, _ := game.MonsterByID(b.monster)
	hp, _ := game.HP(p.hp, p.hpAt, now)
	v := BattleView{
		ID: b.id, Spawn: b.spawn, Monster: m, MonsterHP: max(0, b.monsterHP), MonsterHPMax: m.HP,
		HP: hp, HPMax: game.HPMax, Round: b.round, State: b.state,
		IssuedAt: b.issuedAt, Deadline: b.deadline, Right: b.right, Wrong: b.wrong,
		HitsTaken: b.hitsTaken, Gold: b.gold, Drop: b.drop, Fine: b.fine,
		Words: b.asked, ServerNow: now,
		Phases: max(1, len(m.Phases)),
	}
	phase, _ := game.PhaseOf(m, b.monsterHP)
	v.Phase = phase + 1
	if v.Words == nil {
		v.Words = []string{}
	}
	if b.state == "active" {
		v.Question = b.question
	} else {
		v.Question = game.Question{Options: []string{}}
	}
	if v.Question.Options == nil {
		v.Question.Options = []string{}
	}
	return v
}

// respawns is when each beaten monster comes back, for those not back yet.
// Each monster stays away its own time: minutes for most, a day for the troll.
func respawns(ctx context.Context, tx pgx.Tx, user uuid.UUID, now time.Time) (map[string]time.Time, error) {
	longest := game.RespawnDefault
	for _, m := range game.Monsters {
		longest = max(longest, game.RespawnOf(m))
	}
	rows, err := tx.Query(ctx, `
		select spawn, defeated_at from game_spawns
		where user_id = $1 and defeated_at > $2`, user, now.Add(-longest))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]time.Time{}
	for rows.Next() {
		var spawn string
		var at time.Time
		if err := rows.Scan(&spawn, &at); err != nil {
			return nil, err
		}
		sp, ok := game.SpawnByID(spawn)
		if !ok {
			continue
		}
		m, _ := game.MonsterByID(sp.Monster)
		if back := at.Add(game.RespawnOf(m)); back.After(now) {
			out[spawn] = back
		}
	}
	return out, rows.Err()
}

func activeBattle(ctx context.Context, tx pgx.Tx, user uuid.UUID) (*battleRow, error) {
	b, err := scanBattle(tx.QueryRow(ctx, `
		select `+battleColumns+` from game_battles
		where user_id = $1 and state = 'active' for update`, user))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// nextWord is the word for the next question: the learner's own, due ones
// first, not asked yet this fight; or, for a learner with few words yet, now
// and then a common one from the monster's band.
func nextWord(ctx context.Context, tx pgx.Tx, user uuid.UUID, m game.Monster, asked []string, round int, r *rand.Rand) (game.Entry, bool, error) {
	if asked == nil {
		asked = []string{} // nil goes to Postgres as null, and "= any(null)" matches nothing
	}
	var mine int
	if err := tx.QueryRow(ctx, `
		select count(*)::int from vocab_words v left join glosses g on g.word = v.word
		where v.user_id = $1
		  and coalesce(nullif(g.ipa, ''), v.ipa) <> '' and coalesce(nullif(g.meaning, ''), v.meaning) <> ''`,
		user).Scan(&mine); err != nil {
		return game.Entry{}, false, err
	}
	fromMine := mine > 0 && (mine >= game.ReviewWords || round%2 == 1)
	var e game.Entry
	var err error
	if fromMine {
		err = tx.QueryRow(ctx, `
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
	err = tx.QueryRow(ctx, `
		select g.word, g.ipa, g.meaning
		from word_ranks rk join glosses g on g.word = rk.word
		where rk.rank between $1 and $2 and g.ipa <> '' and g.meaning <> '' and not (g.word = any($3))
		order by random() limit 1`, m.RankLo, m.RankHi, asked).Scan(&e.Word, &e.IPA, &e.Meaning)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, false, nil
	}
	return e, err == nil, err
}

// wrongAnswers are words from the monster's band to choose among.
func wrongAnswers(ctx context.Context, tx pgx.Tx, m game.Monster, target string) ([]game.Entry, error) {
	rows, err := tx.Query(ctx, `
		select g.word, g.ipa, g.meaning
		from word_ranks rk join glosses g on g.word = rk.word
		where rk.rank between $1 and $2 and g.ipa <> '' and g.meaning <> '' and g.word <> $3
		order by random() limit 16`, m.RankLo, max(m.RankHi, 2000), target)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []game.Entry
	for rows.Next() {
		var e game.Entry
		if err := rows.Scan(&e.Word, &e.IPA, &e.Meaning); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ask makes the next question: a word, and one of the monster's kinds of
// question that the word and the wrong answers can make.
func ask(ctx context.Context, tx pgx.Tx, user uuid.UUID, m game.Monster, phase game.Phase, asked []string, round int, r *rand.Rand) (game.Question, error) {
	for try := 0; try < 6; try++ {
		target, ok, err := nextWord(ctx, tx, user, m, asked, round, r)
		if err != nil {
			return game.Question{}, err
		}
		if !ok {
			// Every word asked already: start the list again.
			asked = nil
			continue
		}
		pool, err := wrongAnswers(ctx, tx, m, target.Word)
		if err != nil {
			return game.Question{}, err
		}
		for _, i := range r.Perm(len(phase.Games)) {
			if q, ok := game.NewQuestion(phase.Games[i], target, pool, r); ok {
				return q, nil
			}
		}
		asked = append(asked, target.Word)
	}
	return game.Question{}, errors.New("no word to ask about")
}

func newRand() *rand.Rand { return rand.New(rand.NewSource(time.Now().UnixNano())) }

// StartBattle starts a fight with the monster at a spawn: stamina for the
// fight, and the first question.
func (s *Store) StartBattle(ctx context.Context, user uuid.UUID, spawn string) (BattleView, GameState, error) {
	var view BattleView
	var state GameState
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		if !p.woodsOpen() {
			return refuse("woods_locked", "the woods are not open yet")
		}
		sp, ok := game.SpawnByID(spawn)
		if !ok {
			return badMove("no_spawn", "there is nothing there")
		}
		if !p.reached(sp.Step) {
			return refuse("lair_closed", "nothing lives there yet")
		}
		m, _ := game.MonsterByID(sp.Monster)
		if b, err := activeBattle(ctx, tx, user); err != nil {
			return err
		} else if b != nil {
			return refuse("in_battle", "a fight is already on")
		}
		back, err := respawns(ctx, tx, user, now)
		if err != nil {
			return err
		}
		if _, gone := back[spawn]; gone {
			return refuse("respawning", "that monster is not back yet")
		}
		if hp, _ := game.HP(p.hp, p.hpAt, now); hp < game.MinHPToFight {
			return refuse("no_hp", "too hurt to fight")
		}
		if err := spendStamina(&p, now, game.FightCost); err != nil {
			return err
		}
		_, phase := game.PhaseOf(m, m.HP)
		q, err := ask(ctx, tx, user, m, phase, nil, 1, newRand())
		if err != nil {
			return err
		}
		qJSON, _ := json.Marshal(q)
		b, err := scanBattle(tx.QueryRow(ctx, `
			insert into game_battles (user_id, spawn, monster, monster_hp, question, q_word, q_answer,
			                          issued_at, deadline, asked)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, array[$6])
			returning `+battleColumns,
			user, spawn, m.ID, m.HP, qJSON, q.Word, q.Answer, now, now.Add(game.TimeFor(phase, q.Kind))))
		if err != nil {
			return err
		}
		if err := logEvent(ctx, tx, user, "fight", m.ID, 0); err != nil {
			return err
		}
		if err := saveProfile(ctx, tx, user, p); err != nil {
			return err
		}
		view = b.view(p, now)
		state, err = readState(ctx, tx, user, p, now)
		return err
	})
	return view, state, err
}

// review moves a word's flashcard schedule for an answer in a fight, the way
// the flashcard screen would: right is "got it", wrong is "still learning".
// Words that are not in the learner's vocabulary have no schedule to move.
func review(ctx context.Context, tx pgx.Tx, user uuid.UUID, word string, right bool, now time.Time) error {
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

// FarmDoor is where a player wakes up after fainting: in front of the house,
// in map pixels (the house door's tile, as app/src/game/world/farm.ts lays it out).
var FarmDoor = struct{ X, Y int }{X: 5*16 + 8, Y: 8 * 16}

// AnswerBattle takes one answer: right and in time strikes the monster, wrong
// or late and it strikes back. The fight ends when either runs out of health.
func (s *Store) AnswerBattle(ctx context.Context, user uuid.UUID, id int64, answer string) (Turn, BattleView, GameState, error) {
	var turn Turn
	var view BattleView
	var state GameState
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		b, err := activeBattle(ctx, tx, user)
		if err != nil {
			return err
		}
		if b == nil || b.id != id {
			return refuse("battle_over", "that fight is over")
		}
		m, _ := game.MonsterByID(b.monster)
		q := b.question

		turn.Late = now.After(b.deadline.Add(game.Grace))
		turn.Right = !turn.Late && q.Right(answer)
		turn.Answer = q.Answer
		turn.Entry = game.Entry{Word: q.Word}
		_ = tx.QueryRow(ctx, `
			select coalesce(nullif(g.ipa, ''), v.ipa, ''), coalesce(nullif(g.meaning, ''), v.meaning, '')
			from (select $2::text as word) w
			left join glosses g on g.word = w.word
			left join vocab_words v on v.user_id = $1 and v.word = w.word`, user, q.Word).
			Scan(&turn.Entry.IPA, &turn.Entry.Meaning)

		hp, _ := game.HP(p.hp, p.hpAt, now)
		if turn.Right {
			turn.Strike = game.Strike(now.Sub(b.issuedAt), b.deadline.Sub(b.issuedAt))
			b.monsterHP -= turn.Strike
			b.right++
			err = logEvent(ctx, tx, user, "answer_right", q.Word, 0)
		} else {
			turn.Hit = m.Hit
			hp = max(0, hp-m.Hit)
			p.hp, p.hpAt = game.SetHP(p.hp, p.hpAt, now, hp)
			b.hitsTaken++
			b.wrong++
			err = logEvent(ctx, tx, user, "answer_wrong", q.Word, 0)
		}
		if err != nil {
			return err
		}
		if !slices.Contains(b.reviewed, q.Word) {
			if err := review(ctx, tx, user, q.Word, turn.Right, now); err != nil {
				return err
			}
			b.reviewed = append(b.reviewed, q.Word)
		}

		switch {
		case b.monsterHP <= 0:
			b.state = "won"
			b.gold = m.Gold
			if b.hitsTaken == 0 {
				b.gold += m.CleanBonus
			}
			r := newRand()
			if m.Drop != "" && r.Intn(100) < m.DropChance {
				b.drop = m.Drop
				if err := addItem(ctx, tx, user, m.Drop, 1); err != nil {
					return err
				}
			}
			p.gold += b.gold
			if _, err := tx.Exec(ctx, `
				insert into game_spawns (user_id, spawn, defeated_at) values ($1, $2, $3)
				on conflict (user_id, spawn) do update set defeated_at = excluded.defeated_at`,
				user, b.spawn, now); err != nil {
				return err
			}
			if err := logEvent(ctx, tx, user, "win", m.ID, b.gold); err != nil {
				return err
			}
			if b.hitsTaken == 0 {
				if err := logEvent(ctx, tx, user, "win_clean", m.ID, 0); err != nil {
					return err
				}
			}
		case hp <= 0:
			// Fainted: home, rested a little, a little poorer.
			b.state = "lost"
			b.fine = game.FaintFine(p.gold)
			p.gold -= b.fine
			p.hp, p.hpAt = game.FaintHP, now
			p.mapName, p.x, p.y = "farm", FarmDoor.X, FarmDoor.Y
			if err := logEvent(ctx, tx, user, "faint", m.ID, -b.fine); err != nil {
				return err
			}
		default:
			b.round++
			_, phase := game.PhaseOf(m, b.monsterHP)
			next, err := ask(ctx, tx, user, m, phase, b.asked, b.round, newRand())
			if err != nil {
				return err
			}
			b.question = next
			b.issuedAt = now
			b.deadline = now.Add(game.TimeFor(phase, next.Kind))
			if !slices.Contains(b.asked, next.Word) {
				b.asked = append(b.asked, next.Word)
			}
		}

		qJSON, _ := json.Marshal(b.question)
		var ended *time.Time
		if b.state != "active" {
			ended = &now
		}
		if _, err := tx.Exec(ctx, `
			update game_battles set monster_hp = $2, round = $3, hits_taken = $4, right_count = $5,
			       wrong_count = $6, question = $7, q_word = $8, q_answer = $9, issued_at = $10,
			       deadline = $11, asked = $12, reviewed = $13, state = $14, gold = $15,
			       drop_item = $16, fine = $17, ended_at = $18
			where id = $1`,
			b.id, b.monsterHP, b.round, b.hitsTaken, b.right, b.wrong, qJSON, b.question.Word,
			b.question.Answer, b.issuedAt, b.deadline, b.asked, b.reviewed, b.state, b.gold,
			b.drop, b.fine, ended); err != nil {
			return err
		}
		if err := saveProfile(ctx, tx, user, p); err != nil {
			return err
		}
		view = b.view(p, now)
		state, err = readState(ctx, tx, user, p, now)
		return err
	})
	return turn, view, state, err
}

// FleeBattle walks away from a fight: no reward, nothing more lost.
func (s *Store) FleeBattle(ctx context.Context, user uuid.UUID, id int64) (BattleView, GameState, error) {
	var view BattleView
	var state GameState
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		b, err := activeBattle(ctx, tx, user)
		if err != nil {
			return err
		}
		if b == nil || b.id != id {
			return refuse("battle_over", "that fight is over")
		}
		if _, err := tx.Exec(ctx, `
			update game_battles set state = 'fled', ended_at = $2 where id = $1`, b.id, now); err != nil {
			return err
		}
		b.state = "fled"
		if err := logEvent(ctx, tx, user, "flee", b.monster, 0); err != nil {
			return err
		}
		view = b.view(p, now)
		state, err = readState(ctx, tx, user, p, now)
		return err
	})
	return view, state, err
}

// ActiveBattle is the fight in progress, if there is one: a page reloaded
// mid-fight picks it up again.
func (s *Store) ActiveBattle(ctx context.Context, user uuid.UUID) (*BattleView, error) {
	var out *BattleView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		b, err := activeBattle(ctx, tx, user)
		if err != nil || b == nil {
			return err
		}
		v := b.view(p, now)
		out = &v
		return nil
	})
	return out, err
}

// BattleAnswerKey is the answer to the question in play. For the browser
// tests, through a route that exists only when AUTH_FAKE=1.
func (s *Store) BattleAnswerKey(ctx context.Context, user uuid.UUID) (string, error) {
	var answer string
	err := s.pool.QueryRow(ctx, `
		select q_answer from game_battles where user_id = $1 and state = 'active'`, user).Scan(&answer)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return answer, err
}

// RespawnAll brings every beaten monster back, and SetMainStep moves a
// player's story to a step. Both for the browser tests, AUTH_FAKE=1 only.
func (s *Store) RespawnAll(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `delete from game_spawns`)
	return err
}

// SetGold sets a player's gold, for a browser test that needs to buy things.
func (s *Store) SetGold(ctx context.Context, user uuid.UUID, gold int) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if err := ensureGame(ctx, tx, user); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `update game_profiles set gold = $2 where user_id = $1`, user, gold)
		return err
	})
}

func (s *Store) SetMainStep(ctx context.Context, user uuid.UUID, step int) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if err := ensureGame(ctx, tx, user); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			update game_profiles set main_step = $2, main_step_at = now() where user_id = $1`, user, step)
		return err
	})
}
