package api_test

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/arena"
	"github.com/shadowline/server/internal/store"
)

// Duels against shadows: the nearest-rated rivals, a rating that moves, a
// week on the Arena board, and its top three paid once.

type rivalJSON struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Level  int    `json:"level"`
	Rating int    `json:"rating"`
	Bot    bool   `json:"bot"`
}

type arenaBoardJSON struct {
	Rows []struct {
		Rank   int    `json:"rank"`
		Name   string `json:"name"`
		Points int    `json:"points"`
		Wins   int    `json:"wins"`
		IsYou  bool   `json:"isYou"`
	} `json:"rows"`
	LastWeek []struct {
		Place int  `json:"place"`
		IsYou bool `json:"isYou"`
	} `json:"lastWeek"`
}

func (h *harness) rate(t *testing.T, user uuid.UUID, rating int) {
	t.Helper()
	if _, err := h.pool.Exec(context.Background(), `update fighters set rating = $2 where user_id = $1`, user, rating); err != nil {
		t.Fatal(err)
	}
}

func (h *harness) startPvP(t *testing.T, c *client, rival string) duelJSON {
	t.Helper()
	return expect[struct {
		Duel duelJSON `json:"duel"`
	}](t, c.json("POST", "/api/arena/pvp/start", map[string]any{"rival": rival}), http.StatusOK).Duel
}

func (h *harness) playOut(t *testing.T, c *client, user uuid.UUID, d duelJSON, right bool) duelJSON {
	t.Helper()
	for range 60 {
		answer := "surely not this"
		if right {
			answer = h.key(t, user)
		}
		_, d = h.answer(t, c, d, answer)
		if d.State != "active" {
			return d
		}
	}
	t.Fatalf("the duel never ended: %+v", d)
	return d
}

func TestRivalsAreTheNearestRatedAndBotsMakeUpTheRest(t *testing.T) {
	h := newHarness(t)
	a, ida := h.fighter(t, "a@example.com")
	_, idb := h.fighter(t, "b@example.com")
	_, idc := h.fighter(t, "c@example.com")
	h.rate(t, ida, 1000)
	h.rate(t, idb, 1400)
	h.rate(t, idc, 1050)

	rivals := expect[[]rivalJSON](t, a.json("GET", "/api/arena/rivals", nil), http.StatusOK)
	if len(rivals) != 3 || rivals[0].ID != idc.String() || rivals[1].ID != idb.String() || !rivals[2].Bot {
		t.Fatalf("rivals: %+v", rivals)
	}
	for _, r := range rivals {
		if r.ID == ida.String() {
			t.Fatal("offered their own shadow")
		}
	}
	expectCode(t, a.json("POST", "/api/arena/pvp/start", map[string]any{"rival": ida.String()}), http.StatusConflict, "pvp.self")
	expectStatus(t, a.json("POST", "/api/arena/pvp/start", map[string]any{"rival": uuid.NewString()}), http.StatusNotFound)
	expectStatus(t, a.json("POST", "/api/arena/pvp/start", map[string]any{"rival": "bot:99"}), http.StatusNotFound)

	// Fought today: not offered again until tomorrow.
	d := h.startPvP(t, a, idc.String())
	h.playOut(t, a, ida, d, true)
	rivals = expect[[]rivalJSON](t, a.json("GET", "/api/arena/rivals", nil), http.StatusOK)
	for _, r := range rivals {
		if r.ID == idc.String() {
			t.Fatalf("offered again: %+v", rivals)
		}
	}
}

