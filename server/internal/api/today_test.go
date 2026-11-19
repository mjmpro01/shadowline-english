package api_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/store"
)

// A learner's day: points toward a goal, a streak kept on the server, and the
// list of what is left; and the console's view of who comes back.

type todayJSON struct {
	Goal       int  `json:"goal"`
	GoalChosen bool `json:"goalChosen"`
	Points     int  `json:"points"`
	Reached    bool `json:"reached"`
	GoalGold   int  `json:"goalGold"`
	Streak     struct {
		Count   int  `json:"count"`
		Freezes int  `json:"freezes"`
		Today   bool `json:"today"`
		AtRisk  bool `json:"atRisk"`
	} `json:"streak"`
	VocabDue      int `json:"vocabDue"`
	DictationsDue int `json:"dictationsDue"`
	Arena         *struct {
		Done  int `json:"done"`
		Total int `json:"total"`
	} `json:"arena"`
}

func (h *harness) userID(t *testing.T, email string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := h.pool.QueryRow(context.Background(), `select id from users where email = $1`, email).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (h *harness) gold(t *testing.T, user uuid.UUID) int {
	t.Helper()
	var gold int
	if err := h.pool.QueryRow(context.Background(), `select gold from game_profiles where user_id = $1`, user).Scan(&gold); err != nil {
		t.Fatal(err)
	}
	return gold
}

func TestADayOfLearningCountsTowardTheGoalAndTheStreak(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	id := h.userID(t, "learner@example.com")

	day := expect[todayJSON](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if day.Goal != store.DefaultGoal || day.GoalChosen || day.Points != 0 || day.Streak.Count != 0 || day.Arena != nil {
		t.Fatalf("a fresh learner's day: %+v", day)
	}

	// A word collected is due; reviewing it is a point, and the day's first.
	word := expect[vocabJSON](t, learner.json("POST", "/api/vocab", map[string]any{"word": "step"}), http.StatusCreated)
	if day = expect[todayJSON](t, learner.json("GET", "/api/today", nil), http.StatusOK); day.VocabDue != 1 {
		t.Fatalf("a word due: %+v", day)
	}
	expectStatus(t, learner.json("PATCH", "/api/vocab/"+word.ID, map[string]any{"reviewed": true}), http.StatusOK)
	day = expect[todayJSON](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if day.Points != 1 || day.Streak.Count != 1 || !day.Streak.Today || day.Streak.AtRisk {
		t.Fatalf("after a review: %+v", day)
	}

	// A goal is chosen from three.
	expectCode(t, learner.json("PUT", "/api/goal", map[string]any{"dailyPoints": 15}), http.StatusBadRequest, "goal.invalid")
	day = expect[todayJSON](t, learner.json("PUT", "/api/goal", map[string]any{"dailyPoints": 10}), http.StatusOK)
	if day.Goal != 10 || !day.GoalChosen || day.Reached {
		t.Fatalf("goal chosen: %+v", day)
	}

	// A learner who plays has the Arena's tasks on the list, and the goal
	// reached pays into the purse — once.
	expectStatus(t, learner.json("GET", "/api/game/state", nil), http.StatusOK)
	before := h.gold(t, id)
	ctx := context.Background()
	for range 5 {
		if _, err := h.store.LogActivity(ctx, id, store.ActTake, time.Now()); err != nil {
			t.Fatal(err)
		}
	}
	day = expect[todayJSON](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if !day.Reached || day.Points != 11 || day.GoalGold != store.GoalGold || day.Arena == nil || day.Arena.Total != 3 {
		t.Fatalf("the goal reached: %+v", day)
	}
	if got := h.gold(t, id); got != before+store.GoalGold {
		t.Fatalf("gold %d, want %d", got, before+store.GoalGold)
	}
	if _, err := h.store.LogActivity(ctx, id, store.ActTake, time.Now()); err != nil {
		t.Fatal(err)
	}
	if got := h.gold(t, id); got != before+store.GoalGold {
		t.Fatal("the goal paid twice in a day")
	}
}

func TestAStreakFromYesterdayIsAtRiskToday(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	id := h.userID(t, "learner@example.com")
	ctx := context.Background()
	if _, err := h.store.LogActivity(ctx, id, store.ActReview, time.Now().AddDate(0, 0, -2)); err != nil {
		t.Fatal(err)
	}
	if _, err := h.store.LogActivity(ctx, id, store.ActReview, time.Now().AddDate(0, 0, -1)); err != nil {
		t.Fatal(err)
	}
	day := expect[todayJSON](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if day.Streak.Count != 2 || day.Streak.Today || !day.Streak.AtRisk {
		t.Fatalf("yesterday's streak today: %+v", day.Streak)
	}
}

func TestAStreakIsRebuiltFromLearningBeforeItWasKept(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	id := h.userID(t, "learner@example.com")
	// Learning written before streaks were kept on the server, as the
	// migration copies takes in.
	for _, ago := range []int{3, 2, 1} {
		at := time.Now().AddDate(0, 0, -ago)
		if _, err := h.pool.Exec(context.Background(), `
			insert into learning_events (user_id, kind, points, at, day)
			values ($1, 'take', 2, $2, ($2 at time zone 'Asia/Ho_Chi_Minh')::date)`, id, at); err != nil {
			t.Fatal(err)
		}
	}
	day := expect[todayJSON](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if day.Streak.Count != 3 || !day.Streak.AtRisk {
		t.Fatalf("rebuilt: %+v", day.Streak)
	}
}

type growthJSON struct {
	DAU  int `json:"dau"`
	MAU  int `json:"mau"`
	Days []struct {
		Day      string `json:"day"`
		Active   int    `json:"active"`
		Learning int    `json:"learning"`
		Signups  int    `json:"signups"`
	} `json:"days"`
	Cohorts []struct {
		Joined int `json:"joined"`
		D1     *struct {
			Of  int `json:"of"`
			Did int `json:"did"`
		} `json:"d1"`
		D7 *struct {
			Of  int `json:"of"`
			Did int `json:"did"`
		} `json:"d7"`
	} `json:"cohorts"`
	Funnel struct {
		Joined   int `json:"joined"`
		Returned int `json:"returned"`
	} `json:"funnel"`
}

func TestTheConsoleSeesWhoComesBack(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	expectStatus(t, learner.json("GET", "/api/admin/growth", nil), http.StatusForbidden)
	expectStatus(t, admin.json("GET", "/api/admin/growth?days=3", nil), http.StatusBadRequest)

	// The learner joined nine days ago and came back the next day and in the
	// second week; today they opened the app.
	ctx := context.Background()
	id := h.userID(t, "learner@example.com")
	if _, err := h.pool.Exec(ctx, `update users set created_at = now() - interval '9 days' where id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, `
		insert into user_days (user_id, day)
		select $1, (now() at time zone 'Asia/Ho_Chi_Minh')::date - d from unnest(array[9, 8, 2]) d
		on conflict do nothing`, id); err != nil {
		t.Fatal(err)
	}
	expectStatus(t, learner.json("GET", "/auth/me", nil), http.StatusOK)

	got := expect[growthJSON](t, admin.json("GET", "/api/admin/growth?days=14", nil), http.StatusOK)
	if got.DAU < 1 || got.MAU < 1 || len(got.Days) != 14 {
		t.Fatalf("actives: dau %d mau %d, %d days", got.DAU, got.MAU, len(got.Days))
	}
	if last := got.Days[len(got.Days)-1]; last.Active < 1 {
		t.Fatalf("today: %+v", last)
	}
	var cohort *struct {
		Joined int `json:"joined"`
		D1     *struct {
			Of  int `json:"of"`
			Did int `json:"did"`
		} `json:"d1"`
		D7 *struct {
			Of  int `json:"of"`
			Did int `json:"did"`
		} `json:"d7"`
	}
	for i := range got.Cohorts {
		if got.Cohorts[i].D7 != nil {
			cohort = &got.Cohorts[i]
		}
	}
	if cohort == nil || cohort.D1 == nil || cohort.D1.Did != 1 || cohort.D7.Did != 1 {
		t.Fatalf("the learner's cohort: %+v", got.Cohorts)
	}
	if got.Funnel.Joined < 1 || got.Funnel.Returned < 1 {
		t.Fatalf("funnel: %+v", got.Funnel)
	}
}

func TestATakeIsTheDaysLearningAndTheNextClipIsOnTheList(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clips := publishClips(t, admin, aClip("Line one"), aClip("Line two"))
	learner := h.login("learner@example.com")

	type withClip struct {
		Points   int `json:"points"`
		NextClip *struct {
			ID string `json:"id"`
		} `json:"nextClip"`
	}
	day := expect[withClip](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if day.NextClip == nil {
		t.Fatal("no clip to practise next")
	}
	first := day.NextClip.ID
	record(t, learner, first)
	day = expect[withClip](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if day.Points != 2 || day.NextClip == nil || day.NextClip.ID == first {
		t.Fatalf("after a take: %+v (clips %s, %s)", day, clips[0].ID, clips[1].ID)
	}
}
