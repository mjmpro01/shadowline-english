package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/arena"
	"github.com/shadowline/server/internal/store"
)

// Word duels against the tower: the answer stays on the server, right answers
// hit, wrong ones are hit, a win pays once and opens the next floor.

type duelJSON struct {
	ID       int64  `json:"id"`
	Floor    int    `json:"floor"`
	State    string `json:"state"`
	HP       int    `json:"hp"`
	OppHP    int    `json:"oppHp"`
	Rage     int    `json:"rage"`
	Turn     int    `json:"turn"`
	Block    bool   `json:"block"`
	Question *struct {
		Kind    string   `json:"kind"`
		Prompt  string   `json:"prompt"`
		Options []string `json:"options"`
	} `json:"question"`
	Coins       int      `json:"coins"`
	XP          int      `json:"xp"`
	FirstClear  bool     `json:"firstClear"`
	Words       []string `json:"words"`
	Kind        string   `json:"kind"`
	RatingDelta int      `json:"ratingDelta"`
	Opponent    struct {
		ID     string `json:"id"`
		Atk    int    `json:"atk"`
		Rating int    `json:"rating"`
		Bot    bool   `json:"bot"`
		Name   struct {
			Vi string `json:"vi"`
		} `json:"name"`
	} `json:"opponent"`
}

type duelTurnJSON struct {
	Right  bool   `json:"right"`
	Late   bool   `json:"late"`
	Move   string `json:"move"`
	Dealt  int    `json:"dealt"`
	Taken  int    `json:"taken"`
	Answer string `json:"answer"`
}

type towerJSON struct {
	Floors []struct {
		Floor   int  `json:"floor"`
		Locked  bool `json:"locked"`
		Cleared bool `json:"cleared"`
	} `json:"floors"`
	Energy     int    `json:"energy"`
	Level      int    `json:"level"`
	XP         int    `json:"xp"`
	ActiveDuel *int64 `json:"activeDuel"`
}

func (h *harness) fighter(t *testing.T, email string) (*client, uuid.UUID) {
	t.Helper()
	c := h.login(email)
	expectStatus(t, c.json("POST", "/api/arena/fighter", beggar), http.StatusOK)
	return c, h.userID(t, email)
}

func (h *harness) startDuel(t *testing.T, c *client, floor int) duelJSON {
	t.Helper()
	return expect[struct {
		Duel duelJSON `json:"duel"`
	}](t, c.json("POST", "/api/arena/duel/start", map[string]any{"floor": floor}), http.StatusOK).Duel
}

func (h *harness) answer(t *testing.T, c *client, d duelJSON, answer string) (duelTurnJSON, duelJSON) {
	t.Helper()
	got := expect[struct {
		Turn duelTurnJSON `json:"turn"`
		Duel duelJSON     `json:"duel"`
	}](t, c.json("POST", "/api/arena/duel/answer", map[string]any{"id": d.ID, "turn": d.Turn, "answer": answer}), http.StatusOK)
	return got.Turn, got.Duel
}

