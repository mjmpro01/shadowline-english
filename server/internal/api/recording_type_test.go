package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/shadowline/server/internal/storage"
)

// A take recorded on an iPhone is an MP4, and has to come back as one: Safari
// will not play a file it is told is a WebM. It used to be kept as ".webm" and
// served as audio/webm, and Dub review was silent on the phone it was made on.

// mp4Head is the start of what Safari's MediaRecorder writes: an ftyp box.
var mp4Head = append([]byte{0, 0, 0, 0x1c, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, bytes.Repeat([]byte{0}, 64)...)

// webmHead is an EBML header, as Chrome's MediaRecorder writes.
var webmHead = append([]byte{0x1a, 0x45, 0xdf, 0xa3}, bytes.Repeat([]byte{0}, 64)...)

func TestARecordingFromAnIPhoneIsServedAsMP4(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	learner := h.login("learner@example.com")

	take := expect[takeJSON](t, learner.do("POST", "/api/takes?clipId="+clip.ID, "audio/mp4;codecs=mp4a.40.2",
		bytes.NewReader(mp4Head)), http.StatusCreated)
	resp := learner.do("GET", "/api/takes/"+take.ID+"/audio", "", nil)
	var signed struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&signed); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	u, err := url.Parse(signed.URL)
	if err != nil || !strings.HasSuffix(u.Path, ".m4a") {
		t.Fatalf("kept as %q (%v)", signed.URL, err)
	}
	file := h.anonymous().do("GET", u.RequestURI(), "", nil)
	file.Body.Close()
	if file.StatusCode != http.StatusOK || file.Header.Get("Content-Type") != "audio/mp4" {
		t.Fatalf("served %d as %q", file.StatusCode, file.Header.Get("Content-Type"))
	}
}

// Takes kept before then still say ".webm"; what is in them decides.
func TestAnOldIPhoneTakeKeptAsWebMIsServedAsWhatItIs(t *testing.T) {
	h := newHarness(t)
	for _, c := range []struct {
		key, want string
		body      []byte
	}{
		{"take/old-iphone.webm", "audio/mp4", mp4Head},
		{"take/chrome.webm", "audio/webm", webmHead},
	} {
		if err := h.blobs.Put(context.Background(), storage.Takes, c.key, bytes.NewReader(c.body), -1, "audio/webm"); err != nil {
			t.Fatal(err)
		}
		query := h.srv.Signer.SignPath(string(storage.Takes), c.key, time.Now().Add(time.Hour))
		file := h.anonymous().do("GET", "/files/takes/"+c.key+"?"+query, "", nil)
		got := file.Header.Get("Content-Type")
		file.Body.Close()
		if file.StatusCode != http.StatusOK || got != c.want {
			t.Errorf("%s: %d as %q, want %q", c.key, file.StatusCode, got, c.want)
		}
	}
}
