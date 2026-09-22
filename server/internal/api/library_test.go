package api_test

import (
	"net/http"
	"net/url"
	"testing"
)

// The library is a tree now: a series, its episodes, and the clips cut out of
// each. These tests are about the tree standing up from what the studio already
// publishes — an admin types a playlist name, and no second screen has to be
// visited before a learner can find the series.

type playlistJSON struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Hot         bool   `json:"hot"`
	RecentTakes int    `json:"recentTakes"`
	Videos      int    `json:"videos"`
	Clips       int    `json:"clips"`
}

type videoJSON struct {
	ID         string  `json:"id"`
	PlaylistID *string `json:"playlistId"`
	Title      string  `json:"title"`
	Published  bool    `json:"published"`
	Clips      int     `json:"clips"`
	Seconds    float64 `json:"seconds"`
}

type playlistPageJSON struct {
	Playlist playlistJSON `json:"playlist"`
	Videos   []videoJSON  `json:"videos"`
}

type videoPageJSON struct {
	Video    videoJSON     `json:"video"`
	Playlist *playlistJSON `json:"playlist"`
	Clips    []clipJSON    `json:"clips"`
}

type searchJSON struct {
	Playlists []playlistJSON `json:"playlists"`
	Videos    []videoJSON    `json:"videos"`
	Clips     []clipJSON     `json:"clips"`
}

// inPlaylist is aClip under a named series, which is how the studio publishes.
func inPlaylist(title, playlist string) map[string]any {
	clip := aClip(title)
	clip["playlist"] = playlist
	return clip
}

func playlists(t *testing.T, c *client) []playlistJSON {
	t.Helper()
	return expect[[]playlistJSON](t, c.do("GET", "/api/playlists", "", nil), http.StatusOK)
}

func TestPublishingUnderANameStartsTheSeries(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"), inPlaylist("Line two", "Friends"))

	listed := playlists(t, h.login("learner@example.com"))
	if len(listed) != 1 {
		t.Fatalf("publishing two clips of one series made %d playlists, want 1", len(listed))
	}
	if listed[0].Title != "Friends" || listed[0].Slug != "friends" {
		t.Fatalf("playlist came back as %+v", listed[0])
	}
	if listed[0].Clips != 2 {
		t.Fatalf("the series counts %d clips, want 2", listed[0].Clips)
	}
}

// Two admins typing the same name in different cases mean one series. Finding
// that out from two rows in the library would be finding out too late.
func TestASeriesIsOneRowHoweverItIsCapitalised(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"))
	publishClips(t, admin, inPlaylist("Line two", "friends"))

	listed := playlists(t, admin)
	if len(listed) != 1 {
		t.Fatalf("%d playlists, want 1: %+v", len(listed), listed)
	}
	if listed[0].Clips != 2 {
		t.Fatalf("the series counts %d clips, want 2", listed[0].Clips)
	}
}

// Two series whose names reduce to the same url still need two addresses.
func TestTwoSeriesNeverShareASlug(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("a", "The Office"))
	publishClips(t, admin, inPlaylist("b", "The!Office"))

	listed := playlists(t, admin)
	if len(listed) != 2 {
		t.Fatalf("%d playlists, want 2", len(listed))
	}
	if listed[0].Slug == listed[1].Slug {
		t.Fatalf("both series live at %q", listed[0].Slug)
	}
}

// A name with nothing a url can carry still has to be reachable.
func TestASeriesNamedOnlyInAnotherScriptStillHasAnAddress(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("a", "Tiếng Việt"))

	listed := playlists(t, admin)
	if len(listed) != 1 || listed[0].Slug == "" {
		t.Fatalf("playlists came back as %+v", listed)
	}
	page := expect[playlistPageJSON](t,
		admin.do("GET", "/api/playlists/"+url.PathEscape(listed[0].Slug), "", nil), http.StatusOK)
	if page.Playlist.Title != "Tiếng Việt" {
		t.Fatalf("the slug leads to %q", page.Playlist.Title)
	}
}

func TestAnUploadBecomesAnEpisodeOfTheSeries(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "s01e01.mp4")

	clip := inPlaylist("Line one", "Friends")
	clip["sourceId"] = source.ID
	clip["durationSeconds"] = 2.0
	publishClips(t, admin, clip)

	learner := h.login("learner@example.com")
	page := expect[playlistPageJSON](t, learner.do("GET", "/api/playlists/friends", "", nil), http.StatusOK)
	if len(page.Videos) != 1 {
		t.Fatalf("the series has %d episodes, want 1", len(page.Videos))
	}
	if page.Videos[0].Title != "s01e01.mp4" {
		t.Fatalf("the episode is called %q, want the name of the file it was cut from", page.Videos[0].Title)
	}
	if page.Videos[0].Clips != 1 || page.Videos[0].Seconds != 2 {
		t.Fatalf("episode counts came back as %+v", page.Videos[0])
	}

	video := expect[videoPageJSON](t, learner.do("GET", "/api/videos/"+page.Videos[0].ID, "", nil), http.StatusOK)
	if len(video.Clips) != 1 || video.Clips[0].Title != "Line one" {
		t.Fatalf("the episode holds %+v", video.Clips)
	}
	if video.Playlist == nil || video.Playlist.Title != "Friends" {
		t.Fatalf("the episode does not say which series it is in: %+v", video.Playlist)
	}
}

