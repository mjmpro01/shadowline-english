package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/shadowline/server/internal/arena"
)

// The Arena: a learner's fighter, the gear they own and wear, and the shop.

// Refusals the Arena can give.
var (
	ErrNoFighter    = errors.New("no fighter yet")
	ErrFighterTaken = errors.New("a fighter is already made")
	ErrOwned        = errors.New("already owned")
	ErrNotOwned     = errors.New("not owned")
	ErrBareBody     = errors.New("a fighter always wears something")
)

// Fighter is a learner's fighter.
type Fighter struct {
	arena.Look
	Level int `json:"level"`
	XP    int `json:"xp"`
}

// ShopItem is a piece of gear as the shop shows it to one learner.
type ShopItem struct {
	arena.Item
	Owned bool `json:"owned"`
}

// ArenaState is everything the Arena screen shows.
type ArenaState struct {
	Coins    int               `json:"coins"`
	Fighter  *Fighter          `json:"fighter"`
	Stats    arena.Stats       `json:"stats"`
	Equipped map[string]string `json:"equipped"`
	Owned    []string          `json:"owned"`
	Shop     []ShopItem        `json:"shop"`
}

// ArenaOf is a learner's Arena.
func (s *Store) ArenaOf(ctx context.Context, user uuid.UUID) (ArenaState, error) {
	out := ArenaState{Equipped: map[string]string{}, Owned: []string{}, Shop: []ShopItem{}}
	var err error
	if out.Coins, err = s.Coins(ctx, user); err != nil {
		return out, err
	}
	var f Fighter
	err = s.pool.QueryRow(ctx, `select name, body, skin, hair, level, xp from fighters where user_id = $1`, user).
		Scan(&f.Name, &f.Body, &f.Skin, &f.Hair, &f.Level, &f.XP)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return out, err
	default:
		out.Fighter = &f
	}

	rows, err := s.pool.Query(ctx, `select item from fighter_gear where user_id = $1 order by owned_at, item`, user)
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
	rows, err = s.pool.Query(ctx, `select slot, item from fighter_equipped where user_id = $1`, user)
	if err != nil {
		return out, err
	}
	var slot, item string
	var worn []arena.Item
	if _, err := pgx.ForEachRow(rows, []any{&slot, &item}, func() error {
		out.Equipped[slot] = item
		if it, ok := arena.ItemByID(item); ok {
			worn = append(worn, it)
		}
		return nil
	}); err != nil {
		return out, err
	}
	level := 1
	if out.Fighter != nil {
		level = out.Fighter.Level
	}
	out.Stats = arena.StatsOf(level, worn)
	for _, it := range arena.Items {
		if !it.Starter {
			out.Shop = append(out.Shop, ShopItem{Item: it, Owned: owned[it.ID]})
		}
	}
	return out, nil
}

// CreateFighter makes a learner's fighter, dressed in the beggar's kit.
func (s *Store) CreateFighter(ctx context.Context, user uuid.UUID, look arena.Look) error {
	look, err := look.Clean()
	if err != nil {
		return err
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			insert into fighters (user_id, name, body, skin, hair) values ($1, $2, $3, $4, $5)`,
			user, look.Name, look.Body, look.Skin, look.Hair); err != nil {
			var pg *pgconn.PgError
			if errors.As(err, &pg) && pg.Code == "23505" {
				return ErrFighterTaken
			}
			return err
		}
		for _, it := range arena.Starters() {
			if _, err := tx.Exec(ctx, `
				insert into fighter_gear (user_id, item) values ($1, $2) on conflict do nothing`, user, it.ID); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				insert into fighter_equipped (user_id, slot, item) values ($1, $2, $3)
				on conflict (user_id, slot) do update set item = excluded.item`, user, it.Slot, it.ID); err != nil {
				return err
			}
		}
		return nil
	})
}

// UpdateFighter changes how a learner's fighter looks. It costs nothing.
func (s *Store) UpdateFighter(ctx context.Context, user uuid.UUID, look arena.Look) error {
	look, err := look.Clean()
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `
		update fighters set name = $2, body = $3, skin = $4, hair = $5 where user_id = $1`,
		user, look.Name, look.Body, look.Skin, look.Hair)
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

// Buy pays for a piece of gear out of the learner's coins. ErrNotFound for gear
// that does not exist or is not sold, ErrOwned, ErrNoFighter or
// ErrNotEnoughCoins when it cannot be bought.
func (s *Store) Buy(ctx context.Context, user uuid.UUID, id string) error {
	it, ok := arena.ItemByID(id)
	if !ok || it.Starter {
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
		tag, err := tx.Exec(ctx, `insert into fighter_gear (user_id, item) values ($1, $2) on conflict do nothing`, user, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrOwned
		}
		return debit(ctx, tx, user, "buy", id, it.Price)
	})
}

// Equip puts on a piece of gear the learner owns, in its slot.
func (s *Store) Equip(ctx context.Context, user uuid.UUID, id string) error {
	it, ok := arena.ItemByID(id)
	if !ok {
		return ErrNotFound
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if err := hasFighter(ctx, tx, user); err != nil {
			return err
		}
		var owned bool
		if err := tx.QueryRow(ctx, `select exists (select 1 from fighter_gear where user_id = $1 and item = $2)`, user, id).Scan(&owned); err != nil {
			return err
		}
		if !owned {
			return ErrNotOwned
		}
		_, err := tx.Exec(ctx, `
			insert into fighter_equipped (user_id, slot, item) values ($1, $2, $3)
			on conflict (user_id, slot) do update set item = excluded.item`, user, it.Slot, id)
		return err
	})
}

// Unequip takes off what is worn in a slot. The body slot cannot be bare: the
// rags go back on instead, and taking the rags off is refused.
func (s *Store) Unequip(ctx context.Context, user uuid.UUID, slot string) error {
	valid := false
	for _, s := range arena.Slots {
		valid = valid || s == slot
	}
	if !valid {
		return ErrNotFound
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if err := hasFighter(ctx, tx, user); err != nil {
			return err
		}
		// Each starting slot falls back to the beggar's kit rather than empty.
		for _, it := range arena.Starters() {
			if it.Slot != slot {
				continue
			}
			var worn string
			err := tx.QueryRow(ctx, `select item from fighter_equipped where user_id = $1 and slot = $2`, user, slot).Scan(&worn)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			if worn == it.ID {
				return ErrBareBody
			}
			_, err = tx.Exec(ctx, `update fighter_equipped set item = $3 where user_id = $1 and slot = $2`, user, slot, it.ID)
			return err
		}
		_, err := tx.Exec(ctx, `delete from fighter_equipped where user_id = $1 and slot = $2`, user, slot)
		return err
	})
}
