package api_test

import (
	"net/http"
	"testing"
	"time"
)

// The transcript's status says which part of the wait it is in, and whether
// anything is running to end it — "queued for ten minutes" and "queued for ten
// minutes with no transcriber running" are different problems.
type transcriptStatusJSON struct {
	Status      string  `json:"status"`
	Stage       string  `json:"stage"`
	Ahead       int     `json:"ahead"`
	Attempts    int     `json:"attempts"`
	MaxAttempts int     `json:"maxAttempts"`
	Error       string  `json:"error"`
	QueuedAt    *string `json:"queuedAt"`
	StartedAt   *string `json:"startedAt"`
	Transcriber *struct {
		SeenAt string `json:"seenAt"`
		Busy   bool   `json:"busy"`
		Online bool   `json:"online"`
	} `json:"transcriber"`
}

func readTranscript(t *testing.T, c *client, sourceID string) transcriptStatusJSON {
	t.Helper()
	return expect[transcriptStatusJSON](t,
		c.do("GET", "/api/admin/uploads/"+sourceID+"/transcript", "", nil), http.StatusOK)
}

func TestAQueuedTranscriptSaysWhatIsAheadOfIt(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	first := uploadSource(t, admin, "first.mp4")
	second := uploadSource(t, admin, "second.mp4")

	got := readTranscript(t, admin, second.ID)
	if got.Status != "pending" || got.Stage != "queued" {
		t.Fatalf("status %q stage %q, want pending and queued", got.Status, got.Stage)
	}
	if got.Ahead != 1 {
		t.Fatalf("%d ahead of the second upload, want 1", got.Ahead)
	}
	if got.QueuedAt == nil || got.StartedAt != nil {
		t.Fatalf("queuedAt %v startedAt %v for a job nobody has claimed", got.QueuedAt, got.StartedAt)
	}
	if got.MaxAttempts != 3 {
		t.Fatalf("maxAttempts %d, want the worker's 3", got.MaxAttempts)
	}
	// Never seen is its own answer: nil, not a transcriber that is offline.
	if got.Transcriber != nil {
		t.Fatalf("a transcriber that never beat reported %+v", got.Transcriber)
	}

	// Once the first is being worked on, nothing is waiting ahead of the second.
	h.startTranscribing(t, first.ID)
	if got := readTranscript(t, admin, second.ID); got.Ahead != 0 {
		t.Fatalf("%d ahead once the first is running, want 0", got.Ahead)
	}
}

func TestARunningTranscriptSaysWhenItStartedAndWhichAttemptItIs(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "lecture.mp4")
	h.startTranscribing(t, source.ID)
	h.transcriberBeat(t, 5*time.Second, true)

	got := readTranscript(t, admin, source.ID)
	if got.Status != "pending" || got.Stage != "running" {
		t.Fatalf("status %q stage %q, want pending and running", got.Status, got.Stage)
	}
	if got.StartedAt == nil || got.Attempts != 1 {
		t.Fatalf("startedAt %v attempts %d, want a start and the first attempt", got.StartedAt, got.Attempts)
	}
	if got.Transcriber == nil || !got.Transcriber.Online || !got.Transcriber.Busy {
		t.Fatalf("transcriber %+v, want online and busy", got.Transcriber)
	}
}

func TestATranscriberThatStoppedBeatingIsOffline(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "lecture.mp4")
	h.transcriberBeat(t, 5*time.Minute, false)

	got := readTranscript(t, admin, source.ID)
	if got.Transcriber == nil || got.Transcriber.Online {
		t.Fatalf("transcriber %+v five minutes after its last beat, want offline", got.Transcriber)
	}

	services := expect[struct {
		Transcribing *struct {
			Online bool `json:"online"`
		} `json:"transcribing"`
		Cutting *struct {
			Online bool `json:"online"`
		} `json:"cutting"`
	}](t, admin.do("GET", "/api/admin/services", "", nil), http.StatusOK)
	if services.Transcribing == nil || services.Transcribing.Online {
		t.Fatalf("services said %+v, want the transcriber offline", services.Transcribing)
	}
	// A cutter that has never beaten is reported as such, not as offline.
	if services.Cutting != nil {
		t.Fatalf("a cutter that never beat reported %+v", services.Cutting)
	}
}

func TestAFailedTranscriptSaysWhy(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "lecture.mp4")
	h.giveUpTranscribing(t, source.ID, "source is missing: clips/source/x.mp4")

	got := readTranscript(t, admin, source.ID)
	if got.Status != "failed" || got.Stage != "" {
		t.Fatalf("status %q stage %q, want failed and no stage", got.Status, got.Stage)
	}
	if got.Error != "source is missing: clips/source/x.mp4" || got.Attempts != 3 {
		t.Fatalf("error %q attempts %d, want the worker's reason after 3", got.Error, got.Attempts)
	}

	// A retry puts the same job back at the start of its attempts.
	retried := expect[struct {
		Transcribe int `json:"transcribe"`
	}](t, admin.json("POST", "/api/admin/uploads/"+source.ID+"/retry", nil), http.StatusOK)
	if retried.Transcribe != 1 {
		t.Fatalf("retry queued %d transcripts, want 1", retried.Transcribe)
	}
	again := readTranscript(t, admin, source.ID)
	if again.Status != "pending" || again.Stage != "queued" || again.Attempts != 0 || again.Error != "" {
		t.Fatalf("after a retry: %+v, want a fresh queued job", again)
	}
}

// Before failed jobs were kept, giving up deleted the job. A source like that
// still reads as failed, with no reason to give.
func TestAFailureFromBeforeReasonsWereKeptIsStillFailed(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	source := uploadSource(t, admin, "lecture.mp4")
	h.dropTranscribeJob(t, source.ID)

	got := readTranscript(t, admin, source.ID)
	if got.Status != "failed" || got.Error != "" {
		t.Fatalf("status %q error %q, want failed with no reason", got.Status, got.Error)
	}
	retried := expect[struct {
		Transcribe int `json:"transcribe"`
	}](t, admin.json("POST", "/api/admin/uploads/"+source.ID+"/retry", nil), http.StatusOK)
	if retried.Transcribe != 1 {
		t.Fatalf("retry queued %d transcripts, want 1", retried.Transcribe)
	}
}

func TestOnlyAdminsCanSeeTheServices(t *testing.T) {
	h := newHarness(t)
	expectStatus(t,
		h.login("learner@example.com").do("GET", "/api/admin/services", "", nil),
		http.StatusForbidden)
}
