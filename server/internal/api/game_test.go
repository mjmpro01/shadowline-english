package api_test

import (
	"context"
	"net/http"
	"testing"
)

// The Arena's farm. The server keeps it and decides every outcome, so these
// are the rules: what a new farmer starts with, what a move costs, when a crop
// is ready, and what it yields — a word the learner does not have yet, straight
// into their vocabulary.

type gamePlotJSON struct {
	Idx      int     `json:"idx"`
	Unlocked bool    `json:"unlocked"`
	Level    int     `json:"level"`
	Crop     *string `json:"crop"`
	RipeAt   *string `json:"ripeAt"`
}

type gameStateJSON struct {
	Profile struct {
		Gold       int     `json:"gold"`
		Stamina    int     `json:"stamina"`
		StaminaMax int     `json:"staminaMax"`
		CanSleepAt *string `json:"canSleepAt"`
		MainStep   int     `json:"mainStep"`
		X          int     `json:"x"`
		Y          int     `json:"y"`
	} `json:"profile"`
	Plots     []gamePlotJSON `json:"plots"`
	Inventory map[string]int `json:"inventory"`
	Shop      []struct {
		ID       string `json:"id"`
		Price    int    `json:"price"`
		Unlocked bool   `json:"unlocked"`
	} `json:"shop"`
	UnlockCost int `json:"unlockCost"`
	Words      int `json:"words"`
}

type harvestJSON struct {
	State gameStateJSON `json:"state"`
	Word  *struct {
		Word    string `json:"word"`
		IPA     string `json:"ipa"`
		Meaning string `json:"meaning"`
	} `json:"word"`
	Gold int `json:"gold"`
}

type questsJSON struct {
	Main *struct {
		Step     int    `json:"step"`
		ID       string `json:"id"`
		Target   int    `json:"target"`
		Progress int    `json:"progress"`
		Done     bool   `json:"done"`
	} `json:"main"`
	Day   string `json:"day"`
	Daily []struct {
		ID       string `json:"id"`
		Target   int    `json:"target"`
		Progress int    `json:"progress"`
		Done     bool   `json:"done"`
		Claimed  bool   `json:"claimed"`
		Learning bool   `json:"learning"`
	} `json:"daily"`
	Chest struct {
		Ready   bool `json:"ready"`
		Claimed bool `json:"claimed"`
		Streak  int  `json:"streak"`
	} `json:"chest"`
	Claimable int `json:"claimable"`
}

func gameState(t *testing.T, c *client) gameStateJSON {
	t.Helper()
	return expect[gameStateJSON](t, c.do("GET", "/api/game/state", "", nil), http.StatusOK)
}

func plant(t *testing.T, c *client, plot int, seed string) gameStateJSON {
	t.Helper()
	return expect[gameStateJSON](t, c.json("POST", "/api/game/plant",
		map[string]any{"plot": plot, "seed": seed}), http.StatusOK)
}

func harvest(t *testing.T, c *client, plot int) harvestJSON {
	t.Helper()
	return expect[harvestJSON](t, c.json("POST", "/api/game/harvest", map[string]any{"plot": plot}), http.StatusOK)
}

func gameQuests(t *testing.T, c *client) questsJSON {
	t.Helper()
	return expect[questsJSON](t, c.do("GET", "/api/game/quests", "", nil), http.StatusOK)
}

func claim(t *testing.T, c *client, quest string) {
	t.Helper()
	expectStatus(t, c.json("POST", "/api/game/quests/claim", map[string]any{"quest": quest}), http.StatusOK)
}

// ripen moves every planting far enough into the past to be ready.
func (h *harness) ripen(t *testing.T) {
	t.Helper()
	if _, err := h.pool.Exec(context.Background(),
		`update game_plots set planted_at = planted_at - interval '1 day' where planted_at is not null`); err != nil {
		t.Fatalf("ripen: %v", err)
	}
}