// An upload nobody has published clips out of is an admin's unfinished work,
// not an episode. Showing it would offer a learner an empty screen.
func TestAnUploadWithNoClipsIsNotAnEpisode(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	uploadSource(t, admin, "unfinished.mp4")
	publishClips(t, admin, inPlaylist("Line one", "Friends"))

	page := expect[playlistPageJSON](t, admin.do("GET", "/api/playlists/friends", "", nil), http.StatusOK)
	for _, v := range page.Videos {
		if v.Title == "unfinished.mp4" {
			t.Fatal("an upload nobody published from is being offered as an episode")
		}
	}
}

// Clips published without an upload — every clip from before video existed —
// still have to hang somewhere now that the library is a tree.
func TestClipsWithNoUploadStillLandInAnEpisode(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"))

	page := expect[playlistPageJSON](t, admin.do("GET", "/api/playlists/friends", "", nil), http.StatusOK)
	if len(page.Videos) != 1 {
		t.Fatalf("a clip with no upload gave the series %d episodes, want 1", len(page.Videos))
	}
	video := expect[videoPageJSON](t, admin.do("GET", "/api/videos/"+page.Videos[0].ID, "", nil), http.StatusOK)
	if len(video.Clips) != 1 {
		t.Fatalf("the episode holds %d clips, want 1", len(video.Clips))
	}
}

func TestAnUnknownSeriesIsNotFound(t *testing.T) {
	h := newHarness(t)
	expectStatus(t, h.login("learner@example.com").do("GET", "/api/playlists/no-such-series", "", nil),
		http.StatusNotFound)
}

func TestTheLibraryNeedsALogin(t *testing.T) {
	h := newHarness(t)
	for _, path := range []string{"/api/playlists", "/api/playlists/friends", "/api/library/search?q=line"} {
		expectStatus(t, h.anonymous().do("GET", path, "", nil), http.StatusUnauthorized)
	}
}

// ------------------------------------------------------------------ the badge

func TestOnlyAnAdminCanMarkASeriesHot(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"))
	id := playlists(t, admin)[0].ID

	learner := h.login("learner@example.com")
	expectStatus(t, learner.json("PATCH", "/api/admin/playlists/"+id, map[string]any{"hot": true}),
		http.StatusForbidden)

	got := expect[playlistJSON](t, admin.json("PATCH", "/api/admin/playlists/"+id,
		map[string]any{"hot": true, "description": "Ten seasons"}), http.StatusOK)
	if !got.Hot || got.Description != "Ten seasons" {
		t.Fatalf("the studio's edit did not take: %+v", got)
	}
	if !playlists(t, learner)[0].Hot {
		t.Fatal("the learner cannot see the badge")
	}
}

// Hot is a decision; the number beside it is a measurement, so a badge nobody
// has earned is visible as such rather than looking like evidence.
func TestTheHotBadgeCarriesWhatItIsWorth(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, inPlaylist("Line one", "Friends"))[0]

	if playlists(t, admin)[0].RecentTakes != 0 {
		t.Fatal("a series nobody has practised is counting takes")
	}
	learner := h.login("learner@example.com")
	record(t, learner, clip.ID)
	if n := playlists(t, learner)[0].RecentTakes; n != 1 {
		t.Fatalf("the series counts %d takes this week, want 1", n)
	}
}

// Hot first, because that is the whole point of the flag.
func TestTheHotSeriesComesFirst(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("a", "Alpha"), inPlaylist("z", "Zulu"))

	var zulu string
	for _, p := range playlists(t, admin) {
		if p.Title == "Zulu" {
			zulu = p.ID
		}
	}
	expect[playlistJSON](t, admin.json("PATCH", "/api/admin/playlists/"+zulu,
		map[string]any{"hot": true}), http.StatusOK)

	if first := playlists(t, admin)[0]; first.Title != "Zulu" {
		t.Fatalf("the library leads with %q rather than the hot series", first.Title)
	}
}

// Renaming the series has to rewrite the copy each clip keeps, or the library
// lists it under one name and filters it under the other.
func TestRenamingASeriesRenamesItOnItsClips(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Freinds"))
	id := playlists(t, admin)[0].ID

	expect[playlistJSON](t, admin.json("PATCH", "/api/admin/playlists/"+id,
		map[string]any{"title": "Friends"}), http.StatusOK)

	clips := expect[[]clipJSON](t, admin.do("GET", "/api/clips", "", nil), http.StatusOK)
	if clips[0].Playlist != "Friends" {
		t.Fatalf("the clip still says %q", clips[0].Playlist)
	}
}

