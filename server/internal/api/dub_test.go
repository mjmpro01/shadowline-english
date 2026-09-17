package api_test

import (
	"bytes"
	"net/http"
	"testing"
)

type dubJSON struct {
	Status string  `json:"status"`
	URL    *string `json:"url"`
}

// A take against a clip with a picture can be dubbed. The first request queues
// it; the screen then waits on the same endpoint.
func TestRequestingADubQueuesIt(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	clip := publishClips(t, admin, aClip("Line one"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1))), http.StatusOK)
	h.attachVideo(t, clip.ID)

	take := record(t, admin, clip.ID)

	got := expect[dubJSON](t, admin.json("POST", "/api/takes/"+take.ID+"/dub", nil), http.StatusAccepted)
	if got.Status != "pending" {
		t.Fatalf("a fresh request reported %q, want pending", got.Status)
	}
	if depth := h.dubQueueDepth(t); depth != 1 {
		t.Fatalf("dub queue holds %d jobs, want 1", depth)
	}
}

// Pressing the button twice is the same request, not a second job for the
// worker to do all over again.
func TestRequestingADubTwiceQueuesItOnce(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	clip := publishClips(t, admin, aClip("Line one"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1))), http.StatusOK)
	h.attachVideo(t, clip.ID)
	take := record(t, admin, clip.ID)

	expectStatus(t, admin.json("POST", "/api/takes/"+take.ID+"/dub", nil), http.StatusAccepted)
	expectStatus(t, admin.json("POST", "/api/takes/"+take.ID+"/dub", nil), http.StatusAccepted)

	if depth := h.dubQueueDepth(t); depth != 1 {
		t.Fatalf("two requests queued %d jobs, want 1", depth)
	}
}

// An audio clip has no picture to dub onto, and a clip whose cut is still
// queued does not have one yet. Neither is a server error, and neither should
// hand the worker a job it can only fail.
func TestADubIsRefusedForAClipWithNoVideo(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	clip := publishClips(t, admin, aClip("Line one"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1))), http.StatusOK)
	take := record(t, admin, clip.ID)

	expectStatus(t, admin.json("POST", "/api/takes/"+take.ID+"/dub", nil), http.StatusConflict)
	if depth := h.dubQueueDepth(t); depth != 0 {
		t.Fatalf("a clip with no video queued %d dubs, want 0", depth)
	}
}

// "none" rather than an error: the screen offers the button, it does not show a
// failure for a file nobody has asked for.
func TestATakeNobodyHasDubbedReportsNone(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	clip := publishClips(t, admin, aClip("Line one"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1))), http.StatusOK)
	take := record(t, admin, clip.ID)

	got := expect[dubJSON](t, admin.do("GET", "/api/takes/"+take.ID+"/dub", "", nil), http.StatusOK)
	if got.Status != "none" || got.URL != nil {
		t.Fatalf("an undubbed take reported %+v", got)
	}
}

func TestAFinishedDubIsServedWithItsURL(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	clip := publishClips(t, admin, aClip("Line one"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1))), http.StatusOK)
	h.attachVideo(t, clip.ID)
	take := record(t, admin, clip.ID)
	h.attachDub(t, take.ID)

	got := expect[dubJSON](t, admin.do("GET", "/api/takes/"+take.ID+"/dub", "", nil), http.StatusOK)
	if got.Status != "ready" || got.URL == nil {
		t.Fatalf("a finished dub reported %+v", got)
	}
}

// A dub is a learner's own voice on their own recording. Nobody else's.
func TestADubBelongsToWhoeverRecordedIt(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	clip := publishClips(t, admin, aClip("Line one"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1))), http.StatusOK)
	h.attachVideo(t, clip.ID)
	take := record(t, admin, clip.ID)

	stranger := h.login("learner@example.com")
	expectStatus(t, stranger.do("GET", "/api/takes/"+take.ID+"/dub", "", nil), http.StatusNotFound)
	expectStatus(t, stranger.json("POST", "/api/takes/"+take.ID+"/dub", nil), http.StatusNotFound)
}
