package api_test

import (
	"bytes"
	"net/http"
	"strings"
	"testing"
)

type sourceJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Not a real video: nothing in the API opens the file, and the one thing that
// does — the cutter — is tested against real ffmpeg in ../../scoring/tests.
func uploadSource(t *testing.T, c *client, name string) sourceJSON {
	t.Helper()
	return expect[sourceJSON](t,
		c.do("POST", "/api/admin/sources?name="+name, "video/mp4", bytes.NewReader([]byte("not really an mp4"))),
		http.StatusCreated)
}

func TestPublishingFromASourceQueuesACut(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	source := uploadSource(t, admin, "lecture.mp4")
	if source.ID == "" {
		t.Fatal("the source upload returned no id")
	}

	clip := aClip("Line one")
	clip["sourceId"] = source.ID
	clip["startSeconds"] = 12.5
	clip["endSeconds"] = 15.5
	published := publishClips(t, admin, clip)

	// The clip is usable immediately; only its picture is pending.
	if published[0].ID == "" {
		t.Fatal("the clip was not created")
	}
	if depth := h.cutQueueDepth(t); depth != 1 {
		t.Fatalf("cut queue holds %d jobs, want 1", depth)
	}
}

// A clip published without a source is audio the browser already sliced, which
// is every clip in the library before video existed. Queueing a cut for it would
// give the cutter a job it can never do.
func TestPublishingWithoutASourceQueuesNothing(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	publishClips(t, admin, aClip("Line one"))

	if depth := h.cutQueueDepth(t); depth != 0 {
		t.Fatalf("cut queue holds %d jobs for an audio clip, want 0", depth)
	}
}

// Until the cutter has run, a clip cut from video answers exactly like one cut
// from audio, so the app plays the audio rather than showing a broken player.
func TestVideoURLIsNullUntilTheClipHasBeenCut(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	source := uploadSource(t, admin, "lecture.mp4")
	clip := aClip("Line one")
	clip["sourceId"] = source.ID
	clip["endSeconds"] = 3.4
	published := publishClips(t, admin, clip)

	got := expect[urlJSON](t, admin.do("GET", "/api/clips/"+published[0].ID+"/video", "", nil), http.StatusOK)
	if got.URL != nil {
		t.Fatalf("an uncut clip offered a video url: %q", *got.URL)
	}
}

// The batch is one file for all of its clips, and uploading it is the one thing
// in the studio only an admin may do.
func TestOnlyAdminsCanUploadASource(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	expectStatus(t,
		learner.do("POST", "/api/admin/sources?name=lecture.mp4", "video/mp4", strings.NewReader("x")),
		http.StatusForbidden)
}

func TestDeletingAClipRemovesItsVideoToo(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	published := publishClips(t, admin, aClip("Line one"))
	id := published[0].ID

	// Both objects, as the cutter and the studio would have left them.
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+id+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1))), http.StatusOK)
	h.attachVideo(t, id)

	before := countObjects(t, h)
	expectStatus(t, admin.json("DELETE", "/api/admin/clips/"+id, nil), http.StatusNoContent)

	if after := countObjects(t, h); after != before-2 {
		t.Fatalf("deleting the clip left %d of its 2 objects behind", after-(before-2))
	}
}
