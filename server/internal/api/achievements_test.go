package api_test

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/store"
)

// Milestone achievements: unlocked from what is already recorded, celebrated
// once, paid once.

type achievementJSON struct {
	ID     string `json:"id"`
	Track  string `json:"track"`
	Target int    `json:"target"`
	Gold   int    `json:"gold"`
}

type achievementBoardJSON struct {
	Tracks []struct {
		Track string `json:"track"`
		Count int    `json:"count"`
		Tiers []struct {
			ID         string     `json:"id"`
			Target     int        `json:"target"`
			Gold       int        `json:"gold"`
			UnlockedAt *time.Time `json:"unlockedAt"`
		} `json:"tiers"`
	} `json:"tracks"`
	Unlocked int `json:"unlocked"`
	Total    int `json:"total"`
}

func (b achievementBoardJSON) count(track string) int {
	for _, t := range b.Tracks {
		if t.Track == track {
			return t.Count
		}
	}
	return -1
}

func (b achievementBoardJSON) unlocked(id string) bool {
	for _, t := range b.Tracks {
		for _, tier := range t.Tiers {
			if tier.ID == id {
				return tier.UnlockedAt != nil
			}
		}
	}
	return false
}

func (h *harness) plantMedals(t *testing.T, user uuid.UUID, n int) {
	t.Helper()
	for i := range n {
		// Weeks far apart from any other test's, one place each.
		week := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, 7*i+7*int(user[0]))
		if _, err := h.pool.Exec(context.Background(), `
			insert into weekly_awards (week, place, user_id, points) values ($1, 1, $2, 10)`, week, user); err != nil {
			t.Fatal(err)
		}
	}
}

func TestTheCatalogClimbs(t *testing.T) {
	seen := map[string]bool{}
	for _, track := range store.Achievements {
		if len(track.Targets) == 0 || len(track.Targets) > len(store.AchievementGold) {
			t.Fatalf("%s has %d tiers", track.Track, len(track.Targets))
		}
		for i, target := range track.Targets {
			id := store.AchievementID(track.Track, target)
			if seen[id] || target < 1 || i > 0 && target <= track.Targets[i-1] {
				t.Fatalf("%s: tier %d does not climb", id, i)
			}
			seen[id] = true
		}
	}
}

func TestAFirstTakeIsCelebratedOnce(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clips := publishClips(t, admin, aClip("Line one"))
	learner := h.login("learner@example.com")

	if got := expect[[]achievementJSON](t, learner.json("GET", "/api/achievements/new", nil), http.StatusOK); len(got) != 0 {
		t.Fatalf("a new learner has nothing yet: %+v", got)
	}
	record(t, learner, clips[0].ID)

	got := expect[[]achievementJSON](t, learner.json("GET", "/api/achievements/new", nil), http.StatusOK)
	if len(got) != 1 || got[0].ID != "takes.1" || got[0].Track != "takes" || got[0].Target != 1 || got[0].Gold != 0 {
		t.Fatalf("first take: %+v", got)
	}
	// Somebody else cannot mark it seen for them.
	other := h.login("other@example.com")
	expectStatus(t, other.json("POST", "/api/achievements/seen", map[string]any{"ids": []string{"takes.1"}}), http.StatusNoContent)
	if again := expect[[]achievementJSON](t, learner.json("GET", "/api/achievements/new", nil), http.StatusOK); len(again) != 1 {
		t.Fatalf("marked seen by somebody else: %+v", again)
	}

	expectStatus(t, learner.json("POST", "/api/achievements/seen", map[string]any{"ids": []string{"takes.1"}}), http.StatusNoContent)
	if again := expect[[]achievementJSON](t, learner.json("GET", "/api/achievements/new", nil), http.StatusOK); len(again) != 0 {
		t.Fatalf("celebrated twice: %+v", again)
	}
	expectStatus(t, learner.json("POST", "/api/achievements/seen", map[string]any{"ids": []string{}}), http.StatusBadRequest)

	board := expect[achievementBoardJSON](t, learner.json("GET", "/api/achievements", nil), http.StatusOK)
	if board.Unlocked != 1 || board.Total < 20 || board.count("takes") != 1 || !board.unlocked("takes.1") || board.unlocked("takes.50") {
		t.Fatalf("board: %+v", board)
	}
}

