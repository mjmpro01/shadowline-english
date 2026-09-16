package api_test

import (
	"bytes"
	"net/http"
	"net/url"
	"testing"
)

type clipJSON struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Playlist        string   `json:"playlist"`
	Categories      []string `json:"categories"`
	Featured        bool     `json:"featured"`
	DurationSeconds float64  `json:"durationSeconds"`
	Captions        []struct {
		Text string `json:"text"`
		IPA  string `json:"ipa"`
	} `json:"captions"`
}

type urlJSON struct {
	URL *string `json:"url"`
}

func publishClips(t *testing.T, c *client, clips ...map[string]any) []clipJSON {
	t.Helper()
	return expect[[]clipJSON](t, c.json("POST", "/api/admin/clips", map[string]any{"clips": clips}), http.StatusCreated)
}

func aClip(title string) map[string]any {
	return map[string]any{
		"title":           title,
		"playlist":        "Lesson one",
		"categories":      []string{"Everyday"},
		"durationSeconds": 3.4,
		"captions":        []map[string]string{{"text": title, "ipa": "/" + title + "/"}},
	}
}

func TestPublishingClipsMakesThemVisibleToLearners(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	created := publishClips(t, admin, aClip("Line one"), aClip("Line two"))
	if len(created) != 2 {
		t.Fatalf("published %d clips, want 2", len(created))
	}
	if created[0].ID == created[1].ID {
		t.Fatal("two clips were given the same id")
	}

	learner := h.login("learner@example.com")
	listed := expect[[]clipJSON](t, learner.do("GET", "/api/clips", "", nil), http.StatusOK)
	if len(listed) != 2 {
		t.Fatalf("learner sees %d clips, want 2", len(listed))
	}
	if listed[0].Playlist != "Lesson one" || len(listed[0].Categories) != 1 {
		t.Fatalf("the metadata the library searches on did not survive: %+v", listed[0])
	}
	if len(listed[0].Captions) != 1 || listed[0].Captions[0].IPA == "" {
		t.Fatalf("captions did not survive: %+v", listed[0].Captions)
	}
}

// A clip is one line to shadow. The studio will not propose a longer cut, but
// the server is what actually holds the line.
func TestTheServerRefusesAClipOverTheLimit(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	long := aClip("Far too long")
	long["durationSeconds"] = 12.0
	expectStatus(t, admin.json("POST", "/api/admin/clips", map[string]any{"clips": []map[string]any{long}}), http.StatusBadRequest)

	learner := h.login("learner@example.com")
	listed := expect[[]clipJSON](t, learner.do("GET", "/api/clips", "", nil), http.StatusOK)
	if len(listed) != 0 {
		t.Fatalf("the rejected clip was published anyway: %+v", listed)
	}
}

func TestEditingAClipKeepsTheFieldsItDidNotTouch(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]

	updated := expect[clipJSON](t,
		admin.json("PATCH", "/api/admin/clips/"+clip.ID, map[string]any{"featured": true}),
		http.StatusOK)

	if !updated.Featured {
		t.Fatal("featured was not set")
	}
	if updated.Title != "Line one" || updated.Playlist != "Lesson one" {
		t.Fatalf("an untouched field changed: %+v", updated)
	}
	if len(updated.Categories) != 1 {
		t.Fatalf("categories were dropped: %+v", updated.Categories)
	}
}

// Deleting a clip has to take its audio with it. The browser version never did:
// blobStore.deleteBlob was written and never called, which is clutter on a
// laptop and a bill on S3.
func TestDeletingAClipRemovesItsAudio(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]

	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1.0))), http.StatusOK)

	signed := expect[urlJSON](t, admin.do("GET", "/api/clips/"+clip.ID+"/audio", "", nil), http.StatusOK)
	if signed.URL == nil {
		t.Fatal("uploaded audio produced no URL")
	}

	expectStatus(t, admin.do("DELETE", "/api/admin/clips/"+clip.ID, "", nil), http.StatusNoContent)

	if objects := countObjects(t, h); objects != 0 {
		t.Fatalf("%d audio objects survived the clip that owned them", objects)
	}
}

// A clip with no source audio is a real case — the seeded library has several —
// and asking for its URL is not an error.
func TestAClipWithoutAudioReportsNoURL(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]

	signed := expect[urlJSON](t, admin.do("GET", "/api/clips/"+clip.ID+"/audio", "", nil), http.StatusOK)
	if signed.URL != nil {
		t.Fatalf("a clip with no audio offered %q", *signed.URL)
	}
}

// Audio served from disk storage has to arrive with a type the browser accepts.
// Without one an <audio> element refuses the response outright, and the only
// clue is "The element has no supported sources" — which names neither the
// element nor the reason.
func TestServedAudioCarriesItsContentType(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]

	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1.0))), http.StatusOK)

	signed := expect[urlJSON](t, admin.do("GET", "/api/clips/"+clip.ID+"/audio", "", nil), http.StatusOK)
	if signed.URL == nil {
		t.Fatal("no signed URL")
	}

	// The signed URL points at the configured public base rather than at the
	// test server, so only its path and query are used here.
	u, err := url.Parse(*signed.URL)
	if err != nil {
		t.Fatalf("parse signed url: %v", err)
	}
	resp := admin.do("GET", u.Path+"?"+u.RawQuery, "", nil)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("fetching the audio gave %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Content-Type"); got != "audio/wav" {
		t.Fatalf("Content-Type is %q, want audio/wav", got)
	}
}

// A file URL whose signature does not check out must not serve anything: the
// buckets are private, and this route is the only way into them.
func TestAnUnsignedFileURLIsRefused(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1.0))), http.StatusOK)

	signed := expect[urlJSON](t, admin.do("GET", "/api/clips/"+clip.ID+"/audio", "", nil), http.StatusOK)
	u, _ := url.Parse(*signed.URL)

	expectStatus(t, admin.do("GET", u.Path, "", nil), http.StatusForbidden)
	expectStatus(t, admin.do("GET", u.Path+"?expires=9999999999&sig=made-up", "", nil), http.StatusForbidden)
}
