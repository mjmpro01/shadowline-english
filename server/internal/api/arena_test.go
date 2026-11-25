package api_test

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/shadowline/server/internal/store"
)

// The Arena: a fighter made once, as one of the free characters; more
// characters bought with coins earned by practising, owned once, played one
// at a time.

type arenaJSON struct {
	Coins   int `json:"coins"`
	Fighter *struct {
		Name      string `json:"name"`
		Character string `json:"character"`
		Level     int    `json:"level"`
	} `json:"fighter"`
	Stats struct {
		Atk int `json:"atk"`
		Def int `json:"def"`
		HP  int `json:"hp"`
	} `json:"stats"`
	Owned  []string `json:"owned"`
	Roster []struct {
		ID    string `json:"id"`
		Tier  string `json:"tier"`
		Price int    `json:"price"`
		Owned bool   `json:"owned"`
		Skill struct {
			Kind string `json:"kind"`
		} `json:"skill"`
	} `json:"roster"`
}

var beggar = map[string]any{"name": "Minh", "character": "beggar"}

func TestAFighterStartsAsAFreeCharacter(t *testing.T) {
	h := newHarness(t)
	c := h.login("fighter@example.com")

	got := expect[arenaJSON](t, c.json("GET", "/api/arena", nil), http.StatusOK)
	if got.Fighter != nil || got.Coins != 0 || len(got.Roster) != 24 {
		t.Fatalf("before a fighter: %+v", got)
	}
	expectCode(t, c.json("POST", "/api/arena/fighter", map[string]any{"name": "M", "character": "beggar"}),
		http.StatusBadRequest, "arena.invalid")
	// Only the free characters to start with.
	expectCode(t, c.json("POST", "/api/arena/fighter", map[string]any{"name": "Minh", "character": "thunder_monk"}),
		http.StatusBadRequest, "arena.invalid")
	got = expect[arenaJSON](t, c.json("POST", "/api/arena/fighter", map[string]any{"name": "Minh", "character": "street_kid"}), http.StatusOK)
	if got.Fighter == nil || got.Fighter.Name != "Minh" || got.Fighter.Character != "street_kid" || got.Fighter.Level != 1 ||
		len(got.Owned) != 2 {
		t.Fatalf("a new fighter: %+v", got)
	}
	expectCode(t, c.json("POST", "/api/arena/fighter", beggar), http.StatusConflict, "arena.exists")

	if got = expect[arenaJSON](t, c.json("PUT", "/api/arena/fighter", map[string]any{"name": "Minh Anh"}), http.StatusOK); got.Fighter.Name != "Minh Anh" {
		t.Fatalf("renamed: %+v", got.Fighter)
	}
	other := h.login("other@example.com")
	expectCode(t, other.json("PUT", "/api/arena/fighter", map[string]any{"name": "Lan"}), http.StatusConflict, "arena.noFighter")
	if theirs := expect[arenaJSON](t, other.json("GET", "/api/arena", nil), http.StatusOK); theirs.Fighter != nil {
		t.Fatalf("somebody else's fighter: %+v", theirs)
	}
}

func TestCharactersAreBoughtWithCoinsOnceAndPlayed(t *testing.T) {
	h := newHarness(t)
	c := h.login("buyer@example.com")
	id := h.userID(t, "buyer@example.com")
	buy := func(character string) *http.Response {
		return c.json("POST", "/api/arena/characters/buy", map[string]any{"character": character})
	}
	expectCode(t, buy("fisherman"), http.StatusConflict, "arena.noFighter")
	expectStatus(t, c.json("POST", "/api/arena/fighter", beggar), http.StatusOK)

	expectCode(t, buy("fisherman"), http.StatusConflict, "arena.notEnoughCoins")
	// Seventy-five takes: 150 coins, a fisherman's worth.
	h.learn(t, id, store.ActTake, 75, time.Now())
	if got := h.coins(t, id); got != 150+store.GoalCoins {
		t.Fatalf("coins from practice: %d", got)
	}
	expectStatus(t, buy("nobody"), http.StatusNotFound)
	expectCode(t, buy("street_kid"), http.StatusConflict, "arena.owned")

	// Tapped four times at once: bought once, paid once.
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			resp := buy("fisherman")
			resp.Body.Close()
		})
	}
	wg.Wait()
	got := expect[arenaJSON](t, c.json("GET", "/api/arena", nil), http.StatusOK)
	if got.Coins != store.GoalCoins || got.Fighter.Character != "beggar" || len(got.Owned) != 3 {
		t.Fatalf("after buying: %+v", got)
	}
	expectCode(t, buy("fisherman"), http.StatusConflict, "arena.owned")
	var spent int
	if err := h.pool.QueryRow(context.Background(), `
		select count(*) from coin_events where user_id = $1 and kind = 'buy' and item = 'fisherman'`, id).Scan(&spent); err != nil || spent != 1 {
		t.Fatalf("%d purchases (%v)", spent, err)
	}

	pick := func(character string) *http.Response {
		return c.json("POST", "/api/arena/characters/select", map[string]any{"character": character})
	}
	expectCode(t, pick("thunder_monk"), http.StatusConflict, "arena.notOwned")
	expectStatus(t, pick("nobody"), http.StatusNotFound)
	got = expect[arenaJSON](t, pick("fisherman"), http.StatusOK)
	if got.Fighter.Character != "fisherman" {
		t.Fatalf("playing: %+v", got.Fighter)
	}

	// A rare character is stronger than a common one.
	expectStatus(t, c.json("POST", "/api/test/coins", map[string]any{"coins": 700}), http.StatusNoContent)
	expectStatus(t, buy("stick_fighter"), http.StatusOK)
	before := got.Stats
	got = expect[arenaJSON](t, pick("stick_fighter"), http.StatusOK)
	if got.Stats.Atk != before.Atk+2 || got.Stats.Def != before.Def+1 || got.Stats.HP != before.HP+10 || got.Coins != 0 {
		t.Fatalf("rare: %+v then %+v", before, got.Stats)
	}
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