func (h *harness) setGold(t *testing.T, gold int) {
	t.Helper()
	if _, err := h.pool.Exec(context.Background(), `update game_profiles set gold = $1`, gold); err != nil {
		t.Fatalf("set gold: %v", err)
	}
}

func (h *harness) setStamina(t *testing.T, stamina int) {
	t.Helper()
	if _, err := h.pool.Exec(context.Background(),
		`update game_profiles set stamina = $1, stamina_at = now()`, stamina); err != nil {
		t.Fatalf("set stamina: %v", err)
	}
}

func TestANewFarmerStartsWithAFarm(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	state := gameState(t, learner)
	if state.Profile.Gold != 50 || state.Profile.Stamina != 30 || state.Profile.StaminaMax != 30 {
		t.Fatalf("profile %+v", state.Profile)
	}
	if len(state.Plots) != 12 {
		t.Fatalf("%d plots", len(state.Plots))
	}
	open := 0
	for _, p := range state.Plots {
		if p.Unlocked {
			open++
		}
	}
	if open != 4 || state.Inventory["seed_sprout"] != 3 {
		t.Fatalf("%d plots open, bag %v", open, state.Inventory)
	}
	// Coming back is the same farm, not a second one.
	if again := gameState(t, learner); again.Profile.Gold != 50 || len(again.Plots) != 12 {
		t.Fatalf("second visit: %+v", again.Profile)
	}
	// Only the cheapest seed is for sale before the story opens the others.
	for _, item := range state.Shop {
		if want := item.ID == "seed_sprout" || item.ID == "ginger_tea"; item.Unlocked != want {
			t.Fatalf("%s for sale: %v", item.ID, item.Unlocked)
		}
	}
}

func TestACropGrowsAWordIntoTheVocabulary(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	state := plant(t, learner, 0, "seed_sprout")
	if state.Plots[0].Crop == nil || *state.Plots[0].Crop != "sprout" || state.Plots[0].RipeAt == nil {
		t.Fatalf("after planting: %+v", state.Plots[0])
	}
	if state.Profile.Stamina != 28 || state.Inventory["seed_sprout"] != 2 {
		t.Fatalf("planting cost: stamina %d, seeds %d", state.Profile.Stamina, state.Inventory["seed_sprout"])
	}

	expectCode(t, learner.json("POST", "/api/game/harvest", map[string]any{"plot": 0}),
		http.StatusConflict, "not_ripe")
	expectCode(t, learner.json("POST", "/api/game/plant", map[string]any{"plot": 0, "seed": "seed_sprout"}),
		http.StatusConflict, "occupied")

	h.ripen(t)
	got := harvest(t, learner, 0)
	if got.Word == nil || got.Word.Word == "" || got.Word.IPA == "" || got.Word.Meaning == "" {
		t.Fatalf("harvest gave %+v", got.Word)
	}
	if got.Gold != 15 || got.State.Profile.Gold != 65 || got.State.Plots[0].Crop != nil || got.State.Words != 1 {
		t.Fatalf("after harvest: gold %d, profile %+v, plot %+v", got.Gold, got.State.Profile, got.State.Plots[0])
	}

	vocab := expect[[]vocabJSON](t, learner.do("GET", "/api/vocab", "", nil), http.StatusOK)
	found := false
	for _, v := range vocab {
		if v.Word == got.Word.Word {
			found = v.Status == "new" && v.Meaning != ""
		}
	}
	if !found {
		t.Fatalf("%q is not a new card in the vocabulary", got.Word.Word)
	}
	expectCode(t, learner.json("POST", "/api/game/harvest", map[string]any{"plot": 0}),
		http.StatusConflict, "empty")
}

