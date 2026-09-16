package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/shadowline/server/internal/store"
)

type takeJSON struct {
	ID         string             `json:"id"`
	VideoID    string             `json:"videoId"`
	Score      *float64           `json:"score"`
	Scores     map[string]float64 `json:"scores"`
	Status     string             `json:"status"`
	HasAudio   bool               `json:"hasAudio"`
	RecordedAt string             `json:"recordedAt"`
}

func withAudio(t *testing.T, c *client, clipID string) {
	t.Helper()
	expectStatus(t, c.do("PUT", "/api/admin/clips/"+clipID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(3.0))), http.StatusOK)
}

func record(t *testing.T, c *client, clipID string) takeJSON {
	t.Helper()
	return expect[takeJSON](t, c.do("POST", "/api/takes?clipId="+clipID, "audio/webm",
		bytes.NewReader(silentWAV(3.0))), http.StatusCreated)
}

// A take against a clip that has source audio is pending until the worker gets
// to it. The Practice screen's "Measuring your pitch…" state is the other half
// of this contract.
func TestATakeStartsPendingAndQueuesAJob(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	withAudio(t, admin, clip.ID)

	learner := h.login("learner@example.com")
	take := record(t, learner, clip.ID)

	if take.Status != "pending" {
		t.Fatalf("take status %q, want pending", take.Status)
	}
	if take.Score != nil {
		t.Fatalf("an unscored take claimed a score of %v", *take.Score)
	}
	if !take.HasAudio {
		t.Fatal("the recording was not stored")
	}

	depth, err := h.store.QueueDepth(context.Background())
	if err != nil {
		t.Fatalf("queue depth: %v", err)
	}
	if depth != 1 {
		t.Fatalf("queue holds %d jobs, want 1", depth)
	}
}

// A clip with no source audio has nothing to compare against. The take is still
// kept — its contour is worth drawing — but no score is invented for it, and no
// job is queued that could never succeed.
func TestATakeAgainstAClipWithNoAudioIsNeverQueued(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]

	learner := h.login("learner@example.com")
	take := record(t, learner, clip.ID)

	if take.Score != nil {
		t.Fatalf("a take with nothing to compare against scored %v", *take.Score)
	}
	if take.Status == "pending" {
		t.Fatal("the take will wait forever for a worker that can do nothing")
	}

	depth, _ := h.store.QueueDepth(context.Background())
	if depth != 0 {
		t.Fatalf("queued %d impossible jobs", depth)
	}
}

// Takes are per learner. A guessed id from another account must read as absent,
// not as someone else's recording.
func TestOneLearnerCannotSeeAnothersTakes(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]

	mine := h.login("learner@example.com")
	take := record(t, mine, clip.ID)

	theirs := h.login("someone.else@example.com")
	expectStatus(t, theirs.do("GET", "/api/takes/"+take.ID, "", nil), http.StatusNotFound)
	expectStatus(t, theirs.do("GET", "/api/takes/"+take.ID+"/audio", "", nil), http.StatusNotFound)
	expectStatus(t, theirs.do("DELETE", "/api/takes/"+take.ID, "", nil), http.StatusNotFound)

	listed := expect[[]takeJSON](t, theirs.do("GET", "/api/takes", "", nil), http.StatusOK)
	if len(listed) != 0 {
		t.Fatalf("another learner's take list held %d rows", len(listed))
	}
}

// The whole reason the queue is a Postgres table: a worker claims a job, scores
// it, and the take and the job change together.
func TestScoringAJobCompletesTheTake(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	withAudio(t, admin, clip.ID)

	learner := h.login("learner@example.com")
	take := record(t, learner, clip.ID)

	job, err := h.store.ClaimJob(ctx)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if job.TakeID.String() != take.ID {
		t.Fatalf("claimed a job for take %s, want %s", job.TakeID, take.ID)
	}
	if job.ClipAudioKey == "" || job.TakeAudioKey == "" {
		t.Fatalf("the job did not carry both recordings: %+v", job)
	}

	scores := map[string]float64{"Intonation": 80, "Rhythm": 70, "Stress": 60, "Variation": 50}
	analysis := json.RawMessage(`{"user":[{"t":0,"s":1}],"reference":null,"duration":3,"meanDeviation":1.5}`)
	if err := h.store.CompleteJob(ctx, job.ID, job.TakeID, 65, scores, analysis); err != nil {
		t.Fatalf("complete: %v", err)
	}

	scored := expect[takeJSON](t, learner.do("GET", "/api/takes/"+take.ID, "", nil), http.StatusOK)
	if scored.Status != "scored" {
		t.Fatalf("take status %q after scoring", scored.Status)
	}
	if scored.Score == nil || *scored.Score != 65 {
		t.Fatalf("score is %v, want 65", scored.Score)
	}
	if scored.Scores["Intonation"] != 80 {
		t.Fatalf("metrics did not survive: %+v", scored.Scores)
	}

	if depth, _ := h.store.QueueDepth(ctx); depth != 0 {
		t.Fatalf("the finished job is still queued (%d)", depth)
	}
}

