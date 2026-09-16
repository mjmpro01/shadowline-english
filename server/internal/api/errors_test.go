package api

// An internal test: failErr is the one place that decides what reaches the log,
// and driving it directly is the only way to assert that without racing the
// HTTP client.

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

func recorder() (*Server, *bytes.Buffer) {
	var logged bytes.Buffer
	return &Server{Log: slog.New(slog.NewTextHandler(&logged, &slog.HandlerOptions{Level: slog.LevelError}))}, &logged
}

// A browser that navigates away cancels its request. That is not a server
// error, and treating it as one buries the errors that are — a single browser
// test run produced a screenful of them.
func TestACancelledRequestIsNotLogged(t *testing.T) {
	s, logged := recorder()
	w := httptest.NewRecorder()

	s.failErr(w, fmt.Errorf("querying clips: %w", context.Canceled), "list clips")

	if strings.Contains(logged.String(), "level=ERROR") {
		t.Fatalf("a cancelled request was logged as an error: %s", logged.String())
	}
}

// Everything else still has to be. A silent 500 is worse than a noisy one.
func TestARealFailureIsLoggedAndAnswered(t *testing.T) {
	s, logged := recorder()
	w := httptest.NewRecorder()

	s.failErr(w, errors.New("connection refused"), "list clips")

	if !strings.Contains(logged.String(), "level=ERROR") {
		t.Fatal("a real failure was not logged")
	}
	if w.Code != 500 {
		t.Fatalf("status %d, want 500", w.Code)
	}
	// The detail stays server-side.
	if strings.Contains(w.Body.String(), "connection refused") {
		t.Fatalf("the internal error reached the client: %s", w.Body.String())
	}
}

func TestMissingThingsAnswerNotFound(t *testing.T) {
	for name, err := range map[string]error{
		"a missing row":    fmt.Errorf("clip: %w", store.ErrNotFound),
		"a missing object": fmt.Errorf("audio: %w", storage.ErrNotFound),
	} {
		s, logged := recorder()
		w := httptest.NewRecorder()

		s.failErr(w, err, "get clip")

		if w.Code != 404 {
			t.Fatalf("%s gave status %d, want 404", name, w.Code)
		}
		if strings.Contains(logged.String(), "level=ERROR") {
			t.Fatalf("%s was logged as an error", name)
		}
	}
}
