package api_test

import (
	"context"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/shadowline/server/internal/game"
)

// Fights in the woods. The server asks, keeps the answer, and decides each
// turn; the tests read the answer from the database, which is exactly what the
// browser cannot do.

type battleJSON struct {
	ID        int64  `json:"id"`
	Spawn     string `json:"spawn"`
	MonsterHP int    `json:"monsterHp"`
	HP        int    `json:"hp"`
	State     string `json:"state"`
	Round     int    `json:"round"`
	Right     int    `json:"right"`
	Wrong     int    `json:"wrong"`
	Gold      int    `json:"gold"`
	Fine      int    `json:"fine"`
	Phase     int    `json:"phase"`
	Phases    int    `json:"phases"`
	IssuedAt  string `json:"issuedAt"`
	Deadline  string `json:"deadline"`
	Question  struct {
		Kind    string   `json:"kind"`
		Prompt  string   `json:"prompt"`
		Say     string   `json:"say"`
		Options []string `json:"options"`
		Answer  string   `json:"answer"`
		Word    string   `json:"word"`
	} `json:"question"`
}

type battleStateJSON struct {
	Battle battleJSON `json:"battle"`
	State  struct {
		Profile struct {
			Gold      int    `json:"gold"`
			Stamina   int    `json:"stamina"`
			HP        int    `json:"hp"`
			Map       string `json:"map"`
			WoodsOpen bool   `json:"woodsOpen"`
		} `json:"profile"`
		Spawns []struct {
			ID        string  `json:"id"`
			RespawnAt *string `json:"respawnAt"`
		} `json:"spawns"`
		UpgradeCosts []int          `json:"upgradeCosts"`
		Inventory    map[string]int `json:"inventory"`
	} `json:"state"`
	Turn struct {
		Right  bool   `json:"right"`
		Late   bool   `json:"late"`
		Answer string `json:"answer"`
		Strike int    `json:"strike"`
		Hit    int    `json:"hit"`
		Entry  struct {
			Word    string `json:"word"`
			IPA     string `json:"ipa"`
			Meaning string `json:"meaning"`
		} `json:"entry"`
	} `json:"turn"`
}

// openWoods puts a player's story at the woods.
func (h *harness) openWoods(t *testing.T, c *client) {
	t.Helper()
	gameState(t, c)
	if _, err := h.pool.Exec(context.Background(),
		`update game_profiles set main_step = $1, main_step_at = now()`, game.WoodsStep); err != nil {
		t.Fatalf("open woods: %v", err)
	}
}

func (h *harness) answerKey(t *testing.T) (string, string) {
	t.Helper()
	var answer, word string
	if err := h.pool.QueryRow(context.Background(),
		`select q_answer, q_word from game_battles where state = 'active'`).Scan(&answer, &word); err != nil {
		t.Fatalf("answer key: %v", err)
	}
	return answer, word
}

func startBattle(t *testing.T, c *client, spawn string) battleStateJSON {
	t.Helper()
	return expect[battleStateJSON](t, c.json("POST", "/api/game/battle/start", map[string]any{"spawn": spawn}), http.StatusOK)
}

func answer(t *testing.T, c *client, id int64, a string) battleStateJSON {
	t.Helper()
	return expect[battleStateJSON](t, c.json("POST", "/api/game/battle/answer",
		map[string]any{"battle": id, "answer": a}), http.StatusOK)
}

// wrongOption is any option that is not the answer (or nonsense, for letters).
func wrongOption(b battleJSON, right string) string {
	for _, o := range b.Question.Options {
		if o != right && b.Question.Kind != game.GameScramble {
			return o
		}
	}
	return "not it"
}

func TestTheWoodsWaitForTheStory(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	if s := gameState(t, learner); s.Profile.MainStep != 0 {
		t.Fatalf("a new farmer is at step %d", s.Profile.MainStep)
	}
	expectCode(t, learner.json("POST", "/api/game/battle/start", map[string]any{"spawn": "slime_1"}),
		http.StatusConflict, "woods_locked")
	expectCode(t, learner.json("POST", "/api/game/move", map[string]any{"map": "woods", "x": 10, "y": 10}),
		http.StatusConflict, "woods_locked")

	h.openWoods(t, learner)
	expectStatus(t, learner.json("POST", "/api/game/move", map[string]any{"map": "woods", "x": 10, "y": 10}),
		http.StatusNoContent)
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "enter_woods" || !q.Main.Done {
		t.Fatalf("walking into the woods is the step after the guild: %+v", q.Main)
	}
}

