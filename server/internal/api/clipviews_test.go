package api_test

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// The library used to reach the app as one list of every clip in it, fetched
// at sign-in: 7.4MB and four hundred milliseconds against forty series, most
// of it signed poster URLs for clips nobody was going to open. These are the
// endpoints that replaced it, and the refusal that stops it coming back.

type summaryJSON struct {
	Clips      int      `json:"clips"`
	Series     int      `json:"series"`
	Categories []string `json:"categories"`
}

type nextUpJSON struct {
	Clip *clipJSON `json:"clip"`
}

type studioPageJSON struct {
	Clips []clipJSON `json:"clips"`
	Total int        `json:"total"`
}

func TestAskingForTheWholeLibraryIsRefused(t *testing.T) {
	// The whole point. Without this the habit comes back the next time a
	// screen wants a list.
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, aClip("Line one"))

	expectStatus(t, h.login("learner@example.com").do("GET", "/api/clips", "", nil),
		http.StatusBadRequest)
}

func TestClipsAreFetchedByID(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	created := publishClips(t, admin, aClip("Line one"), aClip("Line two"), aClip("Line three"))

	learner := h.login("learner@example.com")
	got := expect[[]clipJSON](t, learner.do(
		"GET", "/api/clips?ids="+created[0].ID+","+created[2].ID, "", nil), http.StatusOK)

	if len(got) != 2 {
		t.Fatalf("asked for two clips, got %d", len(got))
	}
	titles := got[0].Title + " " + got[1].Title
	if !strings.Contains(titles, "Line one") || !strings.Contains(titles, "Line three") {
		t.Fatalf("got %q", titles)
	}
}

func TestABatchOfIDsIsCapped(t *testing.T) {
	// A cap is what stops "by id" becoming "all of them, one id at a time".
	h := newHarness(t)
	c := h.login("learner@example.com")

	ids := make([]string, 300)
	for i := range ids {
		ids[i] = "00000000-0000-0000-0000-000000000001"
	}
	expectStatus(t, c.do("GET", "/api/clips?ids="+strings.Join(ids, ","), "", nil),
		http.StatusBadRequest)
}

func TestSomethingThatIsNotAnIDIsRefused(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")
	expectStatus(t, c.do("GET", "/api/clips?ids=not-a-uuid", "", nil), http.StatusBadRequest)
}

func TestAnIDNobodyHasIsNotAnError(t *testing.T) {
	// A clip deleted while somebody had it on screen. An empty list is the
	// honest answer; a 404 would take the rest of the batch with it.
	h := newHarness(t)
	c := h.login("learner@example.com")
	got := expect[[]clipJSON](t, c.do(
		"GET", "/api/clips?ids=00000000-0000-0000-0000-000000000001", "", nil), http.StatusOK)
	if len(got) != 0 {
		t.Fatalf("got %d clips for an id nobody has", len(got))
	}
}

func TestTheDashboardGetsOnlyTheFeaturedClips(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	created := publishClips(t, admin, aClip("Line one"), aClip("Line two"))
	expect[clipJSON](t, admin.json("PATCH", "/api/admin/clips/"+created[1].ID,
		map[string]any{"featured": true}), http.StatusOK)

	got := expect[[]clipJSON](t, h.login("learner@example.com").
		do("GET", "/api/clips/featured", "", nil), http.StatusOK)
	if len(got) != 1 || got[0].Title != "Line two" {
		t.Fatalf("the dashboard was offered %+v", got)
	}
}

// --- what to practise next --------------------------------------------------
//
// A question about the whole library, which is why it moved here. Being able
// to answer it is the reason the browser was being sent every clip.

func TestNextUpOffersAClipNeverPractised(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	created := publishClips(t, admin, aClip("Line one"), aClip("Line two"))
	withAudio(t, admin, created[0].ID)

	learner := h.login("learner@example.com")
	record(t, learner, created[0].ID)

	got := expect[nextUpJSON](t, learner.do("GET", "/api/clips/next-up", "", nil), http.StatusOK)
	if got.Clip == nil || got.Clip.Title != "Line two" {
		t.Fatalf("offered %+v, want the clip nobody has been to", got.Clip)
	}
}

func TestNextUpFallsBackToTheWeakestOnceEverythingHasBeenTried(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	created := publishClips(t, admin, aClip("Line one"), aClip("Line two"))

	learner := h.login("learner@example.com")
	for _, clip := range created {
		record(t, learner, clip.ID)
	}
	// Scored by hand: the worker is Python and does not run in these tests.
	h.scoreTake(t, created[0].ID, 90)
	h.scoreTake(t, created[1].ID, 40)

	got := expect[nextUpJSON](t, learner.do("GET", "/api/clips/next-up", "", nil), http.StatusOK)
	if got.Clip == nil || got.Clip.Title != "Line two" {
		t.Fatalf("offered %+v, want the clip that went worst", got.Clip)
	}
}

func TestNextUpOnAnEmptyLibraryIsNotAnError(t *testing.T) {
	// A fresh install has nothing to offer, and saying so is a real answer.
	h := newHarness(t)
	got := expect[nextUpJSON](t, h.login("learner@example.com").
		do("GET", "/api/clips/next-up", "", nil), http.StatusOK)
	if got.Clip != nil {
		t.Fatalf("an empty library offered %+v", got.Clip)
	}
}

