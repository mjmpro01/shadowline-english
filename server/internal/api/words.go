package api

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/shadowline/server/internal/store"
)

// The longest caption worth keeping as context. A clip is six seconds, so a
// real one never comes near this; the limit is here so a request cannot make
// the worker's prompt as long as it likes.
const maxGlossContext = 400

// Everything a word can be made of, once it has been through the same sieve as
// `normalizeWord` in app/src/lib/text.ts. Applied again here because the
// gloss is a cache key and a shared one: "Really?" and "really" have to reach
// the same row, whoever is asking and whatever the browser sent.
var wordShape = regexp.MustCompile(`[^a-z' ]`)

func normalizeWord(raw string) string {
	return strings.TrimSpace(wordShape.ReplaceAllString(strings.ToLower(raw), ""))
}

// handleLookupWord asks for a word to be looked up, and answers with the gloss
// if somebody already has. Same shape as reading it, so the popup gets the
// answer straight back on the second tap rather than having to ask again.
//
// A POST rather than a GET because a miss costs money: it queues a model call.
func (s *Server) handleLookupWord(w http.ResponseWriter, r *http.Request) {
	word := normalizeWord(chi.URLParam(r, "word"))
	if word == "" {
		fail(w, http.StatusBadRequest, "word is required")
		return
	}

	var in struct {
		Context string `json:"context"`
	}
	// A body is optional: a word tapped outside a caption has no sentence to
	// send, and is still a word with a meaning.
	if r.ContentLength > 0 {
		if err := decodeJSON(r, &in); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	if gloss, err := s.Store.GlossFor(r.Context(), word); err == nil {
		writeJSON(w, http.StatusOK, glossBody("ready", gloss))
		return
	} else if !errors.Is(err, store.ErrNotFound) {
		s.failErr(w, err, "read gloss")
		return
	}

	line := strings.TrimSpace(in.Context)
	if len(line) > maxGlossContext {
		line = line[:maxGlossContext]
	}
	if err := s.Store.EnqueueGloss(r.Context(), word, line); err != nil {
		s.failErr(w, err, "queue gloss")
		return
	}
	writeJSON(w, http.StatusAccepted, glossBody("pending", store.Gloss{Word: word}))
}

// handleGetWord answers with the gloss, or with what it is still waiting for.
func (s *Server) handleGetWord(w http.ResponseWriter, r *http.Request) {
	word := normalizeWord(chi.URLParam(r, "word"))
	if word == "" {
		fail(w, http.StatusBadRequest, "word is required")
		return
	}

	gloss, err := s.Store.GlossFor(r.Context(), word)
	if err == nil {
		writeJSON(w, http.StatusOK, glossBody("ready", gloss))
		return
	}
	if !errors.Is(err, store.ErrNotFound) {
		s.failErr(w, err, "read gloss")
		return
	}

	queued, err := s.Store.GlossQueued(r.Context(), word)
	if err != nil {
		s.failErr(w, err, "read gloss queue")
		return
	}
	// "none" covers both never asked for and asked for and given up on. The
	// popup shows the word without a meaning either way, which is the honest
	// answer and better than spinning for ever.
	status := "none"
	if queued {
		status = "pending"
	}
	writeJSON(w, http.StatusOK, glossBody(status, store.Gloss{Word: word}))
}

func glossBody(status string, g store.Gloss) map[string]any {
	return map[string]any{
		"status":  status,
		"word":    g.Word,
		"ipa":     g.IPA,
		"meaning": g.Meaning,
		"source":  g.Source,
	}
}
