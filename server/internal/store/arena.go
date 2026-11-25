package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/shadowline/server/internal/arena"
)

// The Arena: a learner's fighter, the characters they own and the one they
// play, and the roster to buy more from.

// Refusals the Arena can give.
var (
	ErrNoFighter    = errors.New("no fighter yet")
	ErrFighterTaken = errors.New("a fighter is already made")
	ErrOwned        = errors.New("already owned")
	ErrNotOwned     = errors.New("not owned")
	ErrNotStarter   = errors.New("a fighter starts as one of the free characters")
)

// Fighter is a learner's fighter.
type Fighter struct {
	Name      string `json:"name"`
	Character string `json:"character"`
	Level     int    `json:"level"`
	XP        int    `json:"xp"`
}

// RosterEntry is a character as the roster shows it to one learner.
type RosterEntry struct {
	arena.Character
	Owned bool `json:"owned"`
	// Bonus is what playing them adds to the fighter's own stats.
	Bonus arena.Stats `json:"bonus"`
}

// ArenaState is everything the Arena screen shows.
type ArenaState struct {
	Coins int `json:"coins"`
	// CoinsPerDay is what the learner earns a day lately, to say how far a
	// character is.
	CoinsPerDay int           `json:"coinsPerDay"`
	Fighter     *Fighter      `json:"fighter"`
	Stats       arena.Stats   `json:"stats"`
	Owned       []string      `json:"owned"`
	Roster      []RosterEntry `json:"roster"`
}

// ArenaOf is a learner's Arena.
func (s *Store) ArenaOf(ctx context.Context, user uuid.UUID) (ArenaState, error) {
	out := ArenaState{Owned: []string{}, Roster: []RosterEntry{}}
	var err error
	if out.Coins, err = s.Coins(ctx, user); err != nil {
		return out, err
	}
	if out.CoinsPerDay, err = s.CoinsPerDay(ctx, user, time.Now()); err != nil {
		return out, err
	}
	var f Fighter
	err = s.pool.QueryRow(ctx, `select name, character, level, xp from fighters where user_id = $1`, user).
		Scan(&f.Name, &f.Character, &f.Level, &f.XP)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return out, err
	default:
		out.Fighter = &f
	}

	rows, err := s.pool.Query(ctx, `select character from fighter_characters where user_id = $1 order by owned_at, character`, user)
	if err != nil {
		return out, err
	}
	if out.Owned, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
		return out, err
	}
	owned := map[string]bool{}
	for _, id := range out.Owned {
		owned[id] = true
	}
	level, playing := 1, characterOf("")
	if out.Fighter != nil {
		level, playing = out.Fighter.Level, characterOf(out.Fighter.Character)
	}
	out.Stats = arena.StatsOf(level, playing)
	for _, c := range arena.Characters {
		out.Roster = append(out.Roster, RosterEntry{Character: c, Owned: owned[c.ID] || c.Starter(), Bonus: c.Bonus()})
	}
	return out, nil
}

// characterOf is a character by id, or the beggar for one that is gone.
func characterOf(id string) arena.Character {
	if c, ok := arena.CharacterByID(id); ok {
		return c
	}
	c, _ := arena.CharacterByID("beggar")
	return c
}

// CreateFighter makes a learner's fighter, playing one of the free
// characters; they own both.
func (s *Store) CreateFighter(ctx context.Context, user uuid.UUID, name, character string) error {
	name, err := arena.CleanName(name)
	if err != nil {
		return err
	}
	if c, ok := arena.CharacterByID(character); !ok || !c.Starter() {
		return ErrNotStarter
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			insert into fighters (user_id, name, character) values ($1, $2, $3)`,
			user, name, character); err != nil {
			var pg *pgconn.PgError
			if errors.As(err, &pg) && pg.Code == "23505" {
				return ErrFighterTaken
			}
			return err
		}
		for _, c := range arena.Starters() {
			if _, err := tx.Exec(ctx, `
				insert into fighter_characters (user_id, character) values ($1, $2) on conflict do nothing`, user, c.ID); err != nil {
				return err
			}
		}
		return nil
	})
}

// RenameFighter changes a fighter's name. It costs nothing.
func (s *Store) RenameFighter(ctx context.Context, user uuid.UUID, name string) error {
	name, err := arena.CleanName(name)
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `update fighters set name = $2 where user_id = $1`, user, name)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNoFighter
	}
	return err
}

func hasFighter(ctx context.Context, tx pgx.Tx, user uuid.UUID) error {
	var ok bool
	if err := tx.QueryRow(ctx, `select exists (select 1 from fighters where user_id = $1)`, user).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return ErrNoFighter
	}
	return nil
}

// BuyCharacter pays for a character out of the learner's coins; they keep it.
// ErrNotFound for a character there is not, ErrOwned, ErrNoFighter or
// ErrNotEnoughCoins when it cannot be bought.
func (s *Store) BuyCharacter(ctx context.Context, user uuid.UUID, id string) error {
	c, ok := arena.CharacterByID(id)
	if !ok {
		return ErrNotFound
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		// One purchase at a time for a learner: two taps on Buy are one buy.
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext('shadowline.arena.' || $1::text))`, user); err != nil {
			return err
		}
		if err := hasFighter(ctx, tx, user); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `insert into fighter_characters (user_id, character) values ($1, $2) on conflict do nothing`, user, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrOwned
		}
		return debit(ctx, tx, user, "buy", id, c.Price)
	})
}

// SelectCharacter plays a character the learner owns from the next duel on.
func (s *Store) SelectCharacter(ctx context.Context, user uuid.UUID, id string) error {
	if _, ok := arena.CharacterByID(id); !ok {
		return ErrNotFound
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if err := hasFighter(ctx, tx, user); err != nil {
			return err
		}
		var owned bool
		if err := tx.QueryRow(ctx, `
			select exists (select 1 from fighter_characters where user_id = $1 and character = $2)`, user, id).Scan(&owned); err != nil {
			return err
		}
		if !owned {
			return ErrNotOwned
		}
		_, err := tx.Exec(ctx, `update fighters set character = $2 where user_id = $1`, user, id)
		return err
	})
}
