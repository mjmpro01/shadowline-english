package api_test

import (
	"bytes"
	"net/http"
	"strconv"
	"testing"
)

// The library's front screen is a page of series at a time, and each series
// can carry a cover an admin uploaded instead of the still it borrows from its
// first clip.

type playlistListJSON struct {
	Items  []playlistJSON `json:"items"`
	Total  int            `json:"total"`
	Offset int            `json:"offset"`
	Limit  int            `json:"limit"`
}

type coveredJSON struct {
	ID       string `json:"id"`
	CoverURL string `json:"coverUrl"`
	OwnCover bool   `json:"ownCover"`
}

func playlistPage(t *testing.T, c *client, offset, limit int) playlistListJSON {
	t.Helper()
	return expect[playlistListJSON](t, c.do("GET",
		"/api/playlists?offset="+strconv.Itoa(offset)+"&limit="+strconv.Itoa(limit), "", nil),
		http.StatusOK)
}

func TestTheLibraryComesAPageAtATime(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin,
		inPlaylist("a", "Alpha"), inPlaylist("b", "Bravo"), inPlaylist("c", "Charlie"),
		inPlaylist("d", "Delta"), inPlaylist("e", "Echo"))
	learner := h.login("learner@example.com")

	all := playlists(t, learner)
	if len(all) != 5 {
		t.Fatalf("%d series without a limit, want every one of the 5", len(all))
	}

	// Walked page by page, the pages are the whole list in the same order,
	// with nothing twice and nothing missed.
	var walked []string
	for offset := 0; offset < 6; offset += 2 {
		page := playlistPage(t, learner, offset, 2)
		if page.Total != 5 || page.Offset != offset || page.Limit != 2 {
			t.Fatalf("page at %d says total %d, offset %d, limit %d", offset, page.Total, page.Offset, page.Limit)
		}
		for _, p := range page.Items {
			walked = append(walked, p.Title)
		}
	}
	if len(walked) != len(all) {
		t.Fatalf("the pages held %v, the list %d series", walked, len(all))
	}
	for i, p := range all {
		if walked[i] != p.Title {
			t.Fatalf("page order %v differs from the list's at %d", walked, i)
		}
	}

	// Past the end is an empty page that still knows how many there are.
	past := playlistPage(t, learner, 10, 2)
	if len(past.Items) != 0 || past.Total != 5 {
		t.Fatalf("past the end: %d items, total %d", len(past.Items), past.Total)
	}
}

func TestAPageHasALimitTheServerAccepts(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	for _, query := range []string{"limit=0", "limit=61", "limit=ten", "limit=5&offset=-1", "limit=5&offset=x"} {
		expectStatus(t, learner.do("GET", "/api/playlists?"+query, "", nil), http.StatusBadRequest)
	}
}

func TestASeriesTakesAnUploadedCover(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"))
	id := playlists(t, admin)[0].ID
	cover := "/api/admin/playlists/" + id + "/cover"
	png := []byte("\x89PNG\r\n\x1a\nnot really a picture")

	expectStatus(t, learner.do("PUT", cover, "image/png", bytes.NewReader(png)), http.StatusForbidden)
	expectStatus(t, admin.do("PUT", cover, "image/svg+xml", bytes.NewReader([]byte("<svg/>"))),
		http.StatusUnsupportedMediaType)
	expectStatus(t, admin.do("PUT", cover, "image/png", bytes.NewReader(make([]byte, 3<<20+1))),
		http.StatusRequestEntityTooLarge)
	if n := countObjects(t, h); n != 0 {
		t.Fatalf("%d objects left behind by refused uploads", n)
	}

	given := expect[coveredJSON](t, admin.do("PUT", cover, "image/png", bytes.NewReader(png)), http.StatusOK)
	if !given.OwnCover || given.CoverURL == "" {
		t.Fatalf("after uploading: %+v", given)
	}

	// The learner's list carries it, on every shape of the list.
	page := expect[playlistListJSON](t, learner.do("GET", "/api/playlists?limit=10", "", nil), http.StatusOK)
	if len(page.Items) != 1 {
		t.Fatalf("%d series on the page", len(page.Items))
	}
	listed := expect[[]coveredJSON](t, learner.do("GET", "/api/playlists", "", nil), http.StatusOK)
	if !listed[0].OwnCover || listed[0].CoverURL == "" {
		t.Fatalf("the library's list has %+v", listed[0])
	}

	// A second upload replaces the first, and the first picture goes.
	expect[coveredJSON](t, admin.do("PUT", cover, "image/webp", bytes.NewReader([]byte("RIFF....WEBP"))), http.StatusOK)
	if n := countObjects(t, h); n != 1 {
		t.Fatalf("%d objects after replacing the cover, want 1", n)
	}

	removed := expect[coveredJSON](t, admin.do("DELETE", cover, "", nil), http.StatusOK)
	if removed.OwnCover {
		t.Fatal("still has its own cover after it was removed")
	}
	if n := countObjects(t, h); n != 0 {
		t.Fatalf("%d objects outlived the removed cover", n)
	}
}

func TestAnUnknownSeriesTakesNoCover(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	expectStatus(t, admin.do("PUT", "/api/admin/playlists/00000000-0000-0000-0000-000000000000/cover",
		"image/png", bytes.NewReader([]byte("\x89PNG"))), http.StatusNotFound)
}

func TestDeletingASeriesTakesItsCoverWithIt(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "s01e01.mp4")
	clip := inPlaylist("Line one", "Friends")
	clip["sourceId"] = source.ID
	publishClips(t, admin, clip)
	id := playlists(t, admin)[0].ID
	expect[coveredJSON](t, admin.do("PUT", "/api/admin/playlists/"+id+"/cover", "image/png",
		bytes.NewReader([]byte("\x89PNG\r\n\x1a\n"))), http.StatusOK)

	expectStatus(t, admin.do("DELETE", "/api/admin/episodes/"+source.ID, "", nil), http.StatusNoContent)
	expectStatus(t, admin.do("DELETE", "/api/admin/playlists/"+id, "", nil), http.StatusNoContent)
	if n := countObjects(t, h); n != 0 {
		t.Fatalf("%d objects outlived the series", n)
	}
}
