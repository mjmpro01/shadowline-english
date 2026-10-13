package api_test

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/shadowline/server/internal/storage"
)

// A recording can come from a link: the admin pastes a video's address, a
// worker downloads it, and from there it is an upload like any other. The
// worker is Python and does not run here, so storeFetched does what it does
// when a download finishes.

type linkedUploadJSON struct {
	uploadJSON
	SourceURL     string `json:"sourceUrl"`
	SourceCredit  string `json:"sourceCredit"`
	FetchAttempts int    `json:"fetchAttempts"`
}

type creditedClipJSON struct {
	ID           string `json:"id"`
	SourceCredit string `json:"sourceCredit"`
	SourceURL    string `json:"sourceUrl"`
}

const shortLink = "https://www.youtube.com/shorts/abcDEF12345"

func linkUpload(t *testing.T, c *client, link string) sourceJSON {
	t.Helper()
	return expect[sourceJSON](t, c.json("POST", "/api/admin/uploads/link", map[string]any{"url": link}),
		http.StatusCreated)
}

func linkedUpload(t *testing.T, c *client, id string) linkedUploadJSON {
	t.Helper()
	return expect[struct {
		Upload linkedUploadJSON `json:"upload"`
	}](t, c.do("GET", "/api/admin/uploads/"+id, "", nil), http.StatusOK).Upload
}

// storeFetched is the fetch worker's last step: the file in the store, the row
// pointing at it with the video's own title and whose it is, transcription
// queued, and the download off its queue.
func storeFetched(t *testing.T, h *harness, id, title, credit string) {
	t.Helper()
	ctx := context.Background()
	key := "source/" + id + ".mp4"
	if err := h.blobs.Put(ctx, storage.Clips, key, strings.NewReader("fetched video"), -1, "video/mp4"); err != nil {
		t.Fatalf("store the fetched file: %v", err)
	}
	if _, err := h.pool.Exec(ctx, `
		update clip_sources set key = $2, upload_state = 'stored', bytes = 13,
		       name = case when name = source_url then $3 else name end,
		       title = case when title = source_url then $3 else title end,
		       source_credit = $4
		where id = $1`, id, key, title, credit); err != nil {
		t.Fatalf("record the fetched file: %v", err)
	}
	if _, err := h.pool.Exec(ctx, `insert into transcribe_jobs (source_id) values ($1)`, id); err != nil {
		t.Fatalf("queue transcription: %v", err)
	}
	if _, err := h.pool.Exec(ctx, `delete from fetch_jobs where source_id = $1`, id); err != nil {
		t.Fatalf("finish the fetch: %v", err)
	}
}

func TestOnlyAPublicHttpsLinkIsFetched(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")

	expectStatus(t, learner.json("POST", "/api/admin/uploads/link", map[string]any{"url": shortLink}),
		http.StatusForbidden)

	for _, link := range []string{
		"",
		"not a link",
		"http://www.youtube.com/shorts/abc",
		"ftp://example.com/video.mp4",
		"file:///etc/passwd",
		"https://127.0.0.1/video.mp4",
		"https://[::1]/video.mp4",
		"https://169.254.169.254/latest/meta-data/",
		"https://localhost/video.mp4",
		"https://minio/clips/source.mp4",
		"https://api.internal/video",
		"https://printer.local/video",
		"https://user:secret@example.com/video",
		"https://example.com:8443/video",
		"https://example.com/" + strings.Repeat("a", 2100),
	} {
		resp := admin.json("POST", "/api/admin/uploads/link", map[string]any{"url": link})
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("%q: got %d, want 400", link, resp.StatusCode)
		}
		resp.Body.Close()
	}
	if n := listUploads(t, admin, "").Total; n != 0 {
		t.Fatalf("%d uploads recorded for refused links", n)
	}
}

