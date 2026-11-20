package api

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// handleTestReset empties every table and republishes the starter library, so a
// browser test starts from a known state.
//
// Registered only when AUTH_FAKE=1 — the same flag that replaces Google with a
// stub. A deployment that has not set it does not have this route at all, which
// is a stronger guarantee than a check inside the handler.
func (s *Server) handleTestReset(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.TruncateAll(r.Context()); err != nil {
		s.failErr(w, err, "reset test data")
		return
	}
	for _, clip := range store.StarterClips() {
		if _, err := s.Store.CreateClip(r.Context(), clip, uuid.Nil); err != nil {
			s.failErr(w, err, "reseed starter clips")
			return
		}
	}
	if err := s.Store.SeedStarterDialogues(r.Context()); err != nil {
		s.failErr(w, err, "reseed starter dialogues")
		return
	}
	// The session cookie survives the truncate but the user behind it does not,
	// so the caller has to sign in again. Saying so beats a confusing 401 later.
	s.Sessions.Clear(r.Context(), w, r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "signedOut": true})
}

// handleTestTranscript stores a transcript for the most recently uploaded
// source, standing in for the transcriber.
//
// Registered only when AUTH_FAKE=1, like the reset route. It exists because the
// browser tests cannot run Whisper: the model is hundreds of megabytes fetched
// from somewhere CI has no business reaching, and what the tests are checking
// is the studio filling its lines in, not the model's accuracy. The worker's
// own behaviour is covered in ../../../scoring/tests/test_transcriber.py.
func (s *Server) handleTestTranscript(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Words []store.Word `json:"words"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.StoreLatestTranscript(r.Context(), "en", body.Words); err != nil {
		s.failErr(w, err, "store test transcript")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleTestTranscriptFail makes the transcriber give up on the most recently
// uploaded source, with the reason given, as it does after its last attempt.
// Registered only when AUTH_FAKE=1, for the same reason as the route above.
func (s *Server) handleTestTranscriptFail(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Reason string `json:"reason"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.FailLatestTranscript(r.Context(), body.Reason); err != nil {
		s.failErr(w, err, "fail test transcript")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleTestCoins sets the signed-in learner's coins, for a test that has to
// buy something without practising for it first. AUTH_FAKE=1 only.
func (s *Server) handleTestCoins(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Coins int `json:"coins"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Coins < 0 {
		fail(w, http.StatusBadRequest, "coins is a number, 0 or more")
		return
	}
	if err := s.Store.SetCoins(r.Context(), u.ID, body.Coins); err != nil {
		s.failErr(w, err, "test coins")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTestActivity records learning for the signed-in learner, as though
// they had done it, so a browser test can reach the day's goal without
// recording takes one by one. AUTH_FAKE=1 only.
func (s *Server) handleTestActivity(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Kind  string `json:"kind"`
		Times int    `json:"times"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	for range max(1, min(body.Times, 50)) {
		if _, err := s.Store.LogActivity(r.Context(), u.ID, body.Kind, time.Now()); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
