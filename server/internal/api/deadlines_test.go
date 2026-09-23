package api_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/shadowline/server/internal/storage"
)

// A recording that takes longer than a minute to upload used to fail.
//
// The router put a sixty-second timeout on every route. The upload handler
// raises the server's *write* deadline for a big file, which reads as though
// the case were handled, but the request context is what actually decides: it
// expired on schedule, storing the object or recording the row failed with
// "context deadline exceeded", and the admin got a 500 on a perfectly healthy
// connection. Reproduced with a 4 MB file sent over seventy seconds.
//
// Sixty seconds is right for a handler that has to think. It is meaningless for
// a request whose length is the size of a file, so these two check that the
// routes moving whole files are on the long deadline and the rest are not.
// Deadlines rather than a slow upload: the bug is which timeout the route is
// under, and a test that spends a minute proving it would never be run.

// deadlineSpy answers like the storage underneath it and records how long the
// handler's context had left when it was called.
type deadlineSpy struct {
	storage.Storage
	left chan time.Duration
}

func (d *deadlineSpy) record(ctx context.Context) {
	deadline, ok := ctx.Deadline()
	if !ok {
		// No deadline at all is longer than any we ask about.
		d.left <- time.Hour * 24
		return
	}
	d.left <- time.Until(deadline)
}

func (d *deadlineSpy) Put(ctx context.Context, bucket storage.Bucket, key string, r io.Reader, size int64, contentType string) error {
	d.record(ctx)
	return d.Storage.Put(ctx, bucket, key, r, size, contentType)
}

func (d *deadlineSpy) Open(ctx context.Context, bucket storage.Bucket, key string) (io.ReadCloser, error) {
	d.record(ctx)
	return d.Storage.Open(ctx, bucket, key)
}

func (d *deadlineSpy) SignedGetURL(ctx context.Context, bucket storage.Bucket, key string, ttl time.Duration) (string, error) {
	d.record(ctx)
	return d.Storage.SignedGetURL(ctx, bucket, key, ttl)
}

// spyOn puts the recorder in front of the harness's storage and hands back the
// channel its measurements arrive on.
func spyOn(h *harness) chan time.Duration {
	left := make(chan time.Duration, 4)
	h.srv.Storage = &deadlineSpy{Storage: h.blobs, left: left}
	return left
}

func waitForDeadline(t *testing.T, left chan time.Duration) time.Duration {
	t.Helper()
	select {
	case d := <-left:
		return d
	case <-time.After(5 * time.Second):
		t.Fatal("storage was never asked to do anything")
		return 0
	}
}

func TestUploadingASourceGetsTheLongDeadline(t *testing.T) {
	h := newHarness(t)
	left := spyOn(h)
	admin := h.login("admin@example.com")

	expectStatus(t, admin.do("POST", "/api/admin/sources?name=episode.mp4", "video/mp4",
		strings.NewReader("not really a film")), http.StatusCreated)

	if d := waitForDeadline(t, left); d < 20*time.Minute {
		t.Fatalf("an upload had %s left, which is the minute every other route gets, not the transfer deadline", d)
	}
}

func TestServingAFileGetsTheLongDeadline(t *testing.T) {
	h := newHarness(t)
	if err := h.blobs.Put(context.Background(), storage.Clips, "clip/one.mp4",
		strings.NewReader("picture"), -1, "video/mp4"); err != nil {
		t.Fatalf("put: %v", err)
	}
	left := spyOn(h)

	query := h.srv.Signer.SignPath(string(storage.Clips), "clip/one.mp4", time.Now().Add(time.Hour))
	expectStatus(t, h.anonymous().do("GET", "/files/clips/clip/one.mp4?"+query, "", nil), http.StatusOK)

	if d := waitForDeadline(t, left); d < 20*time.Minute {
		t.Fatalf("serving a file had %s left; a learner on a slow line would lose the clip halfway", d)
	}
}

func TestAnOrdinaryRouteKeepsTheMinute(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Ordinary"))[0]
	expectStatus(t, admin.do("PUT", "/api/admin/clips/"+clip.ID+"/audio", "audio/wav",
		bytes.NewReader(silentWAV(1.0))), http.StatusOK)
	left := spyOn(h)

	expectStatus(t, admin.do("GET", "/api/clips/"+clip.ID+"/audio", "", nil), http.StatusOK)

	// The point of the timeout is a handler that has stopped answering. Taking
	// it off the whole router would have left nothing watching these.
	if d := waitForDeadline(t, left); d > 2*time.Minute {
		t.Fatalf("an ordinary route had %s left; the request timeout is not on it", d)
	}
}