func TestAHarvestNeverRepeatsAWordTheLearnerHas(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	if _, err := h.pool.Exec(context.Background(), `
		update game_inventory set qty = 30 where item = 'seed_sprout'`); err != nil {
		t.Fatal(err)
	}
	h.setGold(t, 10000)
	for plot := 4; plot < 12; plot++ {
		expectStatus(t, learner.json("POST", "/api/game/unlock", map[string]any{"plot": plot}), http.StatusOK)
	}

	seen := map[string]bool{}
	for round := 0; round < 2; round++ {
		h.setStamina(t, 30)
		for plot := 0; plot < 12; plot++ {
			plant(t, learner, plot, "seed_sprout")
		}
		h.ripen(t)
		h.setStamina(t, 30)
		for plot := 0; plot < 12; plot++ {
			got := harvest(t, learner, plot)
			if got.Word == nil {
				t.Fatalf("round %d plot %d gave no word", round, plot)
			}
			if seen[got.Word.Word] {
				t.Fatalf("%q came up twice", got.Word.Word)
			}
			seen[got.Word.Word] = true
		}
	}
}

func TestTheFarmRefusesWhatItCannotAfford(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)

	expectCode(t, learner.json("POST", "/api/game/plant", map[string]any{"plot": 5, "seed": "seed_sprout"}),
		http.StatusConflict, "locked")
	expectCode(t, learner.json("POST", "/api/game/plant", map[string]any{"plot": 0, "seed": "seed_bloom"}),
		http.StatusConflict, "no_seed")
	expectCode(t, learner.json("POST", "/api/game/plant", map[string]any{"plot": 0, "seed": "ginger_tea"}),
		http.StatusBadRequest, "not_a_seed")
	expectCode(t, learner.json("POST", "/api/game/plant", map[string]any{"plot": 40, "seed": "seed_sprout"}),
		http.StatusBadRequest, "no_plot")

	// Bloom seeds are not sold until the story reaches them.
	expectCode(t, learner.json("POST", "/api/game/buy", map[string]any{"item": "seed_bloom", "qty": 1}),
		http.StatusConflict, "locked")
	expectCode(t, learner.json("POST", "/api/game/buy", map[string]any{"item": "seed_sprout", "qty": 6}),
		http.StatusConflict, "no_gold")
	bought := expect[gameStateJSON](t, learner.json("POST", "/api/game/buy",
		map[string]any{"item": "seed_sprout", "qty": 5}), http.StatusOK)
	if bought.Profile.Gold != 0 || bought.Inventory["seed_sprout"] != 8 {
		t.Fatalf("after buying: gold %d, seeds %d", bought.Profile.Gold, bought.Inventory["seed_sprout"])
	}

	expectCode(t, learner.json("POST", "/api/game/unlock", map[string]any{"plot": 4}),
		http.StatusConflict, "no_gold")
	h.setGold(t, 80)
	opened := expect[gameStateJSON](t, learner.json("POST", "/api/game/unlock", map[string]any{"plot": 4}),
		http.StatusOK)
	if !opened.Plots[4].Unlocked || opened.Profile.Gold != 0 || opened.UnlockCost != 120 {
		t.Fatalf("after opening: %+v, gold %d, next costs %d", opened.Plots[4], opened.Profile.Gold, opened.UnlockCost)
	}
	expectCode(t, learner.json("POST", "/api/game/unlock", map[string]any{"plot": 4}),
		http.StatusConflict, "unlocked")

	h.setGold(t, 1000)
	for level := 1; level <= 3; level++ {
		up := expect[gameStateJSON](t, learner.json("POST", "/api/game/upgrade", map[string]any{"plot": 0}),
			http.StatusOK)
		if up.Plots[0].Level != level {
			t.Fatalf("level %d after upgrading", up.Plots[0].Level)
		}
	}
	expectCode(t, learner.json("POST", "/api/game/upgrade", map[string]any{"plot": 0}),
		http.StatusConflict, "max_level")

	h.setStamina(t, 1)
	expectCode(t, learner.json("POST", "/api/game/plant", map[string]any{"plot": 0, "seed": "seed_sprout"}),
		http.StatusConflict, "no_stamina")
}