func TestAchievementGoldIsPaidOnce(t *testing.T) {
	h := newHarness(t)
	player := h.login("player@example.com")
	expectStatus(t, player.json("GET", "/api/game/state", nil), http.StatusOK)
	id := h.userID(t, "player@example.com")
	before := h.gold(t, id)
	h.plantMedals(t, id, 1)

	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			if _, err := h.store.SyncAchievements(context.Background(), id, time.Now()); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	expectStatus(t, player.json("GET", "/api/achievements", nil), http.StatusOK)

	if got := h.gold(t, id) - before; got != store.AchievementGold[0] {
		t.Fatalf("paid %d gold, want %d", got, store.AchievementGold[0])
	}
	var events int
	if err := h.pool.QueryRow(context.Background(),
		`select count(*) from game_events where user_id = $1 and kind = 'achievement'`, id).Scan(&events); err != nil || events != 1 {
		t.Fatalf("%d events (%v)", events, err)
	}
	got := expect[[]achievementJSON](t, player.json("GET", "/api/achievements/new", nil), http.StatusOK)
	if len(got) != 1 || got[0].ID != "medal.1" || got[0].Gold != store.AchievementGold[0] {
		t.Fatalf("new: %+v", got)
	}
}

func TestLearnersFromBeforeAreNotFloodedWithCelebrations(t *testing.T) {
	h := newHarness(t)
	old := h.login("old@example.com")
	id := h.userID(t, "old@example.com")
	ctx := context.Background()
	// As the migration leaves a learner who was already here.
	if _, err := h.pool.Exec(ctx, `insert into achievement_quiet (user_id) values ($1)`, id); err != nil {
		t.Fatal(err)
	}
	h.plantMedals(t, id, 4)

	if got := expect[[]achievementJSON](t, old.json("GET", "/api/achievements/new", nil), http.StatusOK); len(got) != 0 {
		t.Fatalf("flooded: %+v", got)
	}
	board := expect[achievementBoardJSON](t, old.json("GET", "/api/achievements", nil), http.StatusOK)
	if !board.unlocked("medal.1") || board.unlocked("medal.5") {
		t.Fatalf("what they had is still theirs: %+v", board)
	}
	// From now on they are celebrated like anybody.
	if _, err := h.pool.Exec(ctx, `
		insert into weekly_awards (week, place, user_id, points) values ('1999-01-04', 1, $1, 10)`, id); err != nil {
		t.Fatal(err)
	}
	got := expect[[]achievementJSON](t, old.json("GET", "/api/achievements/new", nil), http.StatusOK)
	if len(got) != 1 || got[0].ID != "medal.5" {
		t.Fatalf("next one: %+v", got)
	}
}

func TestEveryTrackCountsItsOwnLearning(t *testing.T) {
	h := newHarness(t)
	c := h.login("busy@example.com")
	id := h.userID(t, "busy@example.com")
	ctx := context.Background()

	// Three days in a row with the goal reached: 4 dictations is 20 points.
	now := time.Now()
	for d := 2; d >= 0; d-- {
		h.learn(t, id, store.ActDictation, 4, now.AddDate(0, 0, -d))
	}
	for i := range 10 {
		if _, err := h.pool.Exec(ctx, `
			insert into vocab_words (user_id, word, status) values ($1, $2, 'known')`, id, uuid.NewString()[:8]+string(rune('a'+i))); err != nil {
			t.Fatal(err)
		}
	}
	var roleplay uuid.UUID
	if err := h.pool.QueryRow(ctx, `
		insert into roleplays (user_id, scenario, title) values ($1, 'interview', 'Job') returning id`, id).Scan(&roleplay); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, `
		insert into roleplay_turns (roleplay_id, role, content) values ($1, 'user', 'Hi'), ($1, 'assistant', 'Hello'), ($1, 'user', 'Bye')`, roleplay); err != nil {
		t.Fatal(err)
	}
	h.plantMedals(t, id, 2)

	board := expect[achievementBoardJSON](t, c.json("GET", "/api/achievements", nil), http.StatusOK)
	want := map[string]int{"streak": 3, "goal": 3, "words": 10, "tutor": 2, "medal": 2, "takes": 0, "dictation": 0}
	for track, n := range want {
		if got := board.count(track); got != n {
			t.Errorf("%s counts %d, want %d", track, got, n)
		}
	}
	for _, id := range []string{"streak.3", "goal.1", "words.10", "tutor.1", "medal.1"} {
		if !board.unlocked(id) {
			t.Errorf("%s not unlocked", id)
		}
	}
	if board.unlocked("streak.7") || board.unlocked("takes.1") {
		t.Errorf("unlocked too much: %+v", board)
	}
}
