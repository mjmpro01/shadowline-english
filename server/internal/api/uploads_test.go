package api_test

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"testing"
)

/**
 * The upload history, and the status each row reports.
 *
 * Almost none of that status is stored: whether the words are still coming,
 * whether the clips still owe a picture, whether any of it was published are all
 * read back out of the job tables at query time. So these tests put the database
 * into each shape and check the one word the console shows.
 */

type uploadJSON struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Status             string  `json:"status"`
	UploadState        string  `json:"uploadState"`
	Error              string  `json:"error"`
	Bytes              int64   `json:"bytes"`
	Seconds            float64 `json:"seconds"`
	HasVideo           bool    `json:"hasVideo"`
	Published          bool    `json:"published"`
	Clips              int     `json:"clips"`
	ClipsWithoutAudio  int     `json:"clipsWithoutAudio"`
	CutsLeft           int     `json:"cutsLeft"`
	CutsFailed         int     `json:"cutsFailed"`
	Transcript         string  `json:"transcript"`
	TranscribeAttempts int     `json:"transcribeAttempts"`
	PlaylistTitle      string  `json:"playlistTitle"`
}

type uploadListJSON struct {
	Uploads []uploadJSON `json:"uploads"`
	Total   int          `json:"total"`
}

func listUploads(t *testing.T, c *client, query string) uploadListJSON {
	t.Helper()
	return expect[uploadListJSON](t, c.do("GET", "/api/admin/uploads?"+query, "", nil), http.StatusOK)
}

/** Announces an upload without sending it: the row a transfer in flight has. */
func announce(t *testing.T, c *client, name, contentType string) string {
	t.Helper()
	got := expect[sourceJSON](t, c.json("POST", "/api/admin/uploads", map[string]any{
		"name": name, "contentType": contentType, "bytes": 4096, "seconds": 61.5,
	}), http.StatusCreated)
	return got.ID
}

func sendFile(t *testing.T, c *client, id, contentType string) {
	t.Helper()
	expectStatus(t, c.do("PUT", "/api/admin/uploads/"+id+"/file", contentType,
		bytes.NewReader([]byte("pretend recording"))), http.StatusOK)
}

func TestAnUploadIsVisibleBeforeItsBytesArrive(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	id := announce(t, admin, "episode.mp4", "video/mp4")

	page := listUploads(t, admin, "")
	if page.Total != 1 {
		t.Fatalf("history holds %d uploads, want 1", page.Total)
	}
	row := page.Uploads[0]
	if row.Status != "uploading" {
		t.Fatalf("status %q — an upload in flight is the whole reason the row exists", row.Status)
	}
	// What it says about itself comes from the browser, which has decoded the
	// file by the time it starts sending it. This server has not.
	if row.Bytes != 4096 || row.Seconds != 61.5 {
		t.Fatalf("size and length came back as %d bytes / %.1fs", row.Bytes, row.Seconds)
	}
	if !row.HasVideo {
		t.Fatal("an .mp4 should be queued for cutting once it is published")
	}
	// Nothing is queued yet: a transcribe job against an empty key would burn
	// its attempts and be dropped before the file it was waiting for arrived.
	if row.Transcript != "none" {
		t.Fatalf("transcript %q before the file is even here", row.Transcript)
	}
	if h.transcribeQueueDepth(t) != 0 {
		t.Fatal("transcription was queued for a recording that has not arrived")
	}

	sendFile(t, admin, id, "video/mp4")

	row = listUploads(t, admin, "").Uploads[0]
	if row.Status != "transcribing" {
		t.Fatalf("status %q once the bytes have landed, want transcribing", row.Status)
	}
	if h.transcribeQueueDepth(t) != 1 {
		t.Fatal("the words were never queued for a stored recording")
	}
}

func TestSendingAnUploadTwiceIsRefused(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	id := announce(t, admin, "episode.mp4", "video/mp4")
	sendFile(t, admin, id, "video/mp4")

	expectStatus(t, admin.do("PUT", "/api/admin/uploads/"+id+"/file", "video/mp4",
		bytes.NewReader([]byte("again"))), http.StatusConflict)
}