func TestSleepAndTeaBringStaminaBack(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)

	expectCode(t, learner.json("POST", "/api/game/use", map[string]any{"item": "ginger_tea"}),
		http.StatusConflict, "full")

	h.setStamina(t, 4)
	slept := expect[gameStateJSON](t, learner.json("POST", "/api/game/sleep", nil), http.StatusOK)
	if slept.Profile.Stamina != 30 || slept.Profile.CanSleepAt == nil {
		t.Fatalf("after sleeping: %+v", slept.Profile)
	}
	h.setStamina(t, 4)
	expectCode(t, learner.json("POST", "/api/game/sleep", nil), http.StatusConflict, "rested")

	expectCode(t, learner.json("POST", "/api/game/use", map[string]any{"item": "ginger_tea"}),
		http.StatusConflict, "no_item")
	expectStatus(t, learner.json("POST", "/api/game/buy", map[string]any{"item": "ginger_tea", "qty": 1}),
		http.StatusOK)
	drank := expect[gameStateJSON](t, learner.json("POST", "/api/game/use", map[string]any{"item": "ginger_tea"}),
		http.StatusOK)
	if drank.Profile.Stamina != 14 || drank.Inventory["ginger_tea"] != 0 {
		t.Fatalf("after tea: stamina %d, tea %d", drank.Profile.Stamina, drank.Inventory["ginger_tea"])
	}
}

func TestOneFarmerCannotTouchAnothersFarm(t *testing.T) {
	h := newHarness(t)
	a := h.login("a@example.com")
	b := h.login("b@example.com")
	plant(t, a, 0, "seed_sprout")
	h.ripen(t)

	if b := gameState(t, b); b.Plots[0].Crop != nil {
		t.Fatalf("b sees a's crop: %+v", b.Plots[0])
	}
	expectCode(t, b.json("POST", "/api/game/harvest", map[string]any{"plot": 0}), http.StatusConflict, "empty")
	harvest(t, a, 0)

	anonymous := h.anonymous()
	expectStatus(t, anonymous.do("GET", "/api/game/state", "", nil), http.StatusUnauthorized)
}

func TestTheStoryAdvancesStepByStep(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	q := gameQuests(t, learner)
	if q.Main == nil || q.Main.ID != "letter" || q.Main.Done {
		t.Fatalf("at the start: %+v", q.Main)
	}
	expectCode(t, learner.json("POST", "/api/game/quests/claim", map[string]any{"quest": "main"}),
		http.StatusConflict, "not_done")

	plant(t, learner, 0, "seed_sprout")
	if q = gameQuests(t, learner); !q.Main.Done || q.Claimable < 1 {
		t.Fatalf("after planting: %+v", q.Main)
	}
	claim(t, learner, "main")
	state := gameState(t, learner)
	if state.Profile.MainStep != 1 || state.Profile.Gold != 70 {
		t.Fatalf("after the first step: step %d, gold %d", state.Profile.MainStep, state.Profile.Gold)
	}

	// A step counts only what was done after it began: the seed planted for
	// step one does not also count as a harvest for step two.
	q = gameQuests(t, learner)
	if q.Main.ID != "first_harvest" || q.Main.Done {
		t.Fatalf("step two: %+v", q.Main)
	}
	h.ripen(t)
	got := harvest(t, learner, 0)
	claim(t, learner, "main")

	// Listening to a word only counts for a word actually harvested.
	expectStatus(t, learner.json("POST", "/api/game/listen", map[string]any{"word": "zzzz"}), http.StatusNotFound)
	expectStatus(t, learner.json("POST", "/api/game/listen", map[string]any{"word": got.Word.Word}),
		http.StatusNoContent)
	claim(t, learner, "main")

	// A reward cannot be taken twice: the step has moved on.
	if q = gameQuests(t, learner); q.Main.ID != "meet_mira" || q.Main.Done {
		t.Fatalf("step four: %+v", q.Main)
	}
}