func TestAFightIsWonWithRightAnswers(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openWoods(t, learner)

	start := startBattle(t, learner, "slime_1")
	b := start.Battle
	if b.State != "active" || b.MonsterHP != 3 || start.State.Profile.Stamina != game.StaminaMax-game.FightCost {
		t.Fatalf("started: %+v, stamina %d", b, start.State.Profile.Stamina)
	}
	if b.Question.Answer != "" || b.Question.Word != "" {
		t.Fatal("the answer went to the browser")
	}
	if len(b.Question.Options) != 4 {
		t.Fatalf("a slime asks multiple choice: %+v", b.Question)
	}
	expectCode(t, learner.json("POST", "/api/game/battle/start", map[string]any{"spawn": "slime_2"}),
		http.StatusConflict, "in_battle")

	gold := start.State.Profile.Gold
	var last battleStateJSON
	for i := 0; i < 6 && b.State == "active"; i++ {
		right, _ := h.answerKey(t)
		last = answer(t, learner, b.ID, right)
		if !last.Turn.Right || last.Turn.Strike < 1 || last.Turn.Answer != right {
			t.Fatalf("right answer, turn %+v", last.Turn)
		}
		if last.Turn.Entry.Word == "" || last.Turn.Entry.Meaning == "" {
			t.Fatalf("the word is shown after the turn: %+v", last.Turn.Entry)
		}
		b = last.Battle
	}
	if b.State != "won" || b.Gold < 8 {
		t.Fatalf("after right answers: %+v", b)
	}
	if last.State.Profile.Gold != gold+b.Gold {
		t.Fatalf("gold %d, want %d", last.State.Profile.Gold, gold+b.Gold)
	}
	for _, sp := range last.State.Spawns {
		if (sp.ID == "slime_1") != (sp.RespawnAt != nil) {
			t.Fatalf("only the beaten slime is away: %+v", last.State.Spawns)
		}
	}
	expectCode(t, learner.json("POST", "/api/game/battle/start", map[string]any{"spawn": "slime_1"}),
		http.StatusConflict, "respawning")
	expectCode(t, learner.json("POST", "/api/game/battle/answer", map[string]any{"battle": b.ID, "answer": "x"}),
		http.StatusConflict, "battle_over")

	q := gameQuests(t, learner)
	if q.Main == nil || q.Main.ID != "enter_woods" {
		t.Fatalf("story: %+v", q.Main)
	}
}

func TestWrongAnswersHurtAndLosingSendsYouHome(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openWoods(t, learner)
	h.setGold(t, 300)

	b := startBattle(t, learner, "bat_1").Battle
	hp := b.HP
	var last battleStateJSON
	for i := 0; i < 20 && b.State == "active"; i++ {
		right, _ := h.answerKey(t)
		last = answer(t, learner, b.ID, wrongOption(b, right))
		if last.Turn.Right || last.Turn.Hit != 4 {
			t.Fatalf("a wrong answer to a bat: %+v", last.Turn)
		}
		b = last.Battle
		if b.State == "active" && b.HP != hp-4*(i+1) {
			t.Fatalf("health %d after %d hits from %d", b.HP, i+1, hp)
		}
	}
	if b.State != "lost" || b.Fine != 30 {
		t.Fatalf("after wrong answers: %+v", b)
	}
	p := last.State.Profile
	if p.Gold != 270 || p.HP != game.FaintHP || p.Map != "farm" {
		t.Fatalf("fainted: %+v", p)
	}
}

func TestAFightMovesTheWordsFlashcardSchedule(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openWoods(t, learner)
	// A vocabulary of the learner's own, big enough that every question is
	// about one of their words.
	words := []string{"water", "house", "music", "river", "green", "table", "cloud", "apple", "bread", "chair"}
	for _, w := range words {
		expectStatus(t, learner.json("POST", "/api/vocab", map[string]any{"word": w}), http.StatusCreated)
	}

	b := startBattle(t, learner, "slime_2").Battle
	right, word := h.answerKey(t)
	answer(t, learner, b.ID, right)
	var status string
	var interval int
	if err := h.pool.QueryRow(context.Background(),
		`select status, interval_days from vocab_words where word = $1`, word).Scan(&status, &interval); err != nil {
		t.Fatalf("%q is not one of the learner's words: %v", word, err)
	}
	if status != "known" || interval != 1 {
		t.Fatalf("recalled in a fight: %s, %d days", status, interval)
	}

	right, word = h.answerKey(t)
	_ = right
	answer(t, learner, b.ID, "certainly not this")
	if err := h.pool.QueryRow(context.Background(),
		`select status, interval_days from vocab_words where word = $1`, word).Scan(&status, &interval); err != nil {
		t.Fatal(err)
	}
	if status != "learning" || interval != 0 {
		t.Fatalf("missed in a fight: %s, %d days", status, interval)
	}
}

