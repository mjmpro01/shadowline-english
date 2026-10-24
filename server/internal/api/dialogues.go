package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
	"github.com/shadowline/server/internal/tutor"
)

// failDialogue answers a dialogue or phrasebook request that went wrong: a 400
// for what was sent, the usual answers otherwise.
func (s *Server) failDialogue(w http.ResponseWriter, err error, action string) {
	var bad store.ErrBadDialogue
	if errors.As(err, &bad) {
		failCode(w, http.StatusBadRequest, "dialogue.invalid", bad.Why)
		return
	}
	s.failErr(w, err, action)
}

// --- The learner's side ------------------------------------------------------

func (s *Server) handleListDialogues(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	list, err := s.Store.PublishedDialogues(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "list dialogues")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// handleDialogue is one published dialogue, by id or slug, with this learner's
// passes at each line.
func (s *Server) handleDialogue(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	d, err := s.Store.PublishedDialogue(r.Context(), u.ID, chi.URLParam(r, "id"))
	if err != nil {
		s.failErr(w, err, "dialogue")
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleDialoguePass counts one reading aloud of a line.
func (s *Server) handleDialoguePass(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var body struct {
		Line  int `json:"line"`
		Heard int `json:"heard"`
		Total int `json:"total"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	passes, err := s.Store.RecordPass(r.Context(), u.ID, id, body.Line, body.Heard, body.Total)
	if err != nil {
		s.failDialogue(w, err, "record a pass")
		return
	}
	writeJSON(w, http.StatusOK, passes)
}

func (s *Server) handlePhrasebook(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	list, err := s.Store.Phrasebook(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "phrasebook")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleAddPhrase(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body store.PhraseInput
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := s.Store.AddPhrase(r.Context(), u.ID, body)
	if err != nil {
		s.failDialogue(w, err, "add a phrase")
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *Server) handleUpdatePhrase(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var body store.PhraseInput
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := s.Store.UpdatePhrase(r.Context(), u.ID, id, body)
	if err != nil {
		s.failDialogue(w, err, "update a phrase")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeletePhrase(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeletePhrase(r.Context(), u.ID, id); err != nil {
		s.failErr(w, err, "delete a phrase")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- The console -------------------------------------------------------------

func (s *Server) handleAllDialogues(w http.ResponseWriter, r *http.Request) {
	list, err := s.Store.AllDialogues(r.Context())
	if err != nil {
		s.failErr(w, err, "all dialogues")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleCreateDialogue(w http.ResponseWriter, r *http.Request) {
	var body store.DialogueInput
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := s.Store.CreateDialogue(r.Context(), body)
	if err != nil {
		s.failDialogue(w, err, "create a dialogue")
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *Server) handleUpdateDialogue(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var body store.DialogueInput
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := s.Store.UpdateDialogue(r.Context(), id, body)
	if err != nil {
		s.failDialogue(w, err, "update a dialogue")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteDialogue(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteDialogue(r.Context(), id); err != nil {
		s.failErr(w, err, "delete a dialogue")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// maxSituation caps the situation an admin asks the tutor to write for.
const maxSituation = 500

// handleDraftDialogue asks the tutor for a first draft of a dialogue, for an
// admin to edit. Nothing is kept but the cost: the question is recorded with
// the learners', outside their allowance, so the console's usage page shows
// what drafting spends.
func (s *Server) handleDraftDialogue(w http.ResponseWriter, r *http.Request) {
	if s.Tutor == nil {
		failCode(w, http.StatusServiceUnavailable, "tutor.unavailable", "the tutor is not set up on this server")
		return
	}
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Situation string `json:"situation"`
		Level     string `json:"level"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	situation := strings.TrimSpace(body.Situation)
	if situation == "" || len([]rune(situation)) > maxSituation {
		failCode(w, http.StatusBadRequest, "dialogue.invalid", "say in a sentence or two what the dialogue is about")
		return
	}
	level := body.Level
	if level == "" {
		level = "A2"
	}
	if !store.DialogueLevel(level) {
		failCode(w, http.StatusBadRequest, "dialogue.invalid", "the level is one of A1, A2, B1 and B2")
		return
	}

	question, _, _, err := s.Store.AskTutor(r.Context(),
		store.Question{UserID: u.ID, Model: s.Tutor.Model}, store.TutorAllowance{})
	if err != nil {
		s.failErr(w, err, "record a draft")
		return
	}
	answer, usage, asked := s.Tutor.Complete(r.Context(), tutor.DraftMessages(situation, level), tutor.DraftBudget)
	outcome := store.TutorAnswered
	if asked != nil {
		outcome = store.TutorFailed
	}
	var in, out *int
	if usage.Reported {
		in, out = &usage.PromptTokens, &usage.CompletionTokens
	}
	// Recorded whatever happens next: the tokens were spent either way.
	if err := s.Store.TutorAnswer(context.WithoutCancel(r.Context()), question, outcome, in, out); err != nil {
		s.Log.Warn("record a draft's cost", "error", err)
	}
	if asked != nil {
		s.Log.Warn("tutor failed to draft", "error", asked)
		failCode(w, http.StatusBadGateway, "tutor.unreachable", "the tutor could not write a draft just now — try again in a moment")
		return
	}
	draft, err := tutor.ParseDraft(answer)
	if err != nil {
		s.Log.Warn("tutor drafted something else", "error", err)
		failCode(w, http.StatusBadGateway, "tutor.badDraft", "the tutor's draft came back garbled — try again")
		return
	}

	found := store.DialogueInput{Title: draft.Title, Situation: situation, Topic: draft.Topic, Level: level}
	for _, l := range draft.Lines {
		found.Lines = append(found.Lines, store.DialogueLine{Speaker: l.Speaker, Name: l.Name, Text: l.Text, Vi: l.Vi})
	}
	for _, p := range draft.Phrases {
		found.Phrases = append(found.Phrases, store.DialoguePhrase{Phrase: p.Phrase, Note: p.Note})
	}
	// A draft that would not save is no use to edit from either.
	if err := found.Clean(); err != nil {
		s.Log.Warn("tutor drafted a dialogue that does not hold", "error", err)
		failCode(w, http.StatusBadGateway, "tutor.badDraft", "the tutor's draft came back garbled — try again")
		return
	}
	writeJSON(w, http.StatusOK, found)
}
