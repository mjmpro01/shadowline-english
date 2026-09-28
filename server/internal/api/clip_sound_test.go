package api_test

import (
	"net/http"
	"testing"
)

// hasAudio is what the console reads to flag a clip with no sound to score
// against — the state an old cutter left behind.
func TestAClipSaysWhetherItHasItsSound(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	id := announce(t, admin, "friends.mp4", "video/mp4")
	sendFile(t, admin, id, "video/mp4")
	clip := aClip("I have an idea.")
	clip["sourceId"] = id
	published := publishClips(t, admin, clip)

	type soundJSON struct {
		HasAudio     bool `json:"hasAudio"`
		AudioPending bool `json:"audioPending"`
	}
	read := func() soundJSON {
		t.Helper()
		return expect[soundJSON](t, admin.do("GET", "/api/clips/"+published[0].ID, "", nil), http.StatusOK)
	}

	if got := read(); got.HasAudio || !got.AudioPending {
		t.Fatalf("a clip still being cut reported %+v, want no sound yet and pending", got)
	}
	h.cutSound(t, published[0].ID)
	if got := read(); !got.HasAudio {
		t.Fatalf("a clip whose sound was cut reported %+v", got)
	}
}