func TestALinkedVideoIsFetchedThenOpenedLikeAFile(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	source := linkUpload(t, admin, "  "+shortLink+"#t=3 ")
	if source.Name != shortLink {
		t.Fatalf("named %q, want the link standing in until the video's title is known", source.Name)
	}

	// Waiting for the worker: visible in the history, saying where it is coming
	// from, with nothing to open yet.
	row := linkedUpload(t, admin, source.ID)
	if row.Status != "fetching" || row.SourceURL != shortLink || row.Transcript != "none" || !row.HasVideo {
		t.Fatalf("before the download: %+v", row)
	}
	var queued string
	if err := h.pool.QueryRow(context.Background(),
		`select url from fetch_jobs where source_id = $1 and state = 'queued'`, source.ID).Scan(&queued); err != nil {
		t.Fatalf("no download queued: %v", err)
	}
	if queued != shortLink {
		t.Fatalf("queued %q", queued)
	}
	expectStatus(t, admin.do("GET", "/api/admin/uploads/"+source.ID+"/media", "", nil), http.StatusConflict)
	if got := listUploads(t, admin, "state=fetching"); got.Total != 1 {
		t.Fatalf("%d uploads fetching, want 1", got.Total)
	}

	storeFetched(t, h, source.ID, "Ordering coffee", "@cafe_english")

	row = linkedUpload(t, admin, source.ID)
	if row.Status != "transcribing" || row.Name != "Ordering coffee" || row.SourceCredit != "@cafe_english" {
		t.Fatalf("after the download: %+v", row)
	}

	// The studio reads the file back to draw it.
	resp := admin.do("GET", "/api/admin/uploads/"+source.ID+"/media", "", nil)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || string(body) != "fetched video" ||
		resp.Header.Get("Content-Type") != "video/mp4" {
		t.Fatalf("media: %d %q %q", resp.StatusCode, resp.Header.Get("Content-Type"), body)
	}
	learner := h.login("learner@example.com")
	expectStatus(t, learner.do("GET", "/api/admin/uploads/"+source.ID+"/media", "", nil), http.StatusForbidden)

	// Every clip cut from it says whose it is.
	clip := aClip("Can I get a latte?")
	clip["sourceId"] = source.ID
	published := expect[[]creditedClipJSON](t, admin.json("POST", "/api/admin/clips",
		map[string]any{"clips": []map[string]any{clip}}), http.StatusCreated)
	if published[0].SourceCredit != "@cafe_english" || published[0].SourceURL != shortLink {
		t.Fatalf("published clip carries %+v", published[0])
	}
	seen := expect[creditedClipJSON](t, learner.do("GET", "/api/clips/"+published[0].ID, "", nil), http.StatusOK)
	if seen.SourceCredit != "@cafe_english" || seen.SourceURL != shortLink {
		t.Fatalf("the learner's clip carries %+v", seen)
	}
}

func TestAFileUploadHasNoCredit(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "own.mp4")
	clip := aClip("Mine")
	clip["sourceId"] = source.ID
	published := expect[[]creditedClipJSON](t, admin.json("POST", "/api/admin/clips",
		map[string]any{"clips": []map[string]any{clip}}), http.StatusCreated)
	if published[0].SourceCredit != "" || published[0].SourceURL != "" {
		t.Fatalf("a file upload's clip carries %+v", published[0])
	}
}

func TestAFailedDownloadIsRetried(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := linkUpload(t, admin, shortLink)
	ctx := context.Background()

	// What the worker leaves when it gives up.
	if _, err := h.pool.Exec(ctx, `
		update fetch_jobs set state = 'failed', attempts = 3, error = 'the video is private'
		where source_id = $1`, source.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, `
		update clip_sources set upload_state = 'failed', error = 'the video is private'
		where id = $1`, source.ID); err != nil {
		t.Fatal(err)
	}
	row := linkedUpload(t, admin, source.ID)
	if row.Status != "upload-failed" || row.Error != "the video is private" || row.FetchAttempts != 3 {
		t.Fatalf("after giving up: %+v", row)
	}

	retried := expect[struct {
		Fetch      int `json:"fetch"`
		Transcribe int `json:"transcribe"`
	}](t, admin.json("POST", "/api/admin/uploads/"+source.ID+"/retry", nil), http.StatusOK)
	if retried.Fetch != 1 || retried.Transcribe != 0 {
		t.Fatalf("retry: %+v, want the download queued again", retried)
	}
	row = linkedUpload(t, admin, source.ID)
	if row.Status != "fetching" || row.Error != "" || row.FetchAttempts != 0 {
		t.Fatalf("after a retry: %+v", row)
	}

	// A file upload that never arrived still has nothing to retry.
	id := announce(t, admin, "episode.mp4", "video/mp4")
	expectStatus(t, admin.do("PUT", "/api/admin/uploads/"+id+"/file", "text/plain",
		strings.NewReader("not a video")), http.StatusUnsupportedMediaType)
	expectStatus(t, admin.json("POST", "/api/admin/uploads/"+id+"/retry", nil), http.StatusConflict)
}
