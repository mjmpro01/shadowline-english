package api_test

import (
	"bytes"
	"context"
	"net/http"
	"testing"
	"time"
)

type vocabJSON struct {
	ID         string  `json:"id"`
	Word       string  `json:"word"`
	IPA        string  `json:"ipa"`
	Meaning    string  `json:"meaning"`
	Status     string  `json:"status"`
	VideoID    *string `json:"videoId"`
	ReviewedAt *string `json:"reviewedAt"`
	// The schedule. Named here because the deck is built from it in the
	// browser, so a renamed field renders as "undefined" rather than failing
	// to compile anywhere.
	IntervalDays int    `json:"intervalDays"`
	DueAt        string `json:"dueAt"`
}

type leaderJSON struct {
	UserID string  `json:"userId"`
	Name   string  `json:"name"`
	Avg    float64 `json:"avg"`
	Takes  int     `json:"takes"`
	IsYou  bool    `json:"isYou"`
}

// Tapping the same word twice while practising should leave one card, not two.
// The browser used to key words as `c-${word}`, which collided across learners
// once there was more than one.
func TestCollectingAWordTwiceKeepsOneCard(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	// A word the shipped seed does not hold, so what comes back is the card's
	// own meaning rather than the shared gloss — which is what this test is
	// about. A seeded word would read through to the gloss by design.
	const word = "blorptangle"
	first := expect[vocabJSON](t, c.json("POST", "/api/vocab",
		map[string]any{"word": word, "ipa": "/ˈθrɛʃhoʊld/", "meaning": "a doorway"}), http.StatusCreated)
	second := expect[vocabJSON](t, c.json("POST", "/api/vocab",
		map[string]any{"word": word}), http.StatusCreated)

	if first.ID != second.ID {
		t.Fatalf("the same word produced two cards: %s and %s", first.ID, second.ID)
	}

	words := expect[[]vocabJSON](t, c.do("GET", "/api/vocab", "", nil), http.StatusOK)
	if len(words) != 1 {
		t.Fatalf("collected %d cards for one word", len(words))
	}
	// The second call sent no meaning; it must not have erased the first one's.
	if words[0].Meaning != "a doorway" {
		t.Fatalf("meaning was overwritten with %q", words[0].Meaning)
	}
}

// Two learners can collect the same word — the uniqueness is per learner.
func TestTwoLearnersCanCollectTheSameWord(t *testing.T) {
	h := newHarness(t)

	a := h.login("a@example.com")
	b := h.login("b@example.com")
	expect[vocabJSON](t, a.json("POST", "/api/vocab", map[string]any{"word": "threshold"}), http.StatusCreated)
	expect[vocabJSON](t, b.json("POST", "/api/vocab", map[string]any{"word": "threshold"}), http.StatusCreated)

	for _, c := range []*client{a, b} {
		words := expect[[]vocabJSON](t, c.do("GET", "/api/vocab", "", nil), http.StatusOK)
		if len(words) != 1 {
			t.Fatalf("a learner sees %d cards, want 1", len(words))
		}
	}
}

// Memory practice orders the deck by how long ago a card came up, so the review
// timestamp has to be recorded by the server rather than by whichever device
// happens to have the wrong clock.
func TestAnsweringACardRecordsThatItCameUp(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	word := expect[vocabJSON](t, c.json("POST", "/api/vocab", map[string]any{"word": "threshold"}), http.StatusCreated)
	if word.ReviewedAt != nil {
		t.Fatal("a brand new card claims to have been reviewed")
	}

	updated := expect[vocabJSON](t, c.json("PATCH", "/api/vocab/"+word.ID,
		map[string]any{"status": "known", "reviewed": true}), http.StatusOK)

	if updated.Status != "known" {
		t.Fatalf("status is %q", updated.Status)
	}
	if updated.ReviewedAt == nil {
		t.Fatal("answering the card did not record that it came up")
	}
}

func TestVocabRejectsAStatusTheAppDoesNotHave(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	word := expect[vocabJSON](t, c.json("POST", "/api/vocab", map[string]any{"word": "threshold"}), http.StatusCreated)

	expectStatus(t, c.json("PATCH", "/api/vocab/"+word.ID, map[string]any{"status": "mastered"}), http.StatusBadRequest)
}