// `for update skip locked` is what lets many workers poll one table. If two
// claims ever returned the same job, every take would be scored twice.
func TestTwoWorkersNeverClaimTheSameJob(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	withAudio(t, admin, clip.ID)

	learner := h.login("learner@example.com")
	first := record(t, learner, clip.ID)
	second := record(t, learner, clip.ID)

	a, err := h.store.ClaimJob(ctx)
	if err != nil {
		t.Fatalf("first claim: %v", err)
	}
	b, err := h.store.ClaimJob(ctx)
	if err != nil {
		t.Fatalf("second claim: %v", err)
	}
	if a.TakeID == b.TakeID {
		t.Fatalf("both workers claimed take %s", a.TakeID)
	}

	claimed := map[string]bool{a.TakeID.String(): true, b.TakeID.String(): true}
	if !claimed[first.ID] || !claimed[second.ID] {
		t.Fatalf("claims %v did not cover both takes", claimed)
	}

	// Nothing left, and an empty queue is not an error.
	if _, err := h.store.ClaimJob(ctx); err != store.ErrNoJobs {
		t.Fatalf("third claim returned %v, want ErrNoJobs", err)
	}
}

// A take that cannot be scored must stop saying "measuring" eventually, or the
// Practice screen spins forever.
func TestAJobGivesUpAfterItsAttempts(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	withAudio(t, admin, clip.ID)

	learner := h.login("learner@example.com")
	take := record(t, learner, clip.ID)

	for i := 0; i < store.MaxAttempts; i++ {
		job, err := h.store.ClaimJob(ctx)
		if err != nil {
			t.Fatalf("claim %d: %v", i+1, err)
		}
		if err := h.store.FailJob(ctx, job.ID, job.TakeID, job.Attempts, "no pitch found"); err != nil {
			t.Fatalf("fail %d: %v", i+1, err)
		}
	}

	if _, err := h.store.ClaimJob(ctx); err != store.ErrNoJobs {
		t.Fatalf("the job is still being retried after %d attempts", store.MaxAttempts)
	}

	final := expect[takeJSON](t, learner.do("GET", "/api/takes/"+take.ID, "", nil), http.StatusOK)
	if final.Status != "failed" {
		t.Fatalf("take status %q, want failed", final.Status)
	}
	if final.Score != nil {
		t.Fatalf("a failed take reported a score of %v", *final.Score)
	}
}

func TestDeletingATakeRemovesItsRecording(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]

	learner := h.login("learner@example.com")
	take := record(t, learner, clip.ID)

	before := countObjects(t, h)
	expectStatus(t, learner.do("DELETE", "/api/takes/"+take.ID, "", nil), http.StatusNoContent)

	if after := countObjects(t, h); after != before-1 {
		t.Fatalf("object count went from %d to %d — the recording was left behind", before, after)
	}
}

func TestAnUnknownClipIsRejectedBeforeAnythingIsStored(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	expectStatus(t, learner.do("POST", "/api/takes?clipId="+uuid.NewString(), "audio/webm",
		bytes.NewReader(silentWAV(1.0))), http.StatusNotFound)

	if n := countObjects(t, h); n != 0 {
		t.Fatalf("%d objects were stored for a clip that does not exist", n)
	}
}

// The claim above is checked sequentially; this checks it under the condition it
// actually runs in. Without row locking, two workers running at the same instant
// both see the job as queued and both score it.
func TestConcurrentWorkersEachGetADistinctJob(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	withAudio(t, admin, clip.ID)

	learner := h.login("learner@example.com")
	const jobs = 8
	for i := 0; i < jobs; i++ {
		record(t, learner, clip.ID)
	}

	const workers = 8
	var (
		mu      sync.Mutex
		claimed = map[uuid.UUID]int{}
		wg      sync.WaitGroup
		start   = make(chan struct{})
	)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			for {
				job, err := h.store.ClaimJob(ctx)
				if err == store.ErrNoJobs {
					return
				}
				if err != nil {
					t.Errorf("claim: %v", err)
					return
				}
				mu.Lock()
				claimed[job.TakeID]++
				mu.Unlock()
				if err := h.store.CompleteJob(ctx, job.ID, job.TakeID, 70,
					map[string]float64{"Intonation": 70}, nil); err != nil {
					t.Errorf("complete: %v", err)
					return
				}
			}
		}()
	}
	close(start)
	wg.Wait()

	if len(claimed) != jobs {
		t.Fatalf("%d distinct takes were claimed, want %d", len(claimed), jobs)
	}
	for takeID, times := range claimed {
		if times != 1 {
			t.Fatalf("take %s was claimed %d times", takeID, times)
		}
	}
}