// ------------------------------------------------------------------- the studio

func TestAnEpisodeCanBeMovedToAnotherSeries(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "s01e01.mp4")
	clip := inPlaylist("Line one", "Friends")
	clip["sourceId"] = source.ID
	publishClips(t, admin, clip)
	publishClips(t, admin, inPlaylist("Other", "Seinfeld"))

	var seinfeld string
	for _, p := range playlists(t, admin) {
		if p.Title == "Seinfeld" {
			seinfeld = p.ID
		}
	}
	got := expect[videoJSON](t, admin.json("PATCH", "/api/admin/videos/"+source.ID,
		map[string]any{"playlistId": seinfeld, "title": "Pilot"}), http.StatusOK)
	if got.Title != "Pilot" || got.PlaylistID == nil || *got.PlaylistID != seinfeld {
		t.Fatalf("the episode came back as %+v", got)
	}

	// Its clips went with it: a clip is in the episode it was cut from.
	page := expect[playlistPageJSON](t, admin.do("GET", "/api/playlists/friends", "", nil), http.StatusOK)
	if len(page.Videos) != 0 {
		t.Fatalf("the old series still lists %d episodes", len(page.Videos))
	}
	clips := expect[[]clipJSON](t, admin.do("GET", "/api/clips", "", nil), http.StatusOK)
	for _, c := range clips {
		if c.Title == "Line one" && c.Playlist != "Seinfeld" {
			t.Fatalf("the clip stayed in %q", c.Playlist)
		}
	}
}

func TestOnlyAnAdminCanRearrangeEpisodes(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "s01e01.mp4")
	clip := inPlaylist("Line one", "Friends")
	clip["sourceId"] = source.ID
	publishClips(t, admin, clip)

	expectStatus(t, h.login("learner@example.com").json("PATCH", "/api/admin/videos/"+source.ID,
		map[string]any{"title": "Mine now"}), http.StatusForbidden)
}

// -------------------------------------------------------------------- search

func TestSearchFindsAllThreeLevels(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "pivot-episode.mp4")
	clip := inPlaylist("The sofa", "Friends")
	clip["sourceId"] = source.ID
	clip["captions"] = []map[string]string{{"text": "PIVOT! Pivot!", "ipa": "/ˈpɪvət/"}}
	publishClips(t, admin, clip)

	learner := h.login("learner@example.com")
	got := expect[searchJSON](t, learner.do("GET", "/api/library/search?q=pivot", "", nil), http.StatusOK)
	if len(got.Videos) != 1 {
		t.Fatalf("searching for a word in an episode's name found %d episodes", len(got.Videos))
	}
	if len(got.Clips) != 1 {
		t.Fatalf("searching for a spoken word found %d clips", len(got.Clips))
	}

	got = expect[searchJSON](t, learner.do("GET", "/api/library/search?q=friend", "", nil), http.StatusOK)
	if len(got.Playlists) != 1 {
		t.Fatalf("searching for part of a series name found %d series", len(got.Playlists))
	}
}

// A learner types half a line they half remember, which is not a whole word.
func TestSearchFindsAFragmentOfALine(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := inPlaylist("The sofa", "Friends")
	clip["captions"] = []map[string]string{{"text": "We were on a break!", "ipa": "/x/"}}
	publishClips(t, admin, clip)

	got := expect[searchJSON](t, h.login("learner@example.com").
		do("GET", "/api/library/search?q="+url.QueryEscape("on a brea"), "", nil), http.StatusOK)
	if len(got.Clips) != 1 {
		t.Fatalf("a fragment of a spoken line found %d clips", len(got.Clips))
	}
}

// One letter matches most of the library and answers nothing, so it answers
// nothing rather than everything.
func TestSearchIgnoresAQueryTooShortToMeanAnything(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"))

	for _, q := range []string{"", "f"} {
		got := expect[searchJSON](t, admin.do("GET", "/api/library/search?q="+q, "", nil), http.StatusOK)
		if len(got.Playlists)+len(got.Videos)+len(got.Clips) != 0 {
			t.Fatalf("%q answered with the library", q)
		}
	}
}

// The wildcards belong to SQL, not to the learner: typing one should find a
// clip with one in it, not every clip there is.
func TestSearchTreatsAWildcardAsALetter(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	publishClips(t, admin, inPlaylist("Line one", "Friends"))

	got := expect[searchJSON](t, admin.do("GET", "/api/library/search?q="+url.QueryEscape("%%"), "", nil),
		http.StatusOK)
	if len(got.Clips) != 0 {
		t.Fatalf("a wildcard matched %d clips", len(got.Clips))
	}
}