func TestFleeingEndsTheFightAndHealthComesBack(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openWoods(t, learner)

	b := startBattle(t, learner, "slime_3").Battle
	got := expect[battleStateJSON](t, learner.json("POST", "/api/game/battle/flee", map[string]any{"battle": b.ID}), http.StatusOK)
	if got.Battle.State != "fled" {
		t.Fatalf("fled: %+v", got.Battle)
	}
	if active := expect[struct {
		Battle *battleJSON `json:"battle"`
	}](t, learner.do("GET", "/api/game/battle", "", nil), http.StatusOK); active.Battle != nil {
		t.Fatalf("still in a fight: %+v", active.Battle)
	}
	// Fleeing is not beating: the slime is still there.
	startBattle(t, learner, "slime_3")

	if _, err := h.pool.Exec(context.Background(), `update game_profiles set hp = 3, hp_at = now()`); err != nil {
		t.Fatal(err)
	}
	expectCode(t, learner.json("POST", "/api/game/battle/start", map[string]any{"spawn": "slime_4"}),
		http.StatusConflict, "in_battle")
	if _, err := h.pool.Exec(context.Background(), `update game_battles set state = 'fled'`); err != nil {
		t.Fatal(err)
	}
	expectCode(t, learner.json("POST", "/api/game/battle/start", map[string]any{"spawn": "slime_4"}),
		http.StatusConflict, "no_hp")

	// A salve heals; sleep heals to full.
	if _, err := h.pool.Exec(context.Background(),
		`insert into game_inventory (user_id, item, qty) select user_id, 'herb_salve', 1 from game_profiles`); err != nil {
		t.Fatal(err)
	}
	state := expect[battleStateJSON](t, learner.json("POST", "/api/game/use", map[string]any{"item": "herb_salve"}), http.StatusOK)
	_ = state
	if hp := gameStateHP(t, learner); hp != 18 {
		t.Fatalf("a salve on 3 health: %d", hp)
	}
	expectStatus(t, learner.json("POST", "/api/game/sleep", map[string]any{}), http.StatusOK)
	if hp := gameStateHP(t, learner); hp != game.HPMax {
		t.Fatalf("slept: %d", hp)
	}
}

func gameStateHP(t *testing.T, c *client) int {
	t.Helper()
	s := expect[struct {
		Profile struct {
			HP int `json:"hp"`
		} `json:"profile"`
	}](t, c.do("GET", "/api/game/state", "", nil), http.StatusOK)
	return s.Profile.HP
}

func TestAFightIsYoursAlone(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	other := h.login("other@example.com")
	h.openWoods(t, learner)

	b := startBattle(t, learner, "slime_1").Battle
	expectCode(t, other.json("POST", "/api/game/battle/answer", map[string]any{"battle": b.ID, "answer": "x"}),
		http.StatusConflict, "battle_over")
	expectCode(t, other.json("POST", "/api/game/battle/flee", map[string]any{"battle": b.ID}),
		http.StatusConflict, "battle_over")
}

func TestChapterTwoCountsFightsAndAnswers(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openWoods(t, learner)
	expectStatus(t, learner.json("POST", "/api/game/move", map[string]any{"map": "woods", "x": 10, "y": 10}),
		http.StatusNoContent)
	claim(t, learner, "main") // into the woods

	win := func(spawn string) {
		b := startBattle(t, learner, spawn).Battle
		for i := 0; i < 8 && b.State == "active"; i++ {
			right, _ := h.answerKey(t)
			b = answer(t, learner, b.ID, right).Battle
		}
		if b.State != "won" {
			t.Fatalf("%s: %+v", spawn, b)
		}
	}
	win("slime_1")
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "first_win" || !q.Main.Done {
		t.Fatalf("first win: %+v", q.Main)
	}
	claim(t, learner, "main")
	h.setStamina(t, game.StaminaMax)
	win("bat_1") // a bat is not a slime
	win("slime_2")
	q := gameQuests(t, learner)
	if q.Main == nil || q.Main.ID != "five_slimes" || q.Main.Progress != 1 {
		t.Fatalf("slimes since the step began: %+v", q.Main)
	}
}

// setStep puts a player's story at a main-quest step.
func (h *harness) setStep(t *testing.T, step int) {
	t.Helper()
	if _, err := h.pool.Exec(context.Background(),
		`update game_profiles set main_step = $1, main_step_at = now()`, step); err != nil {
		t.Fatalf("set step: %v", err)
	}
}