func TestTheStoryOpensBloomSeeds(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	// Straight to the step that practises a line in Shadowing.
	if _, err := h.pool.Exec(context.Background(), `update game_profiles set main_step = 7, main_step_at = now()`); err != nil {
		t.Fatal(err)
	}
	if q := gameQuests(t, learner); q.Main.ID != "say_it" || q.Main.Done {
		t.Fatalf("before practising: %+v", q.Main)
	}

	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	record(t, learner, clip.ID)
	if q := gameQuests(t, learner); !q.Main.Done {
		t.Fatalf("a take in Shadowing did not count: %+v", q.Main)
	}
	claim(t, learner, "main")

	state := gameState(t, learner)
	if state.Inventory["seed_bloom"] != 2 {
		t.Fatalf("bag after the step: %v", state.Inventory)
	}
	for _, item := range state.Shop {
		if item.ID == "seed_bloom" && !item.Unlocked {
			t.Fatal("bloom seeds still not for sale")
		}
	}
	// The last step of the chapter has nothing to do but read it.
	q := gameQuests(t, learner)
	if q.Main.ID != "the_silence" || !q.Main.Done {
		t.Fatalf("the chapter's end: %+v", q.Main)
	}
	claim(t, learner, "main")
	// Chapter 2 begins with the Knights' Guild, which only asks to be heard,
	// and its salves; then the woods are open.
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "guild" || !q.Main.Done {
		t.Fatalf("after the chapter: %+v", q.Main)
	}
	claim(t, learner, "main")
	state = gameState(t, learner)
	if state.Inventory["herb_salve"] != 2 {
		t.Fatalf("the guild's salves: %v", state.Inventory)
	}
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "enter_woods" || q.Main.Done {
		t.Fatalf("into the woods: %+v", q.Main)
	}
}

func TestTheStoryEnds(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	if _, err := h.pool.Exec(context.Background(),
		`update game_profiles set main_step = (select 1000)`); err != nil {
		t.Fatal(err)
	}
	if q := gameQuests(t, learner); q.Main != nil {
		t.Fatalf("past the last step: %+v", q.Main)
	}
	expectCode(t, learner.json("POST", "/api/game/quests/claim", map[string]any{"quest": "main"}),
		http.StatusConflict, "no_quest")
}