func (h *harness) key(t *testing.T, user uuid.UUID) string {
	t.Helper()
	k, err := h.store.DuelAnswerKey(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func TestADuelIsRefusedWhenItCannotBe(t *testing.T) {
	h := newHarness(t)
	nobody := h.login("nobody@example.com")
	expectCode(t, nobody.json("POST", "/api/arena/duel/start", map[string]any{"floor": 1}), http.StatusConflict, "arena.noFighter")
	c, id := h.fighter(t, "fighter@example.com")
	expectCode(t, c.json("POST", "/api/arena/duel/start", map[string]any{"floor": 2}), http.StatusConflict, "duel.locked")
	expectStatus(t, c.json("POST", "/api/arena/duel/start", map[string]any{"floor": 99}), http.StatusNotFound)
	if err := h.store.SetFighterEnergy(context.Background(), id, 0, time.Now()); err != nil {
		t.Fatal(err)
	}
	expectCode(t, c.json("POST", "/api/arena/duel/start", map[string]any{"floor": 1}), http.StatusConflict, "duel.noEnergy")
	// Practice gives energy back: ten points, one duel.
	h.learn(t, id, store.ActTake, 5, time.Now())
	if tower := expect[towerJSON](t, c.json("GET", "/api/arena/tower", nil), http.StatusOK); tower.Energy != 1 {
		t.Fatalf("energy from practice: %+v", tower)
	}
}

func TestRightAnswersWinTheFloorAndPayOnce(t *testing.T) {
	h := newHarness(t)
	c, id := h.fighter(t, "winner@example.com")
	before := h.coins(t, id)
	d := h.startDuel(t, c, 1)
	if d.Question == nil || d.Turn != 1 || d.State != "active" || d.HP == 0 || d.OppHP != arena.Tower[0].HP {
		t.Fatalf("a new duel: %+v", d)
	}
	// Starting again is the same duel, not a second one.
	if again := h.startDuel(t, c, 1); again.ID != d.ID {
		t.Fatalf("a second duel: %+v", again)
	}
	// The question goes without its answer: what is right is decided here.
	resp := c.json("GET", "/api/arena/duel", nil)
	var raw struct {
		Duel struct {
			Question map[string]any `json:"question"`
		} `json:"duel"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if _, ok := raw.Duel.Question["answer"]; ok || len(raw.Duel.Question) == 0 {
		t.Fatalf("the question as sent: %v", raw.Duel.Question)
	}

	for range 40 {
		var turn duelTurnJSON
		turn, d = h.answer(t, c, d, h.key(t, id))
		if !turn.Right || turn.Dealt == 0 || turn.Taken != 0 {
			t.Fatalf("a right answer: %+v", turn)
		}
		if d.State != "active" {
			break
		}
	}
	o := arena.Tower[0]
	if d.State != "won" || !d.FirstClear || d.Coins != 2*o.Coins || d.XP != o.XP || d.Question != nil || len(d.Words) == 0 {
		t.Fatalf("won: %+v", d)
	}
	if got := h.coins(t, id); got != before+2*o.Coins {
		t.Fatalf("coins %d, want %d", got, before+2*o.Coins)
	}
	tower := expect[towerJSON](t, c.json("GET", "/api/arena/tower", nil), http.StatusOK)
	if !tower.Floors[0].Cleared || tower.Floors[1].Locked || !tower.Floors[2].Locked || tower.XP != o.XP || tower.Energy != arena.EnergyMax-1 || tower.ActiveDuel != nil {
		t.Fatalf("the tower after: %+v", tower)
	}
	// The second time it falls, it pays its plain price.
	d = h.startDuel(t, c, 1)
	for d.State == "active" {
		_, d = h.answer(t, c, d, h.key(t, id))
	}
	if d.FirstClear || d.Coins != o.Coins {
		t.Fatalf("again: %+v", d)
	}
}

func TestWrongAnswersLoseAndCostNothingMore(t *testing.T) {
	h := newHarness(t)
	c, id := h.fighter(t, "loser@example.com")
	before := h.coins(t, id)
	d := h.startDuel(t, c, 1)
	for range 60 {
		var turn duelTurnJSON
		turn, d = h.answer(t, c, d, "certainly not this")
		if turn.Right || turn.Taken == 0 || turn.Answer == "" {
			t.Fatalf("a wrong answer: %+v", turn)
		}
		if d.State != "active" {
			break
		}
	}
	if d.State != "lost" || d.HP != 0 || d.Coins != 0 {
		t.Fatalf("lost: %+v", d)
	}
	if got := h.coins(t, id); got != before {
		t.Fatalf("coins %d, want %d", got, before)
	}
	if tower := expect[towerJSON](t, c.json("GET", "/api/arena/tower", nil), http.StatusOK); !tower.Floors[1].Locked {
		t.Fatal("a loss opened the next floor")
	}
}

func TestALateAnswerIsWrongAndATurnIsPlayedOnce(t *testing.T) {
	h := newHarness(t)
	c, id := h.fighter(t, "late@example.com")
	d := h.startDuel(t, c, 1)
	ctx := context.Background()

	// Two answers to one turn at once: one is played.
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for range 2 {
		wg.Go(func() {
			resp := c.json("POST", "/api/arena/duel/answer", map[string]any{"id": d.ID, "turn": d.Turn, "answer": "x"})
			resp.Body.Close()
			statuses <- resp.StatusCode
		})
	}
	wg.Wait()
	close(statuses)
	got := map[int]int{}
	for s := range statuses {
		got[s]++
	}
	if got[http.StatusOK] != 1 || got[http.StatusConflict] != 1 {
		t.Fatalf("statuses: %v", got)
	}
	d = expect[struct {
		Duel duelJSON `json:"duel"`
	}](t, c.json("GET", "/api/arena/duel", nil), http.StatusOK).Duel
	if d.Turn != 2 {
		t.Fatalf("turn %d", d.Turn)
	}

	if _, err := h.pool.Exec(ctx, `update duels set deadline = now() - interval '10 seconds' where user_id = $1`, id); err != nil {
		t.Fatal(err)
	}
	turn, _ := h.answer(t, c, d, h.key(t, id))
	if !turn.Late || turn.Right || turn.Move != arena.MoveHit {
		t.Fatalf("late: %+v", turn)
	}
}

func TestASpecialLandsWhenRageIsFull(t *testing.T) {
	h := newHarness(t)
	c, id := h.fighter(t, "special@example.com")
	d := h.startDuel(t, c, 1)
	if _, err := h.pool.Exec(context.Background(), `update duels set rage = 100 where user_id = $1`, id); err != nil {
		t.Fatal(err)
	}
	got := expect[struct {
		Turn duelTurnJSON `json:"turn"`
		Duel duelJSON     `json:"duel"`
	}](t, c.json("POST", "/api/arena/duel/answer", map[string]any{"id": d.ID, "turn": d.Turn, "answer": h.key(t, id), "special": true}), http.StatusOK)
	if got.Turn.Move != arena.MoveSpecial || got.Duel.Rage != 0 || got.Turn.Dealt < 3*4-1 {
		t.Fatalf("special: %+v", got)
	}
}

func TestADuelSurvivesAReloadAndCanBeFled(t *testing.T) {
	h := newHarness(t)
	c, _ := h.fighter(t, "reload@example.com")
	d := h.startDuel(t, c, 1)
	back := expect[struct {
		Duel *duelJSON `json:"duel"`
	}](t, c.json("GET", "/api/arena/duel", nil), http.StatusOK).Duel
	if back == nil || back.ID != d.ID || back.Question == nil || back.Question.Prompt != d.Question.Prompt {
		t.Fatalf("after a reload: %+v", back)
	}
	expectStatus(t, c.json("POST", "/api/arena/duel/flee", nil), http.StatusNoContent)
	expectCode(t, c.json("POST", "/api/arena/duel/flee", nil), http.StatusConflict, "duel.over")
	if gone := expect[struct {
		Duel *duelJSON `json:"duel"`
	}](t, c.json("GET", "/api/arena/duel", nil), http.StatusOK).Duel; gone != nil {
		t.Fatalf("still there: %+v", gone)
	}
	expectCode(t, c.json("POST", "/api/arena/duel/answer", map[string]any{"id": d.ID, "turn": d.Turn, "answer": "x"}),
		http.StatusConflict, "duel.over")
}

func TestADuelReviewsTheLearnersOwnWords(t *testing.T) {
	h := newHarness(t)
	c, id := h.fighter(t, "reviewer@example.com")
	expectStatus(t, c.json("POST", "/api/vocab", map[string]any{"word": "water"}), http.StatusCreated)
	d := h.startDuel(t, c, 1)
	// With few words of their own, the first question is about one of them.
	turn, _ := h.answer(t, c, d, h.key(t, id))
	var status string
	var due time.Time
	if err := h.pool.QueryRow(context.Background(), `
		select status, due_at from vocab_words where user_id = $1 and word = 'water'`, id).Scan(&status, &due); err != nil {
		t.Fatal(err)
	}
	if !turn.Right || status != "known" || !due.After(time.Now()) {
		t.Fatalf("water after the duel: %s %v (%+v)", status, due, turn)
	}
}
