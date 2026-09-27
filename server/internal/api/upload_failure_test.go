package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"testing"
)

// Each usual way an upload dies gets its own words, because each needs a
// different thing done about it.
func TestUploadFailureSaysWhichKindItWas(t *testing.T) {
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	cases := []struct {
		name   string
		ctx    context.Context
		err    error
		status int
		reason string
	}{
		{"over the limit", context.Background(), &http.MaxBytesError{Limit: 10},
			http.StatusRequestEntityTooLarge, "that recording is too large to upload"},
		{"the browser went away", cancelled, errors.New("put object: context canceled"),
			http.StatusBadRequest, "the connection dropped before the whole recording arrived"},
		{"the body stopped short", context.Background(), fmt.Errorf("read: %w", io.ErrUnexpectedEOF),
			http.StatusBadRequest, "the connection dropped before the whole recording arrived"},
		{"the store refused", context.Background(), errors.New("dial tcp 127.0.0.1:9000: connection refused"),
			http.StatusBadGateway, "the file store did not accept the recording"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			status, reason := uploadFailure(c.ctx, c.err)
			if status != c.status || reason != c.reason {
				t.Fatalf("got %d %q, want %d %q", status, reason, c.status, c.reason)
			}
		})
	}
}
