package api

import (
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

func (s *Server) handleListTakes(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	takes, err := s.Store.ListTakes(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "list takes")
		return
	}
	writeJSON(w, http.StatusOK, takes)
}

func (s *Server) handleGetTake(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	take, err := s.Store.TakeByID(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "get take")
		return
	}
	writeJSON(w, http.StatusOK, take)
}

// handleCreateTake stores the recording and returns immediately with a pending
// take. Scoring happens in the Python worker; the client polls GET /takes/{id},
// which is what the Practice screen's "Measuring your pitch…" state already
// covers.
//
// The audio arrives as the raw request body rather than multipart: there is
// exactly one file and the clip id is in the query string, so a form would only
// add parsing.
func (s *Server) handleCreateTake(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	clipID, err := uuid.Parse(r.URL.Query().Get("clipId"))
	if err != nil {
		fail(w, http.StatusBadRequest, "clipId is required")
		return
	}
	clip, err := s.Store.ClipByID(r.Context(), clipID)
	if err != nil {
		s.failErr(w, err, "get clip")
		return
	}

	key, err := s.putAudio(r, storage.Takes, "take/"+u.ID.String())
	if err != nil {
		s.failErr(w, err, "store take audio")
		return
	}

	// A clip with no source audio has nothing to score against. The take is
	// still kept — the app draws its contour — it just never claims a score.
	take, err := s.Store.CreateTakeWithJob(r.Context(), u.ID, clipID, key, clip.AudioKey != nil)
	if err != nil {
		// The row failed but the object is already stored; drop it rather than
		// leave an object no row will ever point at.
		if delErr := s.Storage.Delete(r.Context(), storage.Takes, key); delErr != nil {
			s.Log.Warn("orphaned take audio", "key", key, "error", delErr)
		}
		s.failErr(w, err, "create take")
		return
	}
	writeJSON(w, http.StatusCreated, take)
}

// handleRequestDub asks for the learner's voice to be muxed onto the clip's
// picture. Answers with the same shape as reading it, so the screen gets the
// state straight back rather than having to ask again.
//
// Requested rather than made for every take: a line gets practised a dozen
// times, and a file for each attempt is a dozen files nobody wants.
func (s *Server) handleRequestDub(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	// TakeByID scopes to the owner, so this is also what stops one learner
	// dubbing another's recording.
	take, err := s.Store.TakeByID(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "get take")
		return
	}
	if take.DubKey != nil {
		s.writeDub(w, r, take)
		return
	}
	if err := s.Store.EnqueueDub(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNoVideo) {
			// Not a failure of the request: an audio clip has no picture, and
			// one whose cut is still queued does not have it yet.
			fail(w, http.StatusConflict, "this clip has no video to dub onto")
			return
		}
		s.failErr(w, err, "queue dub")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "pending", "url": nil})
}

// handleTakeDub answers with the dub, or with what it is still waiting for.
func (s *Server) handleTakeDub(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	take, err := s.Store.TakeByID(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "get take")
		return
	}
	s.writeDub(w, r, take)
}

// writeDub reports one of three states: ready with a url, pending while the
// worker has it, or none — which covers both "never asked for" and "asked for
// and given up on", because in each case the screen offers the button again.
func (s *Server) writeDub(w http.ResponseWriter, r *http.Request, take store.Take) {
	if take.DubKey != nil {
		url, err := s.Storage.SignedGetURL(r.Context(), storage.Takes, *take.DubKey, audioURLTTL)
		if err != nil {
			s.failErr(w, err, "sign dub url")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "url": url})
		return
	}
	queued, err := s.Store.DubQueued(r.Context(), take.ID)
	if err != nil {
		s.failErr(w, err, "read dub queue")
		return
	}
	status := "none"
	if queued {
		status = "pending"
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": status, "url": nil})
}

func (s *Server) handleTakeAudio(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	take, err := s.Store.TakeByID(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "get take")
		return
	}
	if take.AudioKey == nil {
		writeJSON(w, http.StatusOK, map[string]any{"url": nil})
		return
	}
	url, err := s.Storage.SignedGetURL(r.Context(), storage.Takes, *take.AudioKey, audioURLTTL)
	if err != nil {
		s.failErr(w, err, "sign take audio url")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": url})
}

func (s *Server) handleDeleteTake(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	key, err := s.Store.DeleteTake(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "delete take")
		return
	}
	if key != nil {
		if err := s.Storage.Delete(r.Context(), storage.Takes, *key); err != nil {
			s.Log.Warn("orphaned take audio", "key", *key, "error", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