func TestOneLearnersProgressDoesNotDecideAnothers(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	created := publishClips(t, admin, aClip("Line one"), aClip("Line two"))

	mine := h.login("mine@example.com")
	record(t, mine, created[0].ID)

	theirs := h.login("theirs@example.com")
	got := expect[nextUpJSON](t, theirs.do("GET", "/api/clips/next-up", "", nil), http.StatusOK)
	if got.Clip == nil || got.Clip.Title != "Line one" {
		t.Fatalf("somebody else's practice moved this learner on to %+v", got.Clip)
	}
}

// --- the summary ------------------------------------------------------------

func TestTheSummaryCountsWithoutSendingTheLibrary(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"), inPlaylist("Line two", "Friends"))
	publishClips(t, admin, inPlaylist("Other", "Seinfeld"))

	got := expect[summaryJSON](t, h.login("learner@example.com").
		do("GET", "/api/library/summary", "", nil), http.StatusOK)
	if got.Clips != 3 || got.Series != 2 {
		t.Fatalf("summary says %+v", got)
	}
	if len(got.Categories) != 1 || got.Categories[0] != "Everyday" {
		t.Fatalf("categories came back as %v", got.Categories)
	}
}

// --- the studio -------------------------------------------------------------

func TestTheStudioPagesThroughTheLibrary(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	for i := 0; i < 5; i++ {
		publishClips(t, admin, aClip("Line "+string(rune('a'+i))))
	}

	page := expect[studioPageJSON](t, admin.do("GET", "/api/admin/clips?limit=2", "", nil),
		http.StatusOK)
	if len(page.Clips) != 2 {
		t.Fatalf("a page of two holds %d clips", len(page.Clips))
	}
	if page.Total != 5 {
		t.Fatalf("the total says %d, want 5 — the tab is labelled with it", page.Total)
	}

	second := expect[studioPageJSON](t, admin.do("GET", "/api/admin/clips?limit=2&offset=2", "", nil),
		http.StatusOK)
	if second.Clips[0].ID == page.Clips[0].ID {
		t.Fatal("the second page repeats the first")
	}
}

func TestTheStudioSearchesTheWholeLibraryNotThePage(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, aClip("Ordering coffee"), aClip("Job interview"), aClip("Small talk"))

	got := expect[studioPageJSON](t, admin.do(
		"GET", "/api/admin/clips?q="+url.QueryEscape("interview"), "", nil), http.StatusOK)
	if got.Total != 1 || len(got.Clips) != 1 || got.Clips[0].Title != "Job interview" {
		t.Fatalf("searching the studio found %+v", got)
	}
}

func TestTheStudiosClipManagerIsClosedToLearners(t *testing.T) {
	h := newHarness(t)
	expectStatus(t, h.login("learner@example.com").do("GET", "/api/admin/clips", "", nil),
		http.StatusForbidden)
}

func TestTheNewLibraryEndpointsNeedALogin(t *testing.T) {
	h := newHarness(t)
	for _, path := range []string{"/api/clips/featured", "/api/clips/next-up", "/api/library/summary"} {
		expectStatus(t, h.anonymous().do("GET", path, "", nil), http.StatusUnauthorized)
	}
}

// --- naming the next clip ---------------------------------------------------

type nextNumberJSON struct {
	Next int `json:"next"`
}

func nextNumber(t *testing.T, admin *client, playlist string) int {
	t.Helper()
	return expect[nextNumberJSON](t, admin.do(
		"GET", "/api/admin/clips/next-number?playlist="+url.QueryEscape(playlist), "", nil),
		http.StatusOK).Next
}

func TestAnEmptyPlaylistStartsAtOne(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	if got := nextNumber(t, admin, "Friends"); got != 1 {
		t.Fatalf("an empty playlist starts at %d, want 1", got)
	}
}

func TestNumberingContinuesFromWhatThePlaylistHolds(t *testing.T) {
	// Going back to cut a few more lines into the same playlist is where
	// restarting would give it a second "Clip 1".
	h := newHarness(t)
	admin := h.login("admin@example.com")
	for _, title := range []string{"Clip 1", "Clip 2", "Clip 3"} {
		clip := inPlaylist(title, "Friends")
		publishClips(t, admin, clip)
	}
	if got := nextNumber(t, admin, "Friends"); got != 4 {
		t.Fatalf("next is %d, want 4", got)
	}
}

func TestAClipAnAdminNamedDoesNotPushTheSequenceAlong(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Clip 1", "Friends"))
	publishClips(t, admin, inPlaylist("The one with the pivot", "Friends"))

	if got := nextNumber(t, admin, "Friends"); got != 2 {
		t.Fatalf("a hand-named clip moved the sequence to %d, want 2", got)
	}
}

func TestNumberingIsPerPlaylist(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Clip 1", "Friends"), inPlaylist("Clip 2", "Friends"))

	if got := nextNumber(t, admin, "Seinfeld"); got != 1 {
		t.Fatalf("another playlist starts at %d, want 1", got)
	}
}

func TestOnlyAnAdminAsksForTheNextNumber(t *testing.T) {
	h := newHarness(t)
	expectStatus(t, h.login("learner@example.com").
		do("GET", "/api/admin/clips/next-number?playlist=Friends", "", nil), http.StatusForbidden)
}
