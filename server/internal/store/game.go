package store

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// The Arena's farm, as the server keeps it.
//
// Every action is a transaction that locks the player's profile row first, so
// two taps arriving together cannot spend the same gold or harvest the same
// plot twice, and every rule — whether a crop is ripe, what a seed costs — is
// checked here rather than trusted from the browser.

// GameError is a move the rules refuse: not enough gold, a crop not ripe yet.
// Code is what the app looks up to say it in the learner's language.
type GameError struct {
	Status  int
	Code    string
	Message string
}

func (e *GameError) Error() string { return e.Message }

func refuse(code, message string) error {
	return &GameError{Status: http.StatusConflict, Code: code, Message: message}
}

func badMove(code, message string) error {
	return &GameError{Status: http.StatusBadRequest, Code: code, Message: message}
}

type GameProfile struct {
	Gold          int        `json:"gold"`
	Stamina       int        `json:"stamina"`
	StaminaMax    int        `json:"staminaMax"`
	StaminaNextAt *time.Time `json:"staminaNextAt"`
	HP            int        `json:"hp"`
	HPMax         int        `json:"hpMax"`
	HPNextAt      *time.Time `json:"hpNextAt"`
	// CanSleepAt is when sleeping will next refill stamina; null when it would now.
	CanSleepAt *time.Time `json:"canSleepAt"`
	Map        string     `json:"map"`
	X          int        `json:"x"`
	Y          int        `json:"y"`
	MainStep   int        `json:"mainStep"`
	// WoodsOpen: the story has reached the woods; TownOpen, Echo Town;
	// HallOpen, the Word Hall's door; LibraryOpen, Lina's library.
	WoodsOpen   bool `json:"woodsOpen"`
	TownOpen    bool `json:"townOpen"`
	HallOpen    bool `json:"hallOpen"`
	LibraryOpen bool `json:"libraryOpen"`
	// RoomsOpen: the Word Hall's rooms, chapter 4; RoomsDone, how many of
	// them have their words back.
	RoomsOpen bool `json:"roomsOpen"`
	RoomsDone int  `json:"roomsDone"`
}

type GamePlot struct {
	Idx       int        `json:"idx"`
	Unlocked  bool       `json:"unlocked"`
	Level     int        `json:"level"`
	Crop      *string    `json:"crop"`
	PlantedAt *time.Time `json:"plantedAt"`
	RipeAt    *time.Time `json:"ripeAt"`
}

type ShopItem struct {
	game.Item
	Unlocked bool `json:"unlocked"`
}

// GameState is everything the farm screen draws, with the server's clock so
// the browser can show a crop growing without trusting its own.
type GameState struct {
	Now          time.Time      `json:"now"`
	Profile      GameProfile    `json:"profile"`
	Plots        []GamePlot     `json:"plots"`
	Inventory    map[string]int `json:"inventory"`
	Shop         []ShopItem     `json:"shop"`
	Crops        []game.Crop    `json:"crops"`
	UnlockCost   int            `json:"unlockCost"`
	UpgradeCosts []int          `json:"upgradeCosts"`
	Words        int            `json:"words"`
	// The woods: what lives there, and where, with when each beaten one comes
	// back. Empty until the woods are open.
	Monsters []game.Monster `json:"monsters"`
	Spawns   []SpawnView    `json:"spawns"`
	// The people of Echo Town and how well the player knows them. Empty until
	// the town is open.
	Friends []FriendView `json:"friends"`
	// Letter is today's letter in the mailbox, once the townsfolk write.
	Letter *LetterView `json:"letter"`
}

// SpawnView is a place in the woods, and when its monster is back if it was
// beaten (null: it is there now).
type SpawnView struct {
	game.Spawn
	RespawnAt *time.Time `json:"respawnAt"`
}

// HarvestedWord is the word a crop yielded, with what it means and how it sounds.
type HarvestedWord struct {
	Word    string `json:"word"`
	IPA     string `json:"ipa"`
	Meaning string `json:"meaning"`
}

