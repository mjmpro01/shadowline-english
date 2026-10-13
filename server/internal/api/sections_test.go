package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// The library's shelves: an admin makes a section, puts series on it in an
// order, and a learner sees each filled shelf as a row and can open it whole.

type sectionJSON struct {
	ID          string   `json:"id"`
	Slug        string   `json:"slug"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	Position    int      `json:"position"`
	Series      int      `json:"series"`
	PlaylistIDs []string `json:"playlistIds"`
}

type sectionRowJSON struct {
	sectionJSON
	Items []playlistJSON `json:"items"`
}

type sectionPageJSON struct {
	Section sectionJSON    `json:"section"`
	Items   []playlistJSON `json:"items"`
	Total   int            `json:"total"`
	Offset  int            `json:"offset"`
	Limit   int            `json:"limit"`
}

func adminSections(t *testing.T, c *client) []sectionJSON {
	t.Helper()
	return expect[[]sectionJSON](t, c.do("GET", "/api/admin/sections", "", nil), http.StatusOK)
}

func seriesIDs(t *testing.T, c *client) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, p := range playlists(t, c) {
		out[p.Title] = p.ID
	}
	return out
}

func TestTheShelvesAskedForAreThereAndEmpty(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")

	var titles []string
	for _, s := range adminSections(t, admin) {
		titles = append(titles, s.Title)
		if s.Series != 0 || len(s.PlaylistIDs) != 0 {
			t.Fatalf("%q starts with series on it", s.Title)
		}
	}
	if got := strings.Join(titles, ", "); got != "Dành cho trẻ em, Phim ảnh, Anime, Luyện IPA" {
		t.Fatalf("the console starts with %s", got)
	}

	// Nothing on any of them, so a learner sees no shelf at all.
	rows := expect[[]sectionRowJSON](t, learner.do("GET", "/api/library/sections", "", nil), http.StatusOK)
	if len(rows) != 0 {
		t.Fatalf("a learner sees %d empty shelves", len(rows))
	}
}

func TestASeriesPutOnAShelfShowsUnderItInOrder(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	publishClips(t, admin, inPlaylist("a", "Peppa Pig"), inPlaylist("b", "Bluey"), inPlaylist("c", "Friends"))
	ids := seriesIDs(t, admin)

	made := expect[sectionJSON](t, admin.json("POST", "/api/admin/sections",
		map[string]any{"title": "Hoạt hình cho bé", "icon": "🐷", "description": "Câu ngắn, giọng chậm"}),
		http.StatusCreated)
	if made.Slug != "hoat-hinh-cho-be" {
		t.Fatalf("slug %q, want the title without its accents", made.Slug)
	}

	set := expect[sectionJSON](t, admin.json("PUT", "/api/admin/sections/"+made.ID+"/series",
		map[string]any{"playlistIds": []string{ids["Bluey"], ids["Peppa Pig"], ids["Bluey"]}}), http.StatusOK)
	if set.Series != 2 || len(set.PlaylistIDs) != 2 || set.PlaylistIDs[0] != ids["Bluey"] {
		t.Fatalf("after setting the shelf: %+v", set)
	}

	rows := expect[[]sectionRowJSON](t, learner.do("GET", "/api/library/sections", "", nil), http.StatusOK)
	if len(rows) != 1 {
		t.Fatalf("%d shelves, want the one with series on it", len(rows))
	}
	if row := rows[0]; row.Title != "Hoạt hình cho bé" || row.Icon != "🐷" || len(row.Items) != 2 ||
		row.Items[0].Title != "Bluey" || row.Items[1].Title != "Peppa Pig" {
		t.Fatalf("the shelf reads %+v", row)
	}

	// Its own page, a page at a time, in the shelf's order.
	page := expect[sectionPageJSON](t, learner.do("GET",
		"/api/library/sections/hoat-hinh-cho-be?offset=1&limit=1", "", nil), http.StatusOK)
	if page.Section.Title != "Hoạt hình cho bé" || page.Total != 2 || len(page.Items) != 1 ||
		page.Items[0].Title != "Peppa Pig" {
		t.Fatalf("second page of the shelf: %+v", page)
	}
	expectStatus(t, learner.do("GET", "/api/library/sections/no-such-shelf", "", nil), http.StatusNotFound)
	expectStatus(t, learner.do("GET", "/api/library/sections/hoat-hinh-cho-be?limit=0", "", nil),
		http.StatusBadRequest)
}

func TestASeriesCanStandOnTwoShelves(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	publishClips(t, admin, inPlaylist("a", "Doraemon"))
	id := seriesIDs(t, admin)["Doraemon"]

	shelves := adminSections(t, admin)
	for _, s := range shelves[:3] { // children, films, anime
		if s.Title == "Phim ảnh" {
			continue
		}
		expect[sectionJSON](t, admin.json("PUT", "/api/admin/sections/"+s.ID+"/series",
			map[string]any{"playlistIds": []string{id}}), http.StatusOK)
	}
	rows := expect[[]sectionRowJSON](t, learner.do("GET", "/api/library/sections", "", nil), http.StatusOK)
	if len(rows) != 2 || rows[0].Title != "Dành cho trẻ em" || rows[1].Title != "Anime" {
		t.Fatalf("shelves %+v", rows)
	}
}

func TestEditingAShelfKeepsItsAddress(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	anime := adminSections(t, admin)[2]

	edited := expect[sectionJSON](t, admin.json("PATCH", "/api/admin/sections/"+anime.ID,
		map[string]any{"title": "Anime & manga", "position": 9}), http.StatusOK)
	if edited.Title != "Anime & manga" || edited.Position != 9 || edited.Slug != "anime" {
		t.Fatalf("after editing: %+v", edited)
	}
	if last := adminSections(t, admin)[3]; last.ID != anime.ID {
		t.Fatalf("position 9 should put it last, the last is %q", last.Title)
	}
	// A change of name only: the icon is left alone.
	if edited.Icon != anime.Icon {
		t.Fatalf("the icon changed from %q to %q", anime.Icon, edited.Icon)
	}
}

func TestDeletingAShelfLeavesItsSeries(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("a", "Friends"))
	films := adminSections(t, admin)[1]
	expect[sectionJSON](t, admin.json("PUT", "/api/admin/sections/"+films.ID+"/series",
		map[string]any{"playlistIds": []string{seriesIDs(t, admin)["Friends"]}}), http.StatusOK)

	expectStatus(t, admin.do("DELETE", "/api/admin/sections/"+films.ID, "", nil), http.StatusNoContent)
	if len(adminSections(t, admin)) != 3 {
		t.Fatal("the shelf is still listed")
	}
	if len(playlists(t, admin)) != 1 {
		t.Fatal("deleting the shelf took the series with it")
	}
	expectStatus(t, admin.do("DELETE", "/api/admin/sections/"+films.ID, "", nil), http.StatusNotFound)
}

func TestDeletingASeriesTakesItOffItsShelves(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "s01e01.mp4")
	clip := inPlaylist("Line one", "Friends")
	clip["sourceId"] = source.ID
	publishClips(t, admin, clip)
	id := seriesIDs(t, admin)["Friends"]
	films := adminSections(t, admin)[1]
	expect[sectionJSON](t, admin.json("PUT", "/api/admin/sections/"+films.ID+"/series",
		map[string]any{"playlistIds": []string{id}}), http.StatusOK)

	expectStatus(t, admin.do("DELETE", "/api/admin/episodes/"+source.ID, "", nil), http.StatusNoContent)
	expectStatus(t, admin.do("DELETE", "/api/admin/playlists/"+id, "", nil), http.StatusNoContent)
	if films := adminSections(t, admin)[1]; films.Series != 0 {
		t.Fatalf("the shelf still counts %d series", films.Series)
	}
}

func TestAShelfIsCheckedBeforeItIsKept(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	anime := adminSections(t, admin)[2]

	for _, body := range []map[string]any{
		{},
		{"title": "   "},
		{"title": strings.Repeat("a", 61)},
		{"title": "Ok", "description": strings.Repeat("a", 301)},
		{"title": "Ok", "icon": "not one emoji"},
	} {
		expectStatus(t, admin.json("POST", "/api/admin/sections", body), http.StatusBadRequest)
	}
	expectStatus(t, admin.json("PATCH", "/api/admin/sections/"+anime.ID, map[string]any{"title": ""}),
		http.StatusBadRequest)
	expectStatus(t, admin.json("PUT", "/api/admin/sections/"+anime.ID+"/series",
		map[string]any{"playlistIds": []string{"00000000-0000-0000-0000-000000000000"}}), http.StatusBadRequest)
	expectStatus(t, admin.json("PUT", "/api/admin/sections/00000000-0000-0000-0000-000000000000/series",
		map[string]any{"playlistIds": []string{}}), http.StatusNotFound)
}

func TestOnlyAnAdminArrangesTheShelves(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	anime := adminSections(t, admin)[2]

	expectStatus(t, learner.do("GET", "/api/admin/sections", "", nil), http.StatusForbidden)
	expectStatus(t, learner.json("POST", "/api/admin/sections", map[string]any{"title": "Mine"}), http.StatusForbidden)
	expectStatus(t, learner.json("PATCH", "/api/admin/sections/"+anime.ID, map[string]any{"title": "Mine"}),
		http.StatusForbidden)
	expectStatus(t, learner.json("PUT", "/api/admin/sections/"+anime.ID+"/series",
		map[string]any{"playlistIds": []string{}}), http.StatusForbidden)
	expectStatus(t, learner.do("DELETE", "/api/admin/sections/"+anime.ID, "", nil), http.StatusForbidden)
}
