package api_test

import (
	"context"
	"net/http"
	"testing"
)

type glossJSON struct {
	Status  string `json:"status"`
	Word    string `json:"word"`
	IPA     string `json:"ipa"`
	Meaning string `json:"meaning"`
}

// storeGloss writes a gloss the way the glosser does. The glosser itself is
// Python and lives in ../../../scoring.
func storeGloss(t *testing.T, h *harness, word, ipa, meaning string) {
	t.Helper()
	_, err := h.pool.Exec(context.Background(),
		`insert into glosses (word, ipa, meaning) values ($1, $2, $3)`, word, ipa, meaning)
	if err != nil {
		t.Fatalf("store gloss: %v", err)
	}
}

func glossJobs(t *testing.T, h *harness, word string) int {
	t.Helper()
	var n int
	err := h.pool.QueryRow(context.Background(),
		`select count(*) from gloss_jobs where word = $1`, word).Scan(&n)
	if err != nil {
		t.Fatalf("read gloss queue: %v", err)
	}
	return n
}

// The first tap on a word nobody has ever tapped queues the lookup and says so,
// which is what tells the popup to wait rather than show an empty card.
func TestAnUnknownWordIsQueuedForLookup(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	got := expect[glossJSON](t, c.json("POST", "/api/words/brilliant",
		map[string]any{"context": "The team came up with a brilliant plan."}), http.StatusAccepted)

	if got.Status != "pending" {
		t.Fatalf("status is %q, wanted pending", got.Status)
	}
	if glossJobs(t, h, "brilliant") != 1 {
		t.Fatal("the lookup was not queued")
	}
}

// The cache is the whole point: the second learner to tap a word pays nothing
// and waits for nothing.
func TestAKnownWordIsAnsweredWithoutQueueingAnything(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	storeGloss(t, h, "brilliant", "ˈbɹɪljənt", "very good or very clever")

	got := expect[glossJSON](t, c.json("POST", "/api/words/brilliant",
		map[string]any{"context": "another line entirely"}), http.StatusOK)

	if got.Status != "ready" || got.Meaning != "very good or very clever" {
		t.Fatalf("got %+v", got)
	}
	if glossJobs(t, h, "brilliant") != 0 {
		t.Fatal("a word already looked up was queued again")
	}
}

// A word half the class taps at the same moment is one API call, not thirty.
func TestTappingTheSameWordTwiceIsOneJob(t *testing.T) {
	h := newHarness(t)
	a := h.login("a@example.com")
	b := h.login("b@example.com")

	expect[glossJSON](t, a.json("POST", "/api/words/brilliant", map[string]any{"context": "one"}), http.StatusAccepted)
	expect[glossJSON](t, b.json("POST", "/api/words/brilliant", map[string]any{"context": "two"}), http.StatusAccepted)

	if n := glossJobs(t, h, "brilliant"); n != 1 {
		t.Fatalf("%d jobs queued for one word", n)
	}
}

// The gloss is a shared cache key, so punctuation and capitals have to land on
// the same row — "Really?" tapped in a caption is the word "really".
func TestAWordIsNormalisedBeforeItIsLookedUp(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	storeGloss(t, h, "really", "ˈɹɪli", "in actual fact")

	got := expect[glossJSON](t, c.json("POST", "/api/words/Really%3F", nil), http.StatusOK)

	if got.Word != "really" || got.Meaning != "in actual fact" {
		t.Fatalf("got %+v", got)
	}
}

// Nothing queued and nothing known: the popup shows the word itself rather
// than spinning for ever.
func TestAWordNobodyAskedAboutReportsNone(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	got := expect[glossJSON](t, c.do("GET", "/api/words/brilliant", "", nil), http.StatusOK)

	if got.Status != "none" {
		t.Fatalf("status is %q, wanted none", got.Status)
	}
}

// Polling is how the popup waits, so a queued word has to keep saying pending
// until the worker writes the gloss — and say ready the moment it does.
func TestAQueuedWordReportsPendingUntilTheGlossLands(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	expect[glossJSON](t, c.json("POST", "/api/words/brilliant", nil), http.StatusAccepted)
	if got := expect[glossJSON](t, c.do("GET", "/api/words/brilliant", "", nil), http.StatusOK); got.Status != "pending" {
		t.Fatalf("status is %q, wanted pending", got.Status)
	}

	storeGloss(t, h, "brilliant", "ˈbɹɪljənt", "very good or very clever")
	if _, err := h.pool.Exec(context.Background(), `delete from gloss_jobs where word = 'brilliant'`); err != nil {
		t.Fatalf("finish job: %v", err)
	}

	got := expect[glossJSON](t, c.do("GET", "/api/words/brilliant", "", nil), http.StatusOK)
	if got.Status != "ready" || got.IPA != "ˈbɹɪljənt" {
		t.Fatalf("got %+v", got)
	}
}

// A card collected before anybody had looked the word up gets the meaning when
// it lands. The gloss belongs to the word, not to one learner's copy of it.
func TestACollectedWordPicksUpItsGlossAfterwards(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	card := expect[vocabJSON](t, c.json("POST", "/api/vocab", map[string]any{"word": "brilliant"}), http.StatusCreated)
	if card.Meaning != "" {
		t.Fatalf("a word nobody has looked up came back with %q", card.Meaning)
	}

	storeGloss(t, h, "brilliant", "ˈbɹɪljənt", "very good or very clever")

	words := expect[[]vocabJSON](t, c.do("GET", "/api/vocab", "", nil), http.StatusOK)
	if len(words) != 1 || words[0].Meaning != "very good or very clever" {
		t.Fatalf("got %+v", words)
	}
	if words[0].IPA != "ˈbɹɪljənt" {
		t.Fatalf("ipa is %q", words[0].IPA)
	}
}

// A word looked up is not a word anyone may look up: the popup is behind a
// login like everything else, because a miss costs money.
func TestLookingUpAWordNeedsALogin(t *testing.T) {
	h := newHarness(t)

	expectStatus(t, h.anonymous().json("POST", "/api/words/brilliant", nil), http.StatusUnauthorized)
	expectStatus(t, h.anonymous().do("GET", "/api/words/brilliant", "", nil), http.StatusUnauthorized)
}
