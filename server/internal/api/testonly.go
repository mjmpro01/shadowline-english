package api

import (
	"net/http"

	"github.com/google/uuid"
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
