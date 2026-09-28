package api_test

import (
	"context"
	"net/http"
	"testing"
)

// The services answer says which code every part runs: the API's own, and each
// worker's as it reported it — empty for a worker too old to report one.
func TestTheServicesSayWhichCodeEachPartRuns(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	if _, err := h.pool.Exec(context.Background(), `
		insert into worker_heartbeats (service, seen_at, busy, version, started_at)
		values ('cutting', now(), false, 'abc1234', now() - interval '5 minutes'),
		       ('scoring', now(), false, '', null)`); err != nil {
		t.Fatalf("write heartbeats: %v", err)
	}

	type worker struct {
		Online    bool    `json:"online"`
		Version   string  `json:"version"`
		StartedAt *string `json:"startedAt"`
	}
	got := expect[struct {
		API struct {
			Version   string `json:"version"`
			StartedAt string `json:"startedAt"`
		} `json:"api"`
		Cutting      *worker `json:"cutting"`
		Scoring      *worker `json:"scoring"`
		Transcribing *worker `json:"transcribing"`
		Dubbing      *worker `json:"dubbing"`
		Glossing     *worker `json:"glossing"`
	}](t, admin.do("GET", "/api/admin/services", "", nil), http.StatusOK)

	if got.API.Version == "" || got.API.StartedAt == "" {
		t.Fatalf("the API did not say which code it runs: %+v", got.API)
	}
	if got.Cutting == nil || got.Cutting.Version != "abc1234" || got.Cutting.StartedAt == nil {
		t.Fatalf("cutting reported %+v, want its version and start", got.Cutting)
	}
	// A worker from before versions were reported still shows, without one.
	if got.Scoring == nil || got.Scoring.Version != "" {
		t.Fatalf("scoring reported %+v, want it present with no version", got.Scoring)
	}
	if got.Transcribing != nil || got.Dubbing != nil || got.Glossing != nil {
		t.Fatal("a worker that never beat was reported as present")
	}
}