// Every status the console can show, from the database shape behind it.
func TestTheStatusFollowsTheWork(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	statusOf := func(id string) string {
		t.Helper()
		got := expect[struct {
			Upload uploadJSON `json:"upload"`
		}](t, admin.do("GET", "/api/admin/uploads/"+id, "", nil), http.StatusOK)
		return got.Upload.Status
	}

	t.Run("the words arrive and nothing is published yet", func(t *testing.T) {
		id := announce(t, admin, "ready.mp4", "video/mp4")
		sendFile(t, admin, id, "video/mp4")
		h.storeTranscript(t, id)
		if got := statusOf(id); got != "ready" {
			t.Fatalf("status %q, want ready", got)
		}
	})

	t.Run("the words are not coming", func(t *testing.T) {
		id := announce(t, admin, "quiet.mp4", "video/mp4")
		sendFile(t, admin, id, "video/mp4")
		// What giving up looks like: the worker deletes the job and writes no
		// transcript, which is what makes the studio stop promising words.
		h.dropTranscribeJob(t, id)
		if got := statusOf(id); got != "transcribe-failed" {
			t.Fatalf("status %q, want transcribe-failed", got)
		}
	})

	t.Run("published, with the cutter still working", func(t *testing.T) {
		id := announce(t, admin, "cutting.mp4", "video/mp4")
		sendFile(t, admin, id, "video/mp4")
		h.storeTranscript(t, id)
		clip := aClip("Line one")
		clip["sourceId"] = id
		publishClips(t, admin, clip)
		if got := statusOf(id); got != "cutting" {
			t.Fatalf("status %q, want cutting", got)
		}
	})

	t.Run("published, and the cutter gave up", func(t *testing.T) {
		id := announce(t, admin, "gaveup.mp4", "video/mp4")
		sendFile(t, admin, id, "video/mp4")
		h.storeTranscript(t, id)
		clip := aClip("Line one")
		clip["sourceId"] = id
		published := publishClips(t, admin, clip)
		// Giving up costs the clip its picture and nothing else: the job goes,
		// video_key stays null.
		h.dropCutJobs(t, id)
		if got := statusOf(id); got != "cut-failed" {
			t.Fatalf("status %q, want cut-failed", got)
		}
		h.attachVideo(t, published[0].ID)
		if got := statusOf(id); got != "done" {
			t.Fatalf("status %q once every picture is there, want done", got)
		}
	})

	t.Run("audio has no picture to wait for", func(t *testing.T) {
		id := announce(t, admin, "lesson.wav", "audio/wav")
		sendFile(t, admin, id, "audio/wav")
		h.storeTranscript(t, id)
		clip := aClip("Line one")
		clip["sourceId"] = id
		publishClips(t, admin, clip)
		if got := statusOf(id); got != "done" {
			t.Fatalf("status %q — an audio upload is finished when it is published", got)
		}
	})
}

func TestTheHistoryCountsWhatIsWorthKnowing(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	id := announce(t, admin, "counted.mp4", "video/mp4")
	sendFile(t, admin, id, "video/mp4")
	clips := []map[string]any{}
	for i := 1; i <= 3; i++ {
		clip := aClip(fmt.Sprintf("Line %d", i))
		clip["sourceId"] = id
		clips = append(clips, clip)
	}
	published := publishClips(t, admin, clips...)

	// One of the three gets its audio, which is what publishing does per clip.
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+published[0].ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1.0))), http.StatusOK)

	got := expect[struct {
		Upload uploadJSON `json:"upload"`
		Clips  []clipJSON `json:"clips"`
	}](t, admin.do("GET", "/api/admin/uploads/"+id, "", nil), http.StatusOK)

	if got.Upload.Clips != 3 {
		t.Fatalf("%d clips, want 3", got.Upload.Clips)
	}
	// The two that never got their sound. A take against one of those is kept
	// and measured but not scored, so it is worth saying rather than hiding.
	if got.Upload.ClipsWithoutAudio != 2 {
		t.Fatalf("%d clips without audio, want 2", got.Upload.ClipsWithoutAudio)
	}
	if got.Upload.CutsLeft != 3 {
		t.Fatalf("%d cuts outstanding, want 3", got.Upload.CutsLeft)
	}
	if got.Upload.PlaylistTitle != "Lesson one" {
		t.Fatalf("playlist %q — the history should name the series it went to", got.Upload.PlaylistTitle)
	}
	if len(got.Clips) != 3 {
		t.Fatalf("the detail listed %d clips, want 3", len(got.Clips))
	}
}