func TestTheDaysTasksPayOnceAndOpenTheChest(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	q := gameQuests(t, learner)
	if len(q.Daily) != 3 || q.Day == "" {
		t.Fatalf("today: %+v", q)
	}
	learning := false
	for _, d := range q.Daily {
		learning = learning || d.Learning
	}
	if !learning {
		t.Fatalf("no task in the app itself: %+v", q.Daily)
	}
	if again := gameQuests(t, learner); again.Daily[0].ID != q.Daily[0].ID || again.Daily[2].ID != q.Daily[2].ID {
		t.Fatal("asking twice gave different tasks")
	}

	// Nothing done yet: nothing to claim, and no chest.
	expectCode(t, learner.json("POST", "/api/game/quests/claim", map[string]any{"quest": q.Daily[0].ID}),
		http.StatusConflict, "not_done")
	expectCode(t, learner.json("POST", "/api/game/quests/claim", map[string]any{"quest": "chest"}),
		http.StatusConflict, "not_done")
	expectCode(t, learner.json("POST", "/api/game/quests/claim", map[string]any{"quest": "nonsense"}),
		http.StatusConflict, "no_quest")

	// Do all of it, by writing it down the way the game and the app would.
	ctx := context.Background()
	gameState(t, learner)
	if _, err := h.pool.Exec(ctx, `
		insert into game_events (user_id, kind, item, gold)
		select user_id, k.kind, k.item, k.gold from game_profiles,
		  (values ('plant', 'sprout', 0), ('harvest', 'apple', 15), ('buy', 'seed_sprout', -50))
		  as k(kind, item, gold),
		  generate_series(1, 4)`); err != nil {
		t.Fatal(err)
	}
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	h.recordScoredTake(t, learner, clip.ID, 80, map[string]float64{})
	h.recordScoredTake(t, learner, clip.ID, 80, map[string]float64{})
	if _, err := h.pool.Exec(ctx, `
		insert into vocab_words (user_id, word, reviewed_at)
		select user_id, w, now() from game_profiles, unnest(array['a','b','c','d','e']) w`); err != nil {
		t.Fatal(err)
	}

	q = gameQuests(t, learner)
	for _, d := range q.Daily {
		if !d.Done || d.Progress != d.Target {
			t.Fatalf("%s: %d of %d", d.ID, d.Progress, d.Target)
		}
	}
	gold := gameState(t, learner).Profile.Gold
	for _, d := range q.Daily {
		claim(t, learner, d.ID)
		expectCode(t, learner.json("POST", "/api/game/quests/claim", map[string]any{"quest": d.ID}),
			http.StatusConflict, "claimed")
	}
	if after := gameState(t, learner).Profile.Gold; after <= gold {
		t.Fatalf("gold %d after claiming, was %d", after, gold)
	}

	if q = gameQuests(t, learner); !q.Chest.Ready || q.Chest.Claimed || q.Chest.Streak != 0 {
		t.Fatalf("chest before opening: %+v", q.Chest)
	}
	bag := gameState(t, learner).Inventory
	claim(t, learner, "chest")
	// What is left to claim is the story step the planting above finished.
	if q = gameQuests(t, learner); !q.Chest.Claimed || q.Chest.Streak != 1 || q.Claimable != 1 || !q.Main.Done {
		t.Fatalf("chest after opening: %+v, claimable %d", q.Chest, q.Claimable)
	}
	if got := gameState(t, learner).Inventory; got["seed_bloom"] != bag["seed_bloom"]+1 {
		t.Fatalf("chest gave %v, bag was %v", got, bag)
	}
	expectCode(t, learner.json("POST", "/api/game/quests/claim", map[string]any{"quest": "chest"}),
		http.StatusConflict, "claimed")
}

func TestAChestStreakCountsDaysInARow(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	// Opened the chest on each of the two days before today, and four days ago.
	if _, err := h.pool.Exec(context.Background(), `
		insert into game_quest_claims (user_id, quest, day)
		select user_id, 'chest', ((now() at time zone 'Asia/Ho_Chi_Minh')::date - d)
		from game_profiles, unnest(array[1, 2, 4]) d`); err != nil {
		t.Fatal(err)
	}
	if q := gameQuests(t, learner); q.Chest.Streak != 2 || q.Chest.Claimed {
		t.Fatalf("streak %d before today's chest", q.Chest.Streak)
	}
}

func TestMovingIsRemembered(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	expectStatus(t, learner.json("POST", "/api/game/move", map[string]any{"map": "farm", "x": 120, "y": 340}),
		http.StatusNoContent)
	expectStatus(t, learner.json("POST", "/api/game/move", map[string]any{"map": "moon", "x": 1, "y": 1}),
		http.StatusBadRequest)
	if got := gameState(t, learner).Profile; got.X != 120 || got.Y != 340 {
		t.Fatalf("position %d,%d", got.X, got.Y)
	}
}

// A spot sent before the farm was ever opened starts the farm there, rather
// than being dropped and the player waking at the door.
func TestGameMoveBeforeFirstLook(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	expectStatus(t, learner.json("POST", "/api/game/move", map[string]any{"map": "farm", "x": 224, "y": 156}),
		http.StatusNoContent)
	got := gameState(t, learner).Profile
	if got.X != 224 || got.Y != 156 {
		t.Fatalf("position %d,%d", got.X, got.Y)
	}
	if got.Gold != 50 {
		t.Fatalf("a farm started by a move has %d gold, want the starting 50", got.Gold)
	}
}
