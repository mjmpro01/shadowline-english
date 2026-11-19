package api_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

// Where a learner left off, what is new to them, and the series they follow.

type continueJSON struct {
	Continue *struct {
		Episode   episodeJSON  `json:"episode"`
		Playlist  playlistJSON `json:"playlist"`
		Total     int          `json:"total"`
		Practised int          `json:"practised"`
		Next      clipJSON     `json:"next"`
	} `json:"continue"`
}

type newJSON struct {
	Episodes []struct {
		ID             string `json:"id"`
		Title          string `json:"title"`
		PlaylistSlug   string `json:"playlistSlug"`
		Followed       bool   `json:"followed"`
		SinceLastVisit bool   `json:"sinceLastVisit"`
	} `json:"episodes"`
	Series map[string]int `json:"series"`
}

type followingJSON struct {
	Playlist  playlistJSON `json:"playlist"`
	Following bool         `json:"following"`
}

// publishedEpisode publishes an episode of lines in a series, in the order spoken.
func publishedEpisode(t *testing.T, admin *client, series, file string, lines ...string) (string, []clipJSON) {
	t.Helper()
	source := uploadSource(t, admin, file)
	var clips []map[string]any
	for i, line := range lines {
		clip := inPlaylist(line, series)
		clip["sourceId"] = source.ID
		clip["startSeconds"] = float64(i * 5)
		clip["endSeconds"] = float64(i*5 + 3)
		clips = append(clips, clip)
	}
	return source.ID, publishClips(t, admin, clips...)
}

func TestALearnerPicksUpWhereTheyLeftOff(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	// Published out of order: the next is the next spoken, not the next made.
	source := uploadSource(t, admin, "s01e01.mp4")
	at := func(title string, start float64) map[string]any {
		clip := inPlaylist(title, "Friends")
		clip["sourceId"] = source.ID
		clip["startSeconds"] = start
		clip["endSeconds"] = start + 3
		return clip
	}
	clips := publishClips(t, admin, at("Third", 12), at("First", 2), at("Second", 7))
	byTitle := map[string]string{}
	for _, c := range clips {
		byTitle[c.Title] = c.ID
	}
	learner := h.login("learner@example.com")

	if got := expect[continueJSON](t, learner.json("GET", "/api/continue", nil), http.StatusOK); got.Continue != nil {
		t.Fatalf("somewhere to continue before any take: %+v", got.Continue)
	}
	record(t, learner, byTitle["First"])
	got := expect[continueJSON](t, learner.json("GET", "/api/continue", nil), http.StatusOK)
	if got.Continue == nil || got.Continue.Next.Title != "Second" || got.Continue.Total != 3 ||
		got.Continue.Practised != 1 || got.Continue.Playlist.Slug != "friends" || got.Continue.Episode.ID != source.ID {
		t.Fatalf("after the first line: %+v", got.Continue)
	}
	record(t, learner, byTitle["Third"])
	record(t, learner, byTitle["Second"])
	if got := expect[continueJSON](t, learner.json("GET", "/api/continue", nil), http.StatusOK); got.Continue != nil {
		t.Fatalf("a finished episode to continue: %+v", got.Continue)
	}
}

func TestPractisingFollowsASeriesUntilTheLearnerStops(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	_, clips := publishedEpisode(t, admin, "Friends", "s01e01.mp4", "One", "Two", "Three")
	learner := h.login("learner@example.com")
	following := func() bool {
		return expect[followingJSON](t, learner.json("GET", "/api/playlists/friends", nil), http.StatusOK).Following
	}

	if following() {
		t.Fatal("following before practising")
	}
	record(t, learner, clips[0].ID)
	if !following() {
		t.Fatal("practising did not follow the series")
	}
	expectStatus(t, learner.json("DELETE", "/api/playlists/friends/follow", nil), http.StatusOK)
	record(t, learner, clips[1].ID)
	if following() {
		t.Fatal("practising again followed a series the learner had left")
	}
	expectStatus(t, learner.json("PUT", "/api/playlists/friends/follow", nil), http.StatusOK)
	if !following() {
		t.Fatal("not followed again")
	}
	expectStatus(t, learner.json("PUT", "/api/playlists/nowhere/follow", nil), http.StatusNotFound)
}