func TestOneLearnerCannotTouchAnothersWords(t *testing.T) {
	h := newHarness(t)
	mine := h.login("learner@example.com")
	word := expect[vocabJSON](t, mine.json("POST", "/api/vocab", map[string]any{"word": "threshold"}), http.StatusCreated)

	theirs := h.login("someone.else@example.com")
	expectStatus(t, theirs.json("PATCH", "/api/vocab/"+word.ID, map[string]any{"status": "known"}), http.StatusNotFound)
	expectStatus(t, theirs.do("DELETE", "/api/vocab/"+word.ID, "", nil), http.StatusNotFound)
}

// The dashboard used to rank you against four invented learners. Now the rows
// are real people or there are no rows.
func TestTheLeaderboardHoldsOnlyRealLearners(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	withAudio(t, admin, clip.ID)

	you := h.login("learner@example.com")
	empty := expect[[]leaderJSON](t, you.do("GET", "/api/leaderboard", "", nil), http.StatusOK)
	if len(empty) != 0 {
		t.Fatalf("an app with no scored takes produced %d ranked learners", len(empty))
	}

	// A pending take is not a score, and must not put anyone on the board.
	take := record(t, you, clip.ID)
	stillEmpty := expect[[]leaderJSON](t, you.do("GET", "/api/leaderboard", "", nil), http.StatusOK)
	if len(stillEmpty) != 0 {
		t.Fatalf("an unscored take ranked %d learners", len(stillEmpty))
	}

	job, err := h.store.ClaimJob(ctx)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if err := h.store.CompleteJob(ctx, job.ID, job.TakeID, 82,
		map[string]float64{"Intonation": 82}, nil); err != nil {
		t.Fatalf("complete: %v", err)
	}

	board := expect[[]leaderJSON](t, you.do("GET", "/api/leaderboard", "", nil), http.StatusOK)
	if len(board) != 1 {
		t.Fatalf("board holds %d rows, want 1", len(board))
	}
	if !board[0].IsYou {
		t.Fatal("your own row was not marked as yours")
	}
	if board[0].Avg != 82 || board[0].Takes != 1 {
		t.Fatalf("row does not match the take: %+v", board[0])
	}
	_ = take
}

func TestProfileNameCanBeChangedButAdminCannot(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	updated := expect[profileJSON](t, c.json("PATCH", "/api/profile", map[string]any{"name": "Minh"}), http.StatusOK)
	if updated.Name != "Minh" {
		t.Fatalf("name is %q", updated.Name)
	}
	if updated.IsAdmin {
		t.Fatal("editing a profile granted admin")
	}

	// isAdmin is not a field the endpoint accepts at all.
	expectStatus(t, c.json("PATCH", "/api/profile", map[string]any{"name": "Minh", "isAdmin": true}), http.StatusBadRequest)

	after := expect[profileJSON](t, c.do("GET", "/api/profile", "", nil), http.StatusOK)
	if after.IsAdmin {
		t.Fatal("a rejected request granted admin anyway")
	}
}

func TestReplacingAnAvatarDoesNotLeaveTheOldOne(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	expectStatus(t, c.do("PUT", "/api/profile/avatar", "image/png", bytes.NewReader([]byte("first"))), http.StatusOK)
	after := countObjects(t, h)

	expectStatus(t, c.do("PUT", "/api/profile/avatar", "image/png", bytes.NewReader([]byte("second"))), http.StatusOK)
	if now := countObjects(t, h); now != after {
		t.Fatalf("replacing an avatar left %d objects, was %d", now, after)
	}
}

// --- the schedule -----------------------------------------------------------
//
// The deck used to be sorted by status and then by when a card was last seen,
// which is an order and not a schedule: a word marked known came back the very
// next session. These are about the spacing being real.

func collect(t *testing.T, c *client, word string) vocabJSON {
	t.Helper()
	return expect[vocabJSON](t, c.json("POST", "/api/vocab", map[string]any{"word": word}),
		http.StatusCreated)
}