func TestBeatingAShadowMovesTheRatingAndCountsOnTheBoard(t *testing.T) {
	h := newHarness(t)
	a, ida := h.fighter(t, "attacker@example.com")
	b, idb := h.fighter(t, "defender@example.com")
	expectStatus(t, b.json("POST", "/api/test/coins", map[string]any{"coins": 500}), http.StatusNoContent)
	expectStatus(t, b.json("POST", "/api/arena/buy", map[string]any{"item": "bo_staff"}), http.StatusOK)
	expectStatus(t, b.json("POST", "/api/arena/equip", map[string]any{"item": "bo_staff"}), http.StatusOK)
	before := h.coins(t, ida)

	d := h.startPvP(t, a, idb.String())
	if d.Kind != "pvp" || d.Opponent.ID != idb.String() || d.Opponent.Atk != arena.Base(1).Atk+4 || d.Opponent.Rating != arena.StartRating {
		t.Fatalf("the shadow: %+v", d)
	}
	// Their gear changing mid-duel changes nothing: the shadow was kept as fought.
	expectStatus(t, b.json("POST", "/api/arena/equip", map[string]any{"slot": "weapon"}), http.StatusOK)
	back := expect[struct {
		Duel duelJSON `json:"duel"`
	}](t, a.json("GET", "/api/arena/duel", nil), http.StatusOK).Duel
	if back.Opponent.Atk != d.Opponent.Atk {
		t.Fatalf("the shadow changed mid-duel: %+v", back.Opponent)
	}

	d = h.playOut(t, a, ida, d, true)
	if d.State != "won" || d.RatingDelta != 16 || d.Coins != arena.PvPCoins(1, 1) || d.XP != arena.PvPXP {
		t.Fatalf("won: %+v", d)
	}
	if got := h.coins(t, ida); got != before+d.Coins {
		t.Fatalf("coins %d, want %d", got, before+d.Coins)
	}
	tower := expect[towerJSON](t, a.json("GET", "/api/arena/tower", nil), http.StatusOK)
	if !tower.Floors[1].Locked {
		t.Fatal("a shadow opened the tower")
	}
	var mine, theirs, wins int
	if err := h.pool.QueryRow(context.Background(), `
		select (select rating from fighters where user_id = $1), (select rating from fighters where user_id = $2),
		       (select pvp_wins from fighters where user_id = $1)`, ida, idb).Scan(&mine, &theirs, &wins); err != nil {
		t.Fatal(err)
	}
	if mine != arena.StartRating+16 || theirs != arena.StartRating || wins != 1 {
		t.Fatalf("ratings %d / %d, wins %d", mine, theirs, wins)
	}
	board := expect[arenaBoardJSON](t, b.json("GET", "/api/arena/board", nil), http.StatusOK)
	if len(board.Rows) != 1 || board.Rows[0].Wins != 1 || board.Rows[0].Points != 3 || board.Rows[0].IsYou {
		t.Fatalf("the board: %+v", board)
	}

	// And losing costs rating.
	d = h.startPvP(t, a, "bot:1")
	if !d.Opponent.Bot {
		t.Fatalf("a bot: %+v", d.Opponent)
	}
	d = h.playOut(t, a, ida, d, false)
	if d.State != "lost" || d.RatingDelta >= 0 || d.Coins != 0 {
		t.Fatalf("lost: %+v", d)
	}
}

func TestTheArenaWeekPaysItsTopThreeOnce(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	now := time.Now()
	start, _ := store.WeekOf(now)
	lastWeek := start.AddDate(0, 0, -7).Format("2006-01-02")
	emails := []string{"one@example.com", "two@example.com", "three@example.com", "four@example.com"}
	var ids []uuid.UUID
	for i, e := range emails {
		_, id := h.fighter(t, e)
		ids = append(ids, id)
		if _, err := h.pool.Exec(ctx, `insert into arena_week_points (user_id, week, wins, points) values ($1, $2, $3, $4)`,
			id, lastWeek, 4-i, 12-3*i); err != nil {
			t.Fatal(err)
		}
	}
	before := h.coins(t, ids[0])
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			if err := h.store.SettleArenaWeeks(ctx, now); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	var awards int
	if err := h.pool.QueryRow(ctx, `select count(*) from arena_awards`).Scan(&awards); err != nil || awards != 3 {
		t.Fatalf("%d awards (%v)", awards, err)
	}
	if got := h.coins(t, ids[0]); got != before+store.ArenaWeekGold[0] {
		t.Fatalf("coins %d", got)
	}
	first := h.login("one@example.com")
	board := expect[arenaBoardJSON](t, first.json("GET", "/api/arena/board", nil), http.StatusOK)
	if len(board.LastWeek) != 3 || !board.LastWeek[0].IsYou {
		t.Fatalf("last week: %+v", board.LastWeek)
	}
}

func TestAnOldTowerDuelIsReadByItsFloor(t *testing.T) {
	h := newHarness(t)
	c, id := h.fighter(t, "old@example.com")
	h.startDuel(t, c, 1)
	if _, err := h.pool.Exec(context.Background(), `update duels set opponent = null where user_id = $1`, id); err != nil {
		t.Fatal(err)
	}
	d := expect[struct {
		Duel duelJSON `json:"duel"`
	}](t, c.json("GET", "/api/arena/duel", nil), http.StatusOK).Duel
	if d.Kind != "tower" || d.Opponent.ID != "pickpocket" {
		t.Fatalf("an old duel: %+v", d)
	}
	_, d = h.answer(t, c, d, h.key(t, id))
	if d.State != "active" && d.State != "won" {
		t.Fatalf("played on: %+v", d)
	}
}