func TestTheHistoryIsSearchedFilteredAndPaged(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	for i := 1; i <= 3; i++ {
		id := announce(t, admin, fmt.Sprintf("friends-s01e%02d.mp4", i), "video/mp4")
		sendFile(t, admin, id, "video/mp4")
	}
	// One still on its way, and one that never arrived.
	announce(t, admin, "bigbang-s01e01.mp4", "video/mp4")
	failed := announce(t, admin, "lost.mp4", "video/mp4")
	h.failUpload(t, failed, "the upload did not finish")

	if got := listUploads(t, admin, "").Total; got != 5 {
		t.Fatalf("history holds %d, want 5", got)
	}
	if got := listUploads(t, admin, "q=friends").Total; got != 3 {
		t.Fatalf("searching for friends found %d, want 3", got)
	}
	if got := listUploads(t, admin, "state=uploading").Total; got != 1 {
		t.Fatalf("%d still uploading, want 1", got)
	}
	lost := listUploads(t, admin, "state=upload-failed")
	if lost.Total != 1 {
		t.Fatalf("%d failed, want 1", lost.Total)
	}
	if lost.Uploads[0].Error == "" {
		t.Fatal("a failed upload with no reason on it is what this whole column is for")
	}

	// Newest first, and a page is a page.
	page := listUploads(t, admin, "limit=2")
	if len(page.Uploads) != 2 || page.Total != 5 {
		t.Fatalf("page of %d out of %d, want 2 of 5", len(page.Uploads), page.Total)
	}
	if page.Uploads[0].Name != "lost.mp4" {
		t.Fatalf("first row is %q — the history reads newest first", page.Uploads[0].Name)
	}
	rest := listUploads(t, admin, "limit=2&offset=4")
	if len(rest.Uploads) != 1 {
		t.Fatalf("last page holds %d, want 1", len(rest.Uploads))
	}
}

func TestRetryQueuesOnlyWhatGaveUp(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	id := announce(t, admin, "retry.mp4", "video/mp4")
	sendFile(t, admin, id, "video/mp4")
	clip := aClip("Line one")
	clip["sourceId"] = id
	publishClips(t, admin, clip)

	// Nothing has given up yet, so there is nothing to retry — and saying so is
	// better than implying something has been started.
	quiet := expect[struct {
		Transcribe int `json:"transcribe"`
		Cuts       int `json:"cuts"`
	}](t, admin.json("POST", "/api/admin/uploads/"+id+"/retry", nil), http.StatusOK)
	if quiet.Transcribe != 0 || quiet.Cuts != 0 {
		t.Fatalf("retry queued %d transcripts and %d cuts with nothing failed", quiet.Transcribe, quiet.Cuts)
	}

	h.dropTranscribeJob(t, id)
	h.dropCutJobs(t, id)

	again := expect[struct {
		Transcribe int `json:"transcribe"`
		Cuts       int `json:"cuts"`
	}](t, admin.json("POST", "/api/admin/uploads/"+id+"/retry", nil), http.StatusOK)
	if again.Transcribe != 1 || again.Cuts != 1 {
		t.Fatalf("retry queued %d transcripts and %d cuts, want 1 and 1", again.Transcribe, again.Cuts)
	}
	if h.transcribeQueueDepth(t) != 1 || h.cutQueueDepth(t) != 1 {
		t.Fatal("the queues do not hold the work retry said it queued")
	}
}

func TestRetryingAnUploadThatNeverArrivedIsRefused(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	id := announce(t, admin, "lost.mp4", "video/mp4")

	expectStatus(t, admin.json("POST", "/api/admin/uploads/"+id+"/retry", nil), http.StatusConflict)
}

func TestTheHistoryIsAdminOnly(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	expectStatus(t, learner.do("GET", "/api/admin/uploads", "", nil), http.StatusForbidden)
	expectStatus(t, learner.json("POST", "/api/admin/uploads",
		map[string]any{"name": "sneaked.mp4"}), http.StatusForbidden)
	expectStatus(t, h.anonymous().do("GET", "/api/admin/uploads", "", nil), http.StatusUnauthorized)

	_ = context.Background()
}