type profileRow struct {
	gold       int
	stamina    int
	staminaAt  time.Time
	sleptAt    *time.Time
	mapName    string
	x, y       int
	mainStep   int
	mainStepAt time.Time
	hp         int
	hpAt       time.Time
	// An admin, who can go anywhere in the game without the story having
	// got there: everything can be tried out at once. The story itself still
	// goes step by step.
	admin bool
}

// reached is whether the story has opened what opens at step — or whether
// the player is an admin, for whom everything is open.
func (p profileRow) reached(step int) bool { return p.admin || p.mainStep >= step }

func (p profileRow) woodsOpen() bool { return p.reached(game.WoodsStep) }

// hasGlasses is whether the player can read the Lexi's notes: with Sage
// Orin's glasses, or as an admin.
func (p profileRow) hasGlasses(ctx context.Context, tx pgx.Tx, user uuid.UUID) (bool, error) {
	if p.admin {
		return true, nil
	}
	return hasItem(ctx, tx, user, "ipa_glasses")
}

// ensureGame gives a player a farm the first time they arrive: the starting
// gold, the first plots cleared, a few seeds in the bag.
func ensureGame(ctx context.Context, tx pgx.Tx, user uuid.UUID) error {
	tag, err := tx.Exec(ctx, `
		insert into game_profiles (user_id, gold, stamina) values ($1, $2, $3)
		on conflict (user_id) do nothing`, user, game.StartGold, game.StaminaMax)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into game_plots (user_id, idx, unlocked)
		select $1, i, i < $3 from generate_series(0, $2 - 1) i`,
		user, game.Plots, game.StartPlots); err != nil {
		return err
	}
	for item, qty := range game.StartItems {
		if err := addItem(ctx, tx, user, item, qty); err != nil {
			return err
		}
	}
	return nil
}

// lockGame creates the farm if need be and locks its profile for the rest of
// the transaction. now is the database's clock, the one every rule reads.
func lockGame(ctx context.Context, tx pgx.Tx, user uuid.UUID) (profileRow, time.Time, error) {
	if err := ensureGame(ctx, tx, user); err != nil {
		return profileRow{}, time.Time{}, err
	}
	var p profileRow
	var now time.Time
	err := tx.QueryRow(ctx, `
		select gold, stamina, stamina_at, slept_at, map, x, y, main_step, main_step_at,
		       hp, hp_at, coalesce((select is_admin from users where id = $1), false), now()
		from game_profiles where user_id = $1 for update`, user).
		Scan(&p.gold, &p.stamina, &p.staminaAt, &p.sleptAt, &p.mapName, &p.x, &p.y,
			&p.mainStep, &p.mainStepAt, &p.hp, &p.hpAt, &p.admin, &now)
	return p, now, err
}

func saveProfile(ctx context.Context, tx pgx.Tx, user uuid.UUID, p profileRow) error {
	_, err := tx.Exec(ctx, `
		update game_profiles
		set gold = $2, stamina = $3, stamina_at = $4, slept_at = $5,
		    main_step = $6, main_step_at = $7, hp = $8, hp_at = $9,
		    map = $10, x = $11, y = $12
		where user_id = $1`,
		user, p.gold, p.stamina, p.staminaAt, p.sleptAt, p.mainStep, p.mainStepAt,
		p.hp, p.hpAt, p.mapName, p.x, p.y)
	return err
}

func addItem(ctx context.Context, tx pgx.Tx, user uuid.UUID, item string, qty int) error {
	_, err := tx.Exec(ctx, `
		insert into game_inventory (user_id, item, qty) values ($1, $2, $3)
		on conflict (user_id, item) do update set qty = game_inventory.qty + excluded.qty`,
		user, item, qty)
	return err
}

// hasItem says whether the bag holds at least one of something.
func hasItem(ctx context.Context, tx pgx.Tx, user uuid.UUID, item string) (bool, error) {
	var has bool
	err := tx.QueryRow(ctx, `
		select exists (select 1 from game_inventory where user_id = $1 and item = $2 and qty > 0)`,
		user, item).Scan(&has)
	return has, err
}

// takeItem uses one of something, or says there is none.
func takeItem(ctx context.Context, tx pgx.Tx, user uuid.UUID, item string) (bool, error) {
	tag, err := tx.Exec(ctx, `
		update game_inventory set qty = qty - 1
		where user_id = $1 and item = $2 and qty > 0`, user, item)
	return tag.RowsAffected() == 1, err
}

func logEvent(ctx context.Context, tx pgx.Tx, user uuid.UUID, kind, item string, gold int) error {
	_, err := tx.Exec(ctx, `
		insert into game_events (user_id, kind, item, gold) values ($1, $2, $3, $4)`,
		user, kind, item, gold)
	return err
}

// spendStamina takes cost from the player's stamina, or refuses.
func spendStamina(p *profileRow, now time.Time, cost int) error {
	current, _ := game.Stamina(p.stamina, p.staminaAt, now)
	if current < cost {
		return refuse("no_stamina", "not enough stamina")
	}
	p.stamina, p.staminaAt = game.SetStamina(p.stamina, p.staminaAt, now, current-cost)
	return nil
}

func spendGold(p *profileRow, cost int) error {
	if p.gold < cost {
		return refuse("no_gold", "not enough gold")
	}
	p.gold -= cost
	return nil
}

// GameState is the player's farm, created on first visit.
func (s *Store) GameState(ctx context.Context, user uuid.UUID) (GameState, error) {
	var out GameState
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		out, err = readState(ctx, tx, user, p, now)
		return err
	})
	return out, err
}

func readState(ctx context.Context, tx pgx.Tx, user uuid.UUID, p profileRow, now time.Time) (GameState, error) {
	stamina, next := game.Stamina(p.stamina, p.staminaAt, now)
	hp, hpNext := game.HP(p.hp, p.hpAt, now)
	out := GameState{
		Now: now,
		Profile: GameProfile{
			Gold: p.gold, Stamina: stamina, StaminaMax: game.StaminaMax,
			HP: hp, HPMax: game.HPMax,
			Map: p.mapName, X: p.x, Y: p.y, MainStep: p.mainStep, WoodsOpen: p.woodsOpen(), TownOpen: p.townOpen(),
			HallOpen: p.hallOpen(), LibraryOpen: p.libraryOpen(), RoomsOpen: p.roomsOpen(),
		},
		Inventory:    map[string]int{},
		Crops:        game.Crops,
		UpgradeCosts: []int{},
		Monsters:     []game.Monster{},
		Spawns:       []SpawnView{},
		Friends:      []FriendView{},
	}
	if !next.IsZero() {
		out.Profile.StaminaNextAt = &next
	}
	if !hpNext.IsZero() {
		out.Profile.HPNextAt = &hpNext
	}
	if p.woodsOpen() {
		out.Monsters = game.Monsters
		back, err := respawns(ctx, tx, user, now)
		if err != nil {
			return out, err
		}
		for _, sp := range game.Spawns {
			if !p.reached(sp.Step) {
				continue // the lair is empty until the story fills it
			}
			view := SpawnView{Spawn: sp}
			if at, ok := back[sp.ID]; ok {
				view.RespawnAt = &at
			}
			out.Spawns = append(out.Spawns, view)
		}
	}
	if p.roomsOpen() {
		done, err := roomsRestored(ctx, tx, user)
		if err != nil {
			return out, err
		}
		out.Profile.RoomsDone = done
	}
	if p.townOpen() {
		f, err := friends(ctx, tx, user, now)
		if err != nil {
			return out, err
		}
		out.Friends = f
		if out.Letter, err = todaysLetter(ctx, tx, user, p, now); err != nil {
			return out, err
		}
	}
	if p.sleptAt != nil {
		if again := p.sleptAt.Add(game.SleepEvery); again.After(now) {
			out.Profile.CanSleepAt = &again
		}
	}
	hammer, err := hasItem(ctx, tx, user, "bram_hammer")
	if err != nil {
		return out, err
	}
	for level := 0; level < game.MaxLevelFor(hammer); level++ {
		out.UpgradeCosts = append(out.UpgradeCosts, game.UpgradeCost(level))
	}
	for _, it := range game.Items {
		out.Shop = append(out.Shop, ShopItem{Item: it, Unlocked: p.reached(it.UnlockStep)})
	}

	rows, err := tx.Query(ctx, `
		select idx, unlocked, level, crop, planted_at from game_plots
		where user_id = $1 order by idx`, user)
	if err != nil {
		return out, err
	}
	unlocked := 0
	for rows.Next() {
		var plot GamePlot
		if err := rows.Scan(&plot.Idx, &plot.Unlocked, &plot.Level, &plot.Crop, &plot.PlantedAt); err != nil {
			rows.Close()
			return out, err
		}
		if plot.Crop != nil && plot.PlantedAt != nil {
			if crop, ok := game.CropByID(*plot.Crop); ok {
				ripe := plot.PlantedAt.Add(game.GrowTime(crop, plot.Level))
				plot.RipeAt = &ripe
			}
		}
		if plot.Unlocked {
			unlocked++
		}
		out.Plots = append(out.Plots, plot)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	out.UnlockCost = game.UnlockCost(unlocked)

	rows, err = tx.Query(ctx, `select item, qty from game_inventory where user_id = $1 and qty > 0`, user)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var item string
		var qty int
		if err := rows.Scan(&item, &qty); err != nil {
			rows.Close()
			return out, err
		}
		out.Inventory[item] = qty
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	err = tx.QueryRow(ctx, `
		select count(*)::int from game_events
		where user_id = $1 and kind = 'harvest' and item <> ''`, user).Scan(&out.Words)
	return out, err
}

// gameAction runs one move: lock, apply, save, and answer with the new state.
func (s *Store) gameAction(ctx context.Context, user uuid.UUID,
	act func(tx pgx.Tx, p *profileRow, now time.Time) error) (GameState, error) {
	var out GameState
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		if err := act(tx, &p, now); err != nil {
			return err
		}
		if err := saveProfile(ctx, tx, user, p); err != nil {
			return err
		}
		out, err = readState(ctx, tx, user, p, now)
		return err
	})
	return out, err
}

func lockPlot(ctx context.Context, tx pgx.Tx, user uuid.UUID, idx int) (GamePlot, error) {
	var plot GamePlot
	err := tx.QueryRow(ctx, `
		select idx, unlocked, level, crop, planted_at from game_plots
		where user_id = $1 and idx = $2 for update`, user, idx).
		Scan(&plot.Idx, &plot.Unlocked, &plot.Level, &plot.Crop, &plot.PlantedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return plot, badMove("no_plot", "there is no such plot")
	}
	return plot, err
}

// Plant puts a seed from the bag into an empty, cleared plot.
func (s *Store) Plant(ctx context.Context, user uuid.UUID, idx int, seed string) (GameState, error) {
	return s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		crop, ok := game.CropFromSeed(seed)
		if !ok {
			return badMove("not_a_seed", "that is not a seed")
		}
		plot, err := lockPlot(ctx, tx, user, idx)
		if err != nil {
			return err
		}
		if !plot.Unlocked {
			return refuse("locked", "that plot has not been cleared yet")
		}
		if plot.Crop != nil {
			return refuse("occupied", "something is already growing there")
		}
		if err := spendStamina(p, now, game.PlantCost); err != nil {
			return err
		}
		had, err := takeItem(ctx, tx, user, seed)
		if err != nil {
			return err
		}
		if !had {
			return refuse("no_seed", "no seeds of that kind left")
		}
		if _, err := tx.Exec(ctx, `
			update game_plots set crop = $3, planted_at = $4 where user_id = $1 and idx = $2`,
			user, idx, crop.ID, now); err != nil {
			return err
		}
		return logEvent(ctx, tx, user, "plant", crop.ID, 0)
	})
}

// Harvest picks a ripe crop: its gold, and a word the learner does not have
// yet, which goes straight into their vocabulary.
func (s *Store) Harvest(ctx context.Context, user uuid.UUID, idx int) (GameState, *HarvestedWord, int, error) {
	var word *HarvestedWord
	var gold int
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		plot, err := lockPlot(ctx, tx, user, idx)
		if err != nil {
			return err
		}
		if plot.Crop == nil || plot.PlantedAt == nil {
			return refuse("empty", "nothing is growing there")
		}
		crop, ok := game.CropByID(*plot.Crop)
		if !ok {
			return fmt.Errorf("plot %d grows unknown crop %q", idx, *plot.Crop)
		}
		if plot.PlantedAt.Add(game.GrowTime(crop, plot.Level)).After(now) {
			return refuse("not_ripe", "it is not ready yet")
		}
		if err := spendStamina(p, now, game.HarvestCost); err != nil {
			return err
		}
		word, err = pickWord(ctx, tx, user, crop)
		if err != nil {
			return err
		}
		gold = crop.Gold
		p.gold += gold
		if _, err := tx.Exec(ctx, `
			update game_plots set crop = null, planted_at = null where user_id = $1 and idx = $2`,
			user, idx); err != nil {
			return err
		}
		item := ""
		if word != nil {
			item = word.Word
			if _, err := tx.Exec(ctx, `
				insert into vocab_words (user_id, word, ipa, meaning) values ($1, $2, $3, $4)
				on conflict (user_id, word) do nothing`,
				user, word.Word, word.IPA, word.Meaning); err != nil {
				return err
			}
		}
		return logEvent(ctx, tx, user, "harvest", item, gold)
	})
	return state, word, gold, err
}

// pickWord draws a word from the crop's band of how common words are: one with
// a meaning and a pronunciation to show, that the learner has not collected
// yet. Nil when the band holds nothing new — a crop still pays its gold.
func pickWord(ctx context.Context, tx pgx.Tx, user uuid.UUID, crop game.Crop) (*HarvestedWord, error) {
	var w HarvestedWord
	err := tx.QueryRow(ctx, `
		select g.word, g.ipa, g.meaning
		from word_ranks r join glosses g on g.word = r.word
		where r.rank between $2 and $3 and g.ipa <> '' and g.meaning <> ''
		  and not exists (select 1 from vocab_words v where v.user_id = $1 and v.word = r.word)
		order by random() limit 1`, user, crop.RankLo, crop.RankHi).
		Scan(&w.Word, &w.IPA, &w.Meaning)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// Buy takes gold for items from the shop, if the story has opened them yet.
func (s *Store) Buy(ctx context.Context, user uuid.UUID, item string, qty int) (GameState, error) {
	return s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		it, ok := game.ItemByID(item)
		if !ok {
			return badMove("no_item", "the shop has no such thing")
		}
		if qty < 1 || qty > 99 {
			return badMove("bad_qty", "buy between 1 and 99")
		}
		if !p.reached(it.UnlockStep) {
			return refuse("locked", "that is not for sale yet")
		}
		cost := it.Price * qty
		if err := spendGold(p, cost); err != nil {
			return err
		}
		if err := addItem(ctx, tx, user, item, qty); err != nil {
			return err
		}
		return logEvent(ctx, tx, user, "buy", item, -cost)
	})
}

// Use eats or drinks something from the bag.
func (s *Store) UseItem(ctx context.Context, user uuid.UUID, item string) (GameState, error) {
	return s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		it, ok := game.ItemByID(item)
		if !ok || (it.Stamina == 0 && it.HP == 0) {
			return badMove("not_usable", "that cannot be used")
		}
		stamina, _ := game.Stamina(p.stamina, p.staminaAt, now)
		hp, _ := game.HP(p.hp, p.hpAt, now)
		if (it.Stamina == 0 || stamina >= game.StaminaMax) && (it.HP == 0 || hp >= game.HPMax) {
			return refuse("full", "already full")
		}
		had, err := takeItem(ctx, tx, user, item)
		if err != nil {
			return err
		}
		if !had {
			return refuse("no_item", "none left")
		}
		if it.Stamina > 0 {
			p.stamina, p.staminaAt = game.SetStamina(p.stamina, p.staminaAt, now, stamina+it.Stamina)
		}
		if it.HP > 0 {
			p.hp, p.hpAt = game.SetHP(p.hp, p.hpAt, now, hp+it.HP)
		}
		return logEvent(ctx, tx, user, "use", item, 0)
	})
}

// Sleep refills stamina and health, once every few hours.
func (s *Store) Sleep(ctx context.Context, user uuid.UUID) (GameState, error) {
	return s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if p.sleptAt != nil && p.sleptAt.Add(game.SleepEvery).After(now) {
			return refuse("rested", "you are not sleepy yet")
		}
		p.stamina, p.staminaAt = game.StaminaMax, now
		p.hp, p.hpAt = game.HPMax, now
		p.sleptAt = &now
		return logEvent(ctx, tx, user, "sleep", "", 0)
	})
}

// Unlock clears one more plot, for gold.
func (s *Store) UnlockPlot(ctx context.Context, user uuid.UUID, idx int) (GameState, error) {
	return s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		plot, err := lockPlot(ctx, tx, user, idx)
		if err != nil {
			return err
		}
		if plot.Unlocked {
			return refuse("unlocked", "that plot is already cleared")
		}
		var unlocked int
		if err := tx.QueryRow(ctx, `
			select count(*)::int from game_plots where user_id = $1 and unlocked`, user).
			Scan(&unlocked); err != nil {
			return err
		}
		cost := game.UnlockCost(unlocked)
		if err := spendGold(p, cost); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update game_plots set unlocked = true where user_id = $1 and idx = $2`, user, idx); err != nil {
			return err
		}
		return logEvent(ctx, tx, user, "unlock", fmt.Sprint(idx), -cost)
	})
}