func TestTheTrollFightsInPhasesAndGivesBackTheHammer(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openWoods(t, learner)

	// Before Bram asks, the lair is empty.
	h.setStep(t, game.TrollStep-1)
	for _, sp := range startBattle(t, learner, "shroom_1").State.Spawns {
		if sp.ID == "troll_lair" {
			t.Fatal("the troll is in its lair before the story sends the player there")
		}
	}
	var shroom int64
	if err := h.pool.QueryRow(context.Background(),
		`select id from game_battles where state = 'active'`).Scan(&shroom); err != nil {
		t.Fatal(err)
	}
	expectStatus(t, learner.json("POST", "/api/game/battle/flee", map[string]any{"battle": shroom}), http.StatusOK)
	expectCode(t, learner.json("POST", "/api/game/battle/start", map[string]any{"spawn": "troll_lair"}),
		http.StatusConflict, "lair_closed")

	h.setStep(t, game.TrollStep)
	start := startBattle(t, learner, "troll_lair")
	b := start.Battle
	if b.Phases != 3 || b.Phase != 1 || b.MonsterHP != 12 {
		t.Fatalf("the troll's fight begins: %+v", b)
	}
	// Quick right answers strike twice: 12, 10 in the first phase, 8, 6 in
	// the second, 4, 2 in the last — each asking its own kinds, faster.
	kinds := map[int][]string{
		1: {game.GameMeaning, game.GameListen},
		2: {game.GameListen, game.GameIPA},
		3: {game.GameScramble, game.GameIPA},
	}
	for b.State == "active" {
		want := 1 + (12-b.MonsterHP)/4
		if b.Phase != want || !slices.Contains(kinds[want], b.Question.Kind) {
			t.Fatalf("at %d health: phase %d asking %s", b.MonsterHP, b.Phase, b.Question.Kind)
		}
		if want == 3 && b.Question.Kind == game.GameIPA {
			issued, _ := time.Parse(time.RFC3339Nano, b.IssuedAt)
			deadline, _ := time.Parse(time.RFC3339Nano, b.Deadline)
			if deadline.Sub(issued) != 8*time.Second {
				t.Fatalf("the last phase gives %v", deadline.Sub(issued))
			}
		}
		right, _ := h.answerKey(t)
		b = answer(t, learner, b.ID, right).Battle
	}
	if b.State != "won" || b.Gold != 60+20 {
		t.Fatalf("the troll beaten: %+v", b)
	}
	// It is back tomorrow, not in ten minutes.
	after := expect[struct {
		Spawns []struct {
			ID        string  `json:"id"`
			RespawnAt *string `json:"respawnAt"`
		} `json:"spawns"`
	}](t, learner.json("GET", "/api/game/state", nil), http.StatusOK)
	for _, sp := range after.Spawns {
		if sp.ID == "troll_lair" {
			back, _ := time.Parse(time.RFC3339Nano, *sp.RespawnAt)
			if until := time.Until(back); until < 23*time.Hour || until > 25*time.Hour {
				t.Fatalf("the troll is back in %v", until)
			}
		}
	}

	// Bram's request is done; his hammer comes with the reward, and with it
	// a fourth level of soil.
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "brams_hammer" || !q.Main.Done {
		t.Fatalf("after the troll: %+v", q.Main)
	}
	h.setGold(t, 2000)
	if _, err := h.pool.Exec(context.Background(), `update game_plots set level = 3 where idx = 0`); err != nil {
		t.Fatal(err)
	}
	expectCode(t, learner.json("POST", "/api/game/upgrade", map[string]any{"plot": 0}),
		http.StatusConflict, "max_level")
	claim(t, learner, "main")
	got := gameState(t, learner)
	if got.Inventory["bram_hammer"] != 1 || got.Inventory["seed_golden"] < 1 {
		t.Fatalf("Bram's reward: %v", got.Inventory)
	}
	up := expect[gameStateJSON](t, learner.json("POST", "/api/game/upgrade", map[string]any{"plot": 0}), http.StatusOK)
	if up.Plots[0].Level != game.HammerLevel || up.Profile.Gold != 2000+100-game.UpgradeCost(3) {
		t.Fatalf("with the hammer: level %d, gold %d", up.Plots[0].Level, up.Profile.Gold)
	}
	expectCode(t, learner.json("POST", "/api/game/upgrade", map[string]any{"plot": 0}),
		http.StatusConflict, "max_level")

	// The chapter ends with Sir Shadow and the smoke over Echo.
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "smoke" || !q.Main.Done {
		t.Fatalf("the chapter's end: %+v", q.Main)
	}
	claim(t, learner, "main")
	if q := gameQuests(t, learner); q.Main != nil {
		t.Fatalf("after chapter 2: %+v", q.Main)
	}
}
