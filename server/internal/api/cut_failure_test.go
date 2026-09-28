package api_test

import (
	"net/http"
	"testing"
)

// A cut the cutter gave up on says why in the upload history, stops reading as
// work still coming, and goes back to the start of its attempts on a retry.
func TestAGivenUpCutSaysWhyAndCanBeRetried(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	id := announce(t, admin, "friends.mp4", "video/mp4")
	sendFile(t, admin, id, "video/mp4")
	clip := aClip("I have an idea.")
	clip["sourceId"] = id
	published := publishClips(t, admin, clip)
	h.storeTranscript(t, id)

	h.giveUpCutting(t, id, "sound: Invalid data found when processing input")

	type uploadRow struct {
		Status     string `json:"status"`
		CutsLeft   int    `json:"cutsLeft"`
		CutsFailed int    `json:"cutsFailed"`
		CutError   string `json:"cutError"`
	}
	upload := expect[struct {
		Upload uploadRow `json:"upload"`
	}](t, admin.do("GET", "/api/admin/uploads/"+id, "", nil), http.StatusOK).Upload
	if upload.Status != "cut-failed" || upload.CutsLeft != 0 || upload.CutsFailed != 1 {
		t.Fatalf("after giving up: %+v, want cut-failed with 0 left and 1 failed", upload)
	}
	if upload.CutError != "sound: Invalid data found when processing input" {
		t.Fatalf("cutError %q, want the cutter's reason", upload.CutError)
	}

	// Given up on, the clip no longer says its sound or picture is coming, so
	// the app stops waiting for them.
	sound := expect[struct {
		AudioPending bool `json:"audioPending"`
		VideoPending bool `json:"videoPending"`
	}](t, admin.do("GET", "/api/clips/"+published[0].ID, "", nil), http.StatusOK)
	if sound.AudioPending || sound.VideoPending {
		t.Fatalf("a clip whose cut was given up on still reads as pending: %+v", sound)
	}

	retried := expect[struct {
		Cuts int `json:"cuts"`
	}](t, admin.json("POST", "/api/admin/uploads/"+id+"/retry", nil), http.StatusOK)
	if retried.Cuts != 1 {
		t.Fatalf("retry queued %d cuts, want 1", retried.Cuts)
	}
	after := expect[struct {
		Upload uploadRow `json:"upload"`
	}](t, admin.do("GET", "/api/admin/uploads/"+id, "", nil), http.StatusOK).Upload
	if after.CutsLeft != 1 || after.CutsFailed != 0 || after.CutError != "" {
		t.Fatalf("after a retry: %+v, want one cut queued afresh", after)
	}
	if h.cutQueueDepth(t) != 1 {
		t.Fatal("the retried cut is not in the queue")
	}
}
