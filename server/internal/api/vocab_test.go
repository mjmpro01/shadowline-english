package api_test

import (
	"bytes"
	"context"
	"net/http"
	"testing"
)

type vocabJSON struct {
	ID         string  `json:"id"`
	Word       string  `json:"word"`
	IPA        string  `json:"ipa"`
	Meaning    string  `json:"meaning"`
	Status     string  `json:"status"`
	VideoID    *string `json:"videoId"`
	ReviewedAt *string `json:"reviewedAt"`
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

	first := expect[vocabJSON](t, c.json("POST", "/api/vocab",
		map[string]any{"word": "threshold", "ipa": "/ˈθrɛʃhoʊld/", "meaning": "a doorway"}), http.StatusCreated)
	second := expect[vocabJSON](t, c.json("POST", "/api/vocab",
		map[string]any{"word": "threshold"}), http.StatusCreated)

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
