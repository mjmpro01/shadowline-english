package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// handleDictationPassage is the passage a dictation starting at a clip covers:
// its lines, and the phrases to write down from them.
func (s *Server) handleDictationPassage(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	passage, err := s.Store.DictationPassage(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "dictation passage")
		return
	}
	writeJSON(w, http.StatusOK, passage)
}

func (s *Server) handleSaveDictation(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body store.NewDictation
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := s.Store.SaveDictation(r.Context(), u.ID, body, time.Now())
	if errors.Is(err, store.ErrBadDictation) {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		s.failErr(w, err, "save dictation")
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *Server) handleListDictations(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	list, err := s.Store.Dictations(r.Context(), u.ID, time.Now())
	if err != nil {
		s.failErr(w, err, "list dictations")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleReviewDictation(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.ReviewDictation(r.Context(), u.ID, id); err != nil {
		s.failErr(w, err, "review dictation")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTestDictationsDue puts the signed-in learner's dictations due today,
// for a browser test that cannot wait for tomorrow. AUTH_FAKE=1 only.
func (s *Server) handleTestDictationsDue(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	if err := s.Store.MakeDictationsDue(r.Context(), u.ID, time.Now()); err != nil {
		s.failErr(w, err, "test dictations due")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
