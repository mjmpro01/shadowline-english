package api_test

import (
	"bytes"
	"net/http"
	"testing"
	"time"
)

type bannerJSON struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ImageURL string `json:"imageUrl"`
	Locale   string `json:"locale"`
}

func banner(fields map[string]any) map[string]any {
	out := map[string]any{"title": "New series", "placement": "dashboard", "enabled": true}
	for k, v := range fields {
		out[k] = v
	}
	return out
}

func liveTitles(t *testing.T, c *client, query string) []string {
	t.Helper()
	live := expect[[]bannerJSON](t, c.do("GET", "/api/banners?"+query, "", nil), http.StatusOK)
	titles := make([]string, len(live))
	for i, b := range live {
		titles[i] = b.Title
	}
	return titles
}

// A learner sees the banners that are on, inside their window, in their place
// and for their language — and nothing else an admin has written.
func TestALearnerSeesOnlyTheBannersShowingNow(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	now := time.Now()

	for _, b := range []map[string]any{
		banner(map[string]any{"title": "Showing", "position": 1}),
		banner(map[string]any{"title": "First", "position": 0}),
		banner(map[string]any{"title": "Off", "enabled": false}),
		banner(map[string]any{"title": "Next week", "startsAt": now.Add(7 * 24 * time.Hour)}),
		banner(map[string]any{"title": "Ended", "endsAt": now.Add(-time.Hour)}),
		banner(map[string]any{"title": "Library", "placement": "library"}),
		banner(map[string]any{"title": "Tiếng Việt", "locale": "vi"}),
	} {
		expect[bannerJSON](t, admin.json("POST", "/api/admin/banners", b), http.StatusCreated)
	}

	got := liveTitles(t, learner, "placement=dashboard&locale=en")
	if len(got) != 2 || got[0] != "First" || got[1] != "Showing" {
		t.Fatalf("an English dashboard showed %v", got)
	}
	// vi-VN is Vietnamese: a banner is written for a language, not a region.
	if got := liveTitles(t, learner, "placement=dashboard&locale=vi-VN"); len(got) != 3 {
		t.Fatalf("a Vietnamese dashboard showed %v", got)
	}
	if got := liveTitles(t, learner, "placement=library"); len(got) != 1 || got[0] != "Library" {
		t.Fatalf("the library showed %v", got)
	}

	all := expect[[]bannerJSON](t, admin.do("GET", "/api/admin/banners", "", nil), http.StatusOK)
	if len(all) != 7 {
		t.Fatalf("the console lists %d of 7", len(all))
	}
	expectStatus(t, learner.do("GET", "/api/admin/banners", "", nil), http.StatusForbidden)
	expectStatus(t, learner.json("POST", "/api/admin/banners", banner(nil)), http.StatusForbidden)
}

// A banner is shown to everybody, so what it links to is checked here.
func TestABannerLinksOnlySomewhereSafe(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	for _, link := range []string{"javascript:alert(1)", "http://example.com", "//evil.example", "data:text/html,hi"} {
		expectStatus(t, admin.json("POST", "/api/admin/banners",
			banner(map[string]any{"linkUrl": link, "linkLabel": "Open"})), http.StatusBadRequest)
	}
	for _, link := range []string{"/library", "https://example.com/ielts"} {
		expect[bannerJSON](t, admin.json("POST", "/api/admin/banners",
			banner(map[string]any{"linkUrl": link, "linkLabel": "Open"})), http.StatusCreated)
	}
	// A link with no label would be a button with nothing on it.
	expectStatus(t, admin.json("POST", "/api/admin/banners",
		banner(map[string]any{"linkUrl": "/library"})), http.StatusBadRequest)
	expectStatus(t, admin.json("POST", "/api/admin/banners", banner(map[string]any{"title": " "})),
		http.StatusBadRequest)
	now := time.Now()
	expectStatus(t, admin.json("POST", "/api/admin/banners",
		banner(map[string]any{"startsAt": now, "endsAt": now.Add(-time.Minute)})), http.StatusBadRequest)
}

// A banner can be edited, given a picture, have it replaced, and go.
func TestABannerIsEditedAndDeleted(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")

	made := expect[bannerJSON](t, admin.json("POST", "/api/admin/banners", banner(nil)), http.StatusCreated)
	edited := expect[bannerJSON](t, admin.json("PUT", "/api/admin/banners/"+made.ID,
		banner(map[string]any{"title": "Exam season"})), http.StatusOK)
	if edited.Title != "Exam season" {
		t.Fatalf("title %q after editing", edited.Title)
	}

	png := []byte("\x89PNG\r\n\x1a\nnot really a picture")
	pictured := expect[bannerJSON](t, admin.do("PUT", "/api/admin/banners/"+made.ID+"/image",
		"image/png", bytes.NewReader(png)), http.StatusOK)
	if pictured.ImageURL == "" {
		t.Fatal("no signed address for the picture")
	}
	expectStatus(t, admin.do("PUT", "/api/admin/banners/"+made.ID+"/image",
		"image/svg+xml", bytes.NewReader([]byte("<svg/>"))), http.StatusUnsupportedMediaType)
	expectStatus(t, admin.do("PUT", "/api/admin/banners/"+made.ID+"/image",
		"image/png", bytes.NewReader(make([]byte, 3<<20+1))), http.StatusRequestEntityTooLarge)

	live := expect[[]bannerJSON](t, learner.do("GET", "/api/banners?placement=dashboard", "", nil), http.StatusOK)
	if len(live) != 1 || live[0].ImageURL == "" {
		t.Fatalf("the learner got %+v", live)
	}

	expectStatus(t, admin.do("DELETE", "/api/admin/banners/"+made.ID, "", nil), http.StatusNoContent)
	if got := liveTitles(t, learner, "placement=dashboard"); len(got) != 0 {
		t.Fatalf("still showing %v after it was deleted", got)
	}
	expectStatus(t, admin.do("DELETE", "/api/admin/banners/"+made.ID, "", nil), http.StatusNotFound)
}
