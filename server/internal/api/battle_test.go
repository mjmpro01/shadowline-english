package api_test

import (
	"context"
	"net/http"
	"testing"

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
		Inventory map[string]int `json:"inventory"`
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