func TestAnEpisodeIsNewUntilItIsOpened(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	friends, _ := publishedEpisode(t, admin, "Friends", "s01e01.mp4", "One", "Two")
	office, _ := publishedEpisode(t, admin, "Office", "office01.mp4", "Three")
	learner := h.login("learner@example.com")
	ctx := context.Background()

	got := expect[newJSON](t, learner.json("GET", "/api/new", nil), http.StatusOK)
	if len(got.Episodes) != 2 || len(got.Series) != 2 {
		t.Fatalf("new: %+v", got)
	}
	// A followed series comes first.
	expectStatus(t, learner.json("PUT", "/api/playlists/office/follow", nil), http.StatusOK)
	got = expect[newJSON](t, learner.json("GET", "/api/new", nil), http.StatusOK)
	if got.Episodes[0].ID != office || !got.Episodes[0].Followed {
		t.Fatalf("a followed series first: %+v", got.Episodes)
	}

	// Opened, it is no longer new.
	expectStatus(t, learner.json("POST", "/api/episodes/"+office+"/seen", nil), http.StatusNoContent)
	got = expect[newJSON](t, learner.json("GET", "/api/new", nil), http.StatusOK)
	if len(got.Episodes) != 1 || got.Episodes[0].ID != friends {
		t.Fatalf("after opening one: %+v", got.Episodes)
	}
	expectStatus(t, learner.json("POST", "/api/episodes/"+uuid.NewString()+"/seen", nil), http.StatusNotFound)

	// New since the last visit: published after the last day they came.
	id := h.userID(t, "learner@example.com")
	if _, err := h.pool.Exec(ctx, `
		insert into user_days (user_id, day) values ($1, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 2)`, id); err != nil {
		t.Fatal(err)
	}
	if got = expect[newJSON](t, learner.json("GET", "/api/new", nil), http.StatusOK); !got.Episodes[0].SinceLastVisit {
		t.Fatalf("published today, after a visit two days ago: %+v", got.Episodes)
	}
	if _, err := h.pool.Exec(ctx, `update clip_sources set published_at = now() - interval '3 days' where id = $1`, friends); err != nil {
		t.Fatal(err)
	}
	if got = expect[newJSON](t, learner.json("GET", "/api/new", nil), http.StatusOK); got.Episodes[0].SinceLastVisit {
		t.Fatalf("published before the last visit: %+v", got.Episodes)
	}

	// And after two weeks, nothing is new.
	if _, err := h.pool.Exec(ctx, `update clip_sources set published_at = now() - interval '15 days' where id = $1`, friends); err != nil {
		t.Fatal(err)
	}
	if got = expect[newJSON](t, learner.json("GET", "/api/new", nil), http.StatusOK); len(got.Episodes) != 0 || len(got.Series) != 0 {
		t.Fatalf("an old episode is new: %+v", got)
	}
}

func TestAnEpisodePractisedInIsNotNew(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	_, clips := publishedEpisode(t, admin, "Friends", "s01e01.mp4", "One", "Two")
	learner := h.login("learner@example.com")
	record(t, learner, clips[0].ID)
	if got := expect[newJSON](t, learner.json("GET", "/api/new", nil), http.StatusOK); len(got.Episodes) != 0 {
		t.Fatalf("new after practising in it: %+v", got.Episodes)
	}
}

func TestAnEpisodeIsPublishedOnceAndKeepsTheDay(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	ctx := context.Background()
	at := func(id string) *string {
		var published *string
		if err := h.pool.QueryRow(ctx, `select published_at::text from clip_sources where id = $1`, id).Scan(&published); err != nil {
			t.Fatal(err)
		}
		return published
	}

	source := uploadSource(t, admin, "s01e02.mp4")
	if at(source.ID) != nil {
		t.Fatal("an upload not yet published has a publish time")
	}
	clip := inPlaylist("One", "Friends")
	clip["sourceId"] = source.ID
	publishClips(t, admin, clip)
	if at(source.ID) == nil {
		t.Fatal("publishing a clip did not publish the episode's time")
	}
	if _, err := h.pool.Exec(ctx, `update clip_sources set published_at = '2026-01-01' where id = $1`, source.ID); err != nil {
		t.Fatal(err)
	}
	another := inPlaylist("Two", "Friends")
	another["sourceId"] = source.ID
	publishClips(t, admin, another)
	if got := at(source.ID); got == nil || (*got)[:10] != "2026-01-01" {
		t.Fatalf("another clip moved the publish time: %v", got)
	}

	// Switched on from the console, an episode never published gets its time.
	other := uploadSource(t, admin, "s01e03.mp4")
	expectStatus(t, admin.json("PATCH", "/api/admin/episodes/"+other.ID, map[string]any{"published": true}), http.StatusOK)
	if at(other.ID) == nil {
		t.Fatal("published from the console without a time")
	}
}