// Upgrade enriches a plot's soil, so what grows there grows faster.
func (s *Store) UpgradePlot(ctx context.Context, user uuid.UUID, idx int) (GameState, error) {
	return s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		plot, err := lockPlot(ctx, tx, user, idx)
		if err != nil {
			return err
		}
		if !plot.Unlocked {
			return refuse("locked", "that plot has not been cleared yet")
		}
		hammer, err := hasItem(ctx, tx, user, "bram_hammer")
		if err != nil {
			return err
		}
		if plot.Level >= game.MaxLevelFor(hammer) {
			return refuse("max_level", "that soil is as rich as it gets")
		}
		cost := game.UpgradeCost(plot.Level)
		if err := spendGold(p, cost); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update game_plots set level = level + 1 where user_id = $1 and idx = $2`, user, idx); err != nil {
			return err
		}
		return logEvent(ctx, tx, user, "upgrade", fmt.Sprint(idx), -cost)
	})
}

// Listen records that the learner played a word they harvested — the story's
// third step asks for it.
func (s *Store) ListenToWord(ctx context.Context, user uuid.UUID, word string) error {
	tag, err := s.pool.Exec(ctx, `
		insert into game_events (user_id, kind, item)
		select $1, 'listen', $2
		where exists (select 1 from game_events
		              where user_id = $1 and kind = 'harvest' and item = $2)`, user, word)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MoveTo remembers where the player stands, so they come back to the same spot.
// A farm not started yet is started here, rather than the spot being dropped.
// The woods are only walked into once the story has opened them, and walking
// in is written down: the story asks for it.
func (s *Store) MoveTo(ctx context.Context, user uuid.UUID, mapName string, x, y int) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		p, _, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		if mapName == "woods" && !p.woodsOpen() {
			return refuse("woods_locked", "the woods are not open yet")
		}
		if mapName == "town" && !p.townOpen() {
			return refuse("town_locked", "the town is not open yet")
		}
		if mapName != p.mapName && (mapName == "woods" || mapName == "town") {
			if err := logEvent(ctx, tx, user, "enter_"+mapName, "", 0); err != nil {
				return err
			}
		}
		p.mapName, p.x, p.y = mapName, x, y
		return saveProfile(ctx, tx, user, p)
	})
}

// RipenAllCrops moves every planting a day into the past. For the browser
// tests, through a route that exists only when AUTH_FAKE=1.
func (s *Store) RipenAllCrops(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		update game_plots set planted_at = planted_at - interval '1 day' where planted_at is not null`)
	return err
}
