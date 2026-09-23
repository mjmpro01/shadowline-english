package api_test

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"
)

type sourceJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type transcriptJSON struct {
	Status string `json:"status"`
	Words  []struct {
		Start float64 `json:"start"`
		Text  string  `json:"text"`
		IPA   string  `json:"ipa"`
	} `json:"words"`
}

// Not a real video: nothing in the API opens the file, and the one thing that
// does — the cutter — is tested against real ffmpeg in ../../scoring/tests.
func uploadSource(t *testing.T, c *client, name string) sourceJSON {
	t.Helper()
	return uploadSourceAs(t, c, name, "video/mp4")
}

func uploadSourceAs(t *testing.T, c *client, name, contentType string) sourceJSON {
	t.Helper()
	return expect[sourceJSON](t,
		c.do("POST", "/api/admin/sources?name="+name, contentType, bytes.NewReader([]byte("pretend recording"))),
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
	if published[0].HasVideo {
		t.Fatal("an uncut clip reported hasVideo")
	}
	if !published[0].VideoPending {
		t.Fatal("an uncut video clip did not report videoPending")
	}
	if depth := h.cutQueueDepth(t); depth != 1 {
		t.Fatalf("cut queue holds %d jobs, want 1", depth)
	}
}

// A cut that has spent every attempt leaves no job behind, and the clip has to
// stop promising a picture that is never coming. It used to promise for ever,
// and the app polled it every three seconds for as long as the library was open.
func TestAClipStopsPromisingAPictureOnceTheCutHasGivenUp(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	source := uploadSource(t, admin, "lecture.mp4")
	clip := aClip("Line one")
	clip["sourceId"] = source.ID
	published := publishClips(t, admin, clip)[0]
	if !published.VideoPending {
		t.Fatal("a freshly cut clip does not say its picture is coming")
	}

	// What the cutter does when it runs out of attempts: the job goes and the
	// clip keeps its null video_key.
	if _, err := h.pool.Exec(context.Background(),
		`delete from cut_jobs where clip_id = $1`, published.ID); err != nil {
		t.Fatalf("drop the cut job: %v", err)
	}

	listed := everyClip(t, admin)
	if listed[0].VideoPending {
		t.Fatal("the clip is still promising a picture with nothing left to produce it")
	}
	if listed[0].HasVideo {
		t.Fatal("the clip claims a picture it never got")
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
	for _, clip := range everyClip(t, admin) {
		if clip.VideoPending {
			t.Fatalf("an audio clip reported videoPending: %+v", clip)
		}
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

// An audio upload has a source row too, because transcription wants the file
// whether or not there is a picture in it. What it must not get is a cut job:
// the cutter could only fail that one, three times, before giving up.
func TestAnAudioSourceIsTranscribedButNotCut(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	source := uploadSourceAs(t, admin, "lesson.wav", "audio/wav")

	clip := aClip("Line one")
	clip["sourceId"] = source.ID
	clip["endSeconds"] = 3.4
	publishClips(t, admin, clip)

	if depth := h.cutQueueDepth(t); depth != 0 {
		t.Fatalf("an audio source queued %d cuts, want 0", depth)
	}
	// The transcription was queued when the source was created, before any clip
	// existed: the words belong to the recording, not to the cuts.
	if depth := h.transcribeQueueDepth(t); depth != 1 {
		t.Fatalf("transcribe queue holds %d jobs, want 1", depth)
	}
}

func TestUploadingASourceQueuesItsTranscription(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	uploadSource(t, admin, "lecture.mp4")

	if depth := h.transcribeQueueDepth(t); depth != 1 {
		t.Fatalf("transcribe queue holds %d jobs, want 1", depth)
	}
}

// Pending is the ordinary first answer, and the studio shows it as "still
// coming" rather than as "there are no words".
func TestATranscriptIsPendingUntilTheWorkerHasRun(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	source := uploadSource(t, admin, "lecture.mp4")

	got := expect[transcriptJSON](t,
		admin.do("GET", "/api/admin/sources/"+source.ID+"/transcript", "", nil), http.StatusOK)
	if got.Status != "pending" {
		t.Fatalf("a fresh source reported %q, want pending", got.Status)
	}
	if len(got.Words) != 0 {
		t.Fatalf("a pending transcript carried %d words", len(got.Words))
	}
}

func TestAStoredTranscriptIsServedWithItsWords(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	source := uploadSource(t, admin, "lecture.mp4")
	h.storeTranscript(t, source.ID)

	got := expect[transcriptJSON](t,
		admin.do("GET", "/api/admin/sources/"+source.ID+"/transcript", "", nil), http.StatusOK)
	if got.Status != "ready" {
		t.Fatalf("a stored transcript reported %q, want ready", got.Status)
	}
	if len(got.Words) != 2 || got.Words[0].Text != "One" || got.Words[0].IPA != "ˈwʌn" {
		t.Fatalf("words came back as %+v", got.Words)
	}
}

// Whoever can publish can see the transcript, and nobody else: it is the
// contents of a recording that has not been cut into a library yet.
func TestOnlyAdminsCanReadATranscript(t *testing.T) {
	h := newHarness(t)
	source := uploadSource(t, h.login("admin@example.com"), "lecture.mp4")

	expectStatus(t,
		h.login("learner@example.com").do("GET", "/api/admin/sources/"+source.ID+"/transcript", "", nil),
		http.StatusForbidden)
}
