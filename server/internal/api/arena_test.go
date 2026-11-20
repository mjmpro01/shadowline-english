package api_test

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/shadowline/server/internal/store"
)

// The Arena: a fighter made once, dressed as a beggar; gear bought with coins
// earned by practising, owned once, worn in its slot.

type arenaJSON struct {
	Coins   int `json:"coins"`
	Fighter *struct {
		Name  string `json:"name"`
		Body  string `json:"body"`
		Skin  int    `json:"skin"`
		Hair  int    `json:"hair"`
		Level int    `json:"level"`
	} `json:"fighter"`
	Stats struct {
		Atk int `json:"atk"`
		Def int `json:"def"`
		HP  int `json:"hp"`
	} `json:"stats"`
	Equipped map[string]string `json:"equipped"`
	Owned    []string          `json:"owned"`
	Shop     []struct {
		ID    string `json:"id"`
		Slot  string `json:"slot"`
		Price int    `json:"price"`
		Owned bool   `json:"owned"`
	} `json:"shop"`
}

var beggar = map[string]any{"name": "Minh", "body": "a", "skin": 1, "hair": 2}

func TestAFighterStartsAsABeggar(t *testing.T) {
	h := newHarness(t)
	c := h.login("fighter@example.com")

	got := expect[arenaJSON](t, c.json("GET", "/api/arena", nil), http.StatusOK)
	if got.Fighter != nil || got.Coins != 0 || len(got.Shop) == 0 {
		t.Fatalf("before a fighter: %+v", got)
	}
	expectCode(t, c.json("POST", "/api/arena/fighter", map[string]any{"name": "M", "body": "a", "skin": 0, "hair": 0}),
		http.StatusBadRequest, "arena.invalid")
	got = expect[arenaJSON](t, c.json("POST", "/api/arena/fighter", beggar), http.StatusOK)
	if got.Fighter == nil || got.Fighter.Name != "Minh" || got.Fighter.Level != 1 ||
		got.Equipped["body"] != "rags" || got.Equipped["hands"] != "bare_fists" || got.Equipped["feet"] != "bare_feet" ||
		got.Equipped["weapon"] != "" || len(got.Owned) != 3 {
		t.Fatalf("a beggar: %+v", got)
	}
	expectCode(t, c.json("POST", "/api/arena/fighter", beggar), http.StatusConflict, "arena.exists")

	changed := map[string]any{"name": "Minh Anh", "body": "b", "skin": 3, "hair": 0}
	if got = expect[arenaJSON](t, c.json("PUT", "/api/arena/fighter", changed), http.StatusOK); got.Fighter.Body != "b" || got.Fighter.Name != "Minh Anh" {
		t.Fatalf("a new look: %+v", got.Fighter)
	}
	other := h.login("other@example.com")
	expectCode(t, other.json("PUT", "/api/arena/fighter", changed), http.StatusConflict, "arena.noFighter")
	if theirs := expect[arenaJSON](t, other.json("GET", "/api/arena", nil), http.StatusOK); theirs.Fighter != nil {
		t.Fatalf("somebody else's fighter: %+v", theirs)
	}
}

func TestGearIsBoughtWithCoinsOnceAndWorn(t *testing.T) {
	h := newHarness(t)
	c := h.login("buyer@example.com")
	id := h.userID(t, "buyer@example.com")
	expectCode(t, c.json("POST", "/api/arena/buy", map[string]any{"item": "straw_hat"}), http.StatusConflict, "arena.noFighter")
	expectStatus(t, c.json("POST", "/api/arena/fighter", beggar), http.StatusOK)

	expectCode(t, c.json("POST", "/api/arena/buy", map[string]any{"item": "straw_hat"}), http.StatusConflict, "arena.notEnoughCoins")
	// Thirty takes: sixty coins, a straw hat's worth.
	h.learn(t, id, store.ActTake, 30, time.Now())
	if got := h.coins(t, id); got != 60+store.GoalCoins {
		t.Fatalf("coins from practice: %d", got)
	}
	expectStatus(t, c.json("POST", "/api/arena/buy", map[string]any{"item": "nothing"}), http.StatusNotFound)
	expectStatus(t, c.json("POST", "/api/arena/buy", map[string]any{"item": "rags"}), http.StatusNotFound)

	// Tapped four times at once: bought once, paid once.
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			resp := c.json("POST", "/api/arena/buy", map[string]any{"item": "straw_hat"})
			resp.Body.Close()
		})
	}
	wg.Wait()
	got := expect[arenaJSON](t, c.json("GET", "/api/arena", nil), http.StatusOK)
	if got.Coins != store.GoalCoins || got.Equipped["head"] != "" {
		t.Fatalf("after buying: %+v", got)
	}
	expectCode(t, c.json("POST", "/api/arena/buy", map[string]any{"item": "straw_hat"}), http.StatusConflict, "arena.owned")
	var spent int
	if err := h.pool.QueryRow(context.Background(), `
		select count(*) from coin_events where user_id = $1 and kind = 'buy'`, id).Scan(&spent); err != nil || spent != 1 {
		t.Fatalf("%d purchases (%v)", spent, err)
	}

	expectCode(t, c.json("POST", "/api/arena/equip", map[string]any{"item": "iron_helm"}), http.StatusConflict, "arena.notOwned")
	got = expect[arenaJSON](t, c.json("POST", "/api/arena/equip", map[string]any{"item": "straw_hat"}), http.StatusOK)
	if got.Equipped["head"] != "straw_hat" || got.Stats.Def != 0+1 {
		t.Fatalf("wearing it: %+v", got)
	}
	got = expect[arenaJSON](t, c.json("POST", "/api/arena/equip", map[string]any{"slot": "head"}), http.StatusOK)
	if got.Equipped["head"] != "" {
		t.Fatalf("taken off: %+v", got.Equipped)
	}
	// The rags cannot come off; a better body goes over them instead.
	expectCode(t, c.json("POST", "/api/arena/equip", map[string]any{"slot": "body"}), http.StatusConflict, "arena.bare")
	expectStatus(t, c.json("POST", "/api/arena/equip", map[string]any{"slot": "elbow"}), http.StatusNotFound)
}

func TestTheWalletSaysWhereCoinsCameFrom(t *testing.T) {
	h := newHarness(t)
	c := h.login("wallet@example.com")
	id := h.userID(t, "wallet@example.com")
	h.learn(t, id, store.ActDictation, 1, time.Now())
	got := expect[struct {
		Coins  int `json:"coins"`
		Today  int `json:"today"`
		Recent []struct {
			Kind   string `json:"kind"`
			Item   string `json:"item"`
			Amount int    `json:"amount"`
		} `json:"recent"`
	}](t, c.json("GET", "/api/wallet", nil), http.StatusOK)
	if got.Coins != 5 || got.Today != 5 || len(got.Recent) != 1 || got.Recent[0].Kind != "practice" ||
		got.Recent[0].Item != store.ActDictation || got.Recent[0].Amount != 5 {
		t.Fatalf("wallet: %+v", got)
	}
}