func review(t *testing.T, c *client, id, status string) vocabJSON {
	t.Helper()
	return expect[vocabJSON](t, c.json("PATCH", "/api/vocab/"+id,
		map[string]any{"status": status, "reviewed": true}), http.StatusOK)
}

func TestANewWordIsDueStraightAway(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	card := collect(t, c, "brilliant")
	if card.IntervalDays != 0 {
		t.Fatalf("a word nobody has reviewed is scheduled %d days out", card.IntervalDays)
	}
	due, err := time.Parse(time.RFC3339, card.DueAt)
	if err != nil {
		t.Fatalf("dueAt is %q: %v", card.DueAt, err)
	}
	if due.After(time.Now().Add(time.Minute)) {
		t.Fatalf("a new word is not due until %s", due)
	}
}

func TestRecallingAWordPushesItFurtherOutEachTime(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	id := collect(t, c, "brilliant").ID

	intervals := []int{}
	for i := 0; i < 4; i++ {
		intervals = append(intervals, review(t, c, id, "known").IntervalDays)
	}
	for i := 1; i < len(intervals); i++ {
		if intervals[i] <= intervals[i-1] {
			t.Fatalf("the intervals did not grow: %v", intervals)
		}
	}

	// And the date moved with the interval, rather than the interval alone.
	card := expect[[]vocabJSON](t, c.do("GET", "/api/vocab", "", nil), http.StatusOK)[0]
	due, _ := time.Parse(time.RFC3339, card.DueAt)
	if !due.After(time.Now().AddDate(0, 0, intervals[len(intervals)-1]-1)) {
		t.Fatalf("interval is %d days but the card is due %s", card.IntervalDays, due)
	}
}

func TestForgettingAWordBringsItStraightBack(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	id := collect(t, c, "brilliant").ID

	review(t, c, id, "known")
	review(t, c, id, "known")
	got := review(t, c, id, "learning")

	if got.IntervalDays != 0 {
		// Not one step down: a word that has gone is gone, and walking it back
		// would ask about it next in a fortnight.
		t.Fatalf("a forgotten word is still scheduled %d days out", got.IntervalDays)
	}
	due, _ := time.Parse(time.RFC3339, got.DueAt)
	if due.After(time.Now().Add(time.Minute)) {
		t.Fatalf("a forgotten word is not due until %s", due)
	}
}

// Ticking "known" in the list is an instruction about the deck — stop asking
// me — not a recall. Nothing was tested, so it does not climb the ladder; it
// goes to the top of it.
func TestMarkingAWordKnownByHandRetiresItRatherThanTestingIt(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	id := collect(t, c, "brilliant").ID

	got := expect[vocabJSON](t, c.json("PATCH", "/api/vocab/"+id,
		map[string]any{"status": "known"}), http.StatusOK)

	if got.IntervalDays < 60 {
		t.Fatalf("a word marked known by hand is due again in %d days", got.IntervalDays)
	}
	if got.ReviewedAt != nil {
		t.Fatal("marking a word known by hand was recorded as a review")
	}
}

func TestMovingAWordBackToLearningByHandAsksAgainNow(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	id := collect(t, c, "brilliant").ID
	review(t, c, id, "known")
	review(t, c, id, "known")

	got := expect[vocabJSON](t, c.json("PATCH", "/api/vocab/"+id,
		map[string]any{"status": "learning"}), http.StatusOK)
	if got.IntervalDays != 0 {
		t.Fatalf("a word moved back to learning is still %d days out", got.IntervalDays)
	}
}

func TestOneLearnersScheduleIsNotAnothers(t *testing.T) {
	h := newHarness(t)
	mine := h.login("mine@example.com")
	theirs := h.login("theirs@example.com")

	id := collect(t, mine, "brilliant").ID
	collect(t, theirs, "brilliant")
	review(t, mine, id, "known")

	card := expect[[]vocabJSON](t, theirs.do("GET", "/api/vocab", "", nil), http.StatusOK)[0]
	if card.IntervalDays != 0 {
		t.Fatalf("another learner's review scheduled this card %d days out", card.IntervalDays)
	}
}
