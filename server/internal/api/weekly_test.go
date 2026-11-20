package api_test

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/store"
)

// The weekly leaderboard: practice points this week, medals for last week's
// top three, given out once.

type weeklyJSON struct {
	Week string `json:"week"`
	Rows []struct {
		Rank   int    `json:"rank"`
		Name   string `json:"name"`
		Points int    `json:"points"`
		IsYou  bool   `json:"isYou"`
		Medals struct {
			Gold   int `json:"gold"`
			Silver int `json:"silver"`
			Bronze int `json:"bronze"`
		} `json:"medals"`
	} `json:"rows"`
	You *struct {
		Rank   int `json:"rank"`
		Points int `json:"points"`
	} `json:"you"`
	LastWeek []struct {
		Place int    `json:"place"`
		Name  string `json:"name"`
		IsYou bool   `json:"isYou"`
	} `json:"lastWeek"`
}

func (h *harness) learn(t *testing.T, user uuid.UUID, kind string, times int, at time.Time) {
	t.Helper()
	for range times {
		if _, err := h.store.LogActivity(context.Background(), user, kind, at); err != nil {
			t.Fatal(err)
		}
	}
}

func TestThisWeeksBoardIsPracticePoints(t *testing.T) {
	h := newHarness(t)
	a := h.login("a@example.com")
	h.login("b@example.com")
	ida, idb := h.userID(t, "a@example.com"), h.userID(t, "b@example.com")
	now := time.Now()
	start, _ := store.WeekOf(now)

	h.learn(t, ida, store.ActTake, 2, now)                        // 4 points
	h.learn(t, idb, store.ActDictation, 1, now)                   // 5 points
	h.learn(t, ida, store.ActDictation, 5, start.Add(-time.Hour)) // last week: not counted

	got := expect[weeklyJSON](t, a.json("GET", "/api/leaderboard/week", nil), http.StatusOK)
	if got.Week != start.Format("2006-01-02") || len(got.Rows) != 2 {
		t.Fatalf("board: %+v", got)
	}
	if !strings.EqualFold(got.Rows[0].Name, "b") || got.Rows[0].Points != 5 || got.Rows[1].Points != 4 || !got.Rows[1].IsYou || got.You != nil {
		t.Fatalf("order: %+v", got.Rows)
	}
}

func TestAViewerBelowTheBoardIsToldWhereTheyStand(t *testing.T) {
	h := newHarness(t)
	viewer := h.login("last@example.com")
	now := time.Now()
	for i := range 11 {
		email := uuid.NewString()[:8] + "@example.com"
		h.login(email)
		h.learn(t, h.userID(t, email), store.ActTake, 2+i, now)
	}
	h.learn(t, h.userID(t, "last@example.com"), store.ActReview, 1, now)
	got := expect[weeklyJSON](t, viewer.json("GET", "/api/leaderboard/week", nil), http.StatusOK)
	if len(got.Rows) != 10 || got.You == nil || got.You.Rank != 12 || got.You.Points != 1 {
		t.Fatalf("below the board: %d rows, you %+v", len(got.Rows), got.You)
	}
}

func TestLastWeeksTopThreeGetMedalsAndGoldOnce(t *testing.T) {
	h := newHarness(t)
	emails := []string{"first@example.com", "second@example.com", "third@example.com", "fourth@example.com"}
	clients := map[string]*client{}
	for _, e := range emails {
		clients[e] = h.login(e)
	}
	ctx := context.Background()
	now := time.Now()
	start, _ := store.WeekOf(now)
	lastWeek := start.AddDate(0, 0, -4)
	for i, e := range emails {
		h.learn(t, h.userID(t, e), store.ActTake, 10-2*i, lastWeek)
	}
	// The first plays the Arena; the second does not.
	expectStatus(t, clients["first@example.com"].json("GET", "/api/game/state", nil), http.StatusOK)
	first := h.userID(t, "first@example.com")
	before := h.gold(t, first)

	// Asked at once from several places: given out once.
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := h.store.SettleWeeks(ctx, now); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	got := expect[weeklyJSON](t, clients["second@example.com"].json("GET", "/api/leaderboard/week", nil), http.StatusOK)

	var awards int
	if err := h.pool.QueryRow(ctx, `select count(*) from weekly_awards`).Scan(&awards); err != nil || awards != 3 {
		t.Fatalf("%d awards, %v", awards, err)
	}
	if after := h.gold(t, first); after != before+store.WeeklyGold[0] {
		t.Fatalf("gold %d, want %d", after, before+store.WeeklyGold[0])
	}
	if len(got.LastWeek) != 3 || !strings.EqualFold(got.LastWeek[0].Name, "first") || !got.LastWeek[1].IsYou {
		t.Fatalf("last week's podium: %+v", got.LastWeek)
	}

	medals := expect[struct {
		Gold   int `json:"gold"`
		Recent []struct {
			Place int `json:"place"`
		} `json:"recent"`
	}](t, clients["first@example.com"].json("GET", "/api/medals", nil), http.StatusOK)
	if medals.Gold != 1 || len(medals.Recent) != 1 || medals.Recent[0].Place != 1 {
		t.Fatalf("medals: %+v", medals)
	}

	// This week, the first carries their medal on the board.
	h.learn(t, first, store.ActReview, 1, now)
	got = expect[weeklyJSON](t, clients["first@example.com"].json("GET", "/api/leaderboard/week", nil), http.StatusOK)
	if len(got.Rows) != 1 || got.Rows[0].Medals.Gold != 1 {
		t.Fatalf("medals on the board: %+v", got.Rows)
	}
}

func TestAnEmptyWeekIsSettledToo(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	expectStatus(t, learner.json("GET", "/api/leaderboard/week", nil), http.StatusOK)
	var settled int
	if err := h.pool.QueryRow(context.Background(), `select count(*) from weekly_settled`).Scan(&settled); err != nil || settled != 4 {
		t.Fatalf("%d weeks settled, %v", settled, err)
	}
}
