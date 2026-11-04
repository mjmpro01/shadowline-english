package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
	"github.com/shadowline/server/internal/tutor"
)

const (
	// maxSaid caps one thing the learner says in a role-play: a turn in a
	// conversation, not a speech to paste.
	maxSaid = 500
	// maxTopic caps the job or the subject of the talk.
	maxTopic = 120
	// maxRoleplays is how many sessions the list shows.
	maxRoleplays = 50
)

// The fixed scenarios' names, kept with a session for the list.
var scenarioTitles = map[string]string{
	tutor.Interview:    "Job interview",
	tutor.Presentation: "Presentation",
}

// failRoleplay answers a role-play request that went wrong.
func (s *Server) failRoleplay(w http.ResponseWriter, err error, action string) {
	if errors.Is(err, store.ErrRoleplayEnded) {
		failCode(w, http.StatusConflict, "roleplay.ended", err.Error())
		return
	}
	s.failErr(w, err, action)
}

// askTutorOnce puts one question to the tutor on the learner's allowance and
// waits for the whole answer, recording what it cost. It has answered the
// request itself when it returns false.
func (s *Server) askTutorOnce(w http.ResponseWriter, r *http.Request, user uuid.UUID, messages []tutor.Message, budget int) (string, bool) {
	question, refused, wait, err := s.Store.AskTutor(r.Context(),
		store.Question{UserID: user, Model: s.Tutor.Model},
		store.TutorAllowance{
			Max: s.TutorLimit.Max, Window: s.TutorLimit.Window,
			Daily: s.TutorLimit.Daily, TotalDaily: s.TutorLimit.TotalDaily,
		})
	if err != nil {
		s.failErr(w, err, "record a question to the tutor")
		return "", false
	}
	if refused != store.TutorAllowed {
		writeTutorRefusal(w, refused, wait)
		return "", false
	}
	answer, usage, asked := s.Tutor.Complete(r.Context(), messages, budget)
	outcome := store.TutorAnswered
	switch {
	case asked != nil && r.Context().Err() != nil:
		outcome = store.TutorStopped
	case asked != nil:
		outcome = store.TutorFailed
	}
	var in, out *int
	if usage.Reported {
		in, out = &usage.PromptTokens, &usage.CompletionTokens
	}
	// Recorded whatever happens next: the tokens were spent either way.
	if err := s.Store.TutorAnswer(context.WithoutCancel(r.Context()), question, outcome, in, out); err != nil {
		s.Log.Warn("could not record a tutor answer", "error", err)
	}
	if asked != nil {
		if r.Context().Err() == nil {
			s.Log.Warn("tutor failed in a role-play", "error", asked)
			failCode(w, http.StatusBadGateway, "tutor.unreachable", "the tutor could not answer just now — try again in a moment")
		}
		return "", false
	}
	return answer, true
}

// scenarioOf is what the tutor is told about a session's part. A dialogue that
// has since gone, or been unpublished, leaves its title to play from.
func (s *Server) scenarioOf(ctx context.Context, user uuid.UUID, r store.Roleplay) (tutor.Scenario, error) {
	sc := tutor.Scenario{Kind: r.Scenario, Topic: r.Topic, Title: r.Title}
	if r.Scenario != tutor.FromDialogue {
		return sc, nil
	}
	sc.TutorRole, sc.OwnRole = "the other person", "the learner's part"
	if r.DialogueID == nil {
		return sc, nil
	}
	d, err := s.Store.PublishedDialogue(ctx, user, r.DialogueID.String())
	if errors.Is(err, store.ErrNotFound) {
		return sc, nil
	}
	if err != nil {
		return sc, err
	}
	sc.Situation = d.Situation
	for _, line := range d.Lines {
		name := line.Name
		if name == "" {
			name = line.Speaker
		}
		if line.Speaker == r.OwnSide {
			sc.OwnRole = name
		} else {
			sc.TutorRole = name
		}
		sc.Lines = append(sc.Lines, name+": "+line.Text)
	}
	for _, p := range d.Phrases {
		sc.Phrases = append(sc.Phrases, p.Phrase)
	}
	return sc, nil
}

// conversation is what was said, as the tutor is sent it: the learner's words
// as they said them, and its own lines in the part.
func conversation(turns []store.RoleplayTurn) []tutor.Message {
	said := make([]store.TutorTurn, len(turns))
	for i, t := range turns {
		said[i] = store.TutorTurn{Role: t.Role, Content: t.Content}
	}
	return recent(said)
}

// handleStartRoleplay opens a session with the tutor's first line in its part.
func (s *Server) handleStartRoleplay(w http.ResponseWriter, r *http.Request) {
	if s.Tutor == nil {
		failCode(w, http.StatusServiceUnavailable, "tutor.unavailable", "the tutor is not set up on this server")
		return
	}
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Scenario   string `json:"scenario"`
		DialogueID string `json:"dialogueId"`
		Topic      string `json:"topic"`
		// The side of the dialogue the learner plays; "You", or B, when unsaid.
		Side string `json:"side"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	session := store.Roleplay{Scenario: body.Scenario, Topic: strings.TrimSpace(body.Topic)}
	if len([]rune(session.Topic)) > maxTopic {
		failCode(w, http.StatusBadRequest, "roleplay.invalid", fmt.Sprintf("a topic can be at most %d characters", maxTopic))
		return
	}
	switch body.Scenario {
	case tutor.Interview, tutor.Presentation:
		session.Title = scenarioTitles[body.Scenario]
	case tutor.FromDialogue:
		d, err := s.Store.PublishedDialogue(r.Context(), u.ID, body.DialogueID)
		if err != nil {
			s.failErr(w, err, "find the dialogue to play")
			return
		}
		session.DialogueID, session.Title, session.Topic = &d.ID, d.Title, ""
		session.OwnSide = body.Side
		if session.OwnSide == "" {
			session.OwnSide = "B"
			for _, line := range d.Lines {
				if strings.EqualFold(line.Name, "you") {
					session.OwnSide = line.Speaker
					break
				}
			}
		}
		if session.OwnSide != "A" && session.OwnSide != "B" {
			failCode(w, http.StatusBadRequest, "roleplay.invalid", "the side is A or B")
			return
		}
	default:
		failCode(w, http.StatusBadRequest, "roleplay.invalid", "the scenario is interview, presentation or dialogue")
		return
	}

	sc, err := s.scenarioOf(r.Context(), u.ID, session)
	if err != nil {
		s.failErr(w, err, "set the scene")
		return
	}
	answer, ok := s.askTutorOnce(w, r, u.ID, tutor.RoleplayMessages(sc, nil), tutor.TurnBudget)
	if !ok {
		return
	}
	opening, err := tutor.ParseTurn(answer)
	if err != nil {
		failCode(w, http.StatusBadGateway, "tutor.silent", "the tutor had nothing to say — try again")
		return
	}
	started, err := s.Store.StartRoleplay(r.Context(), u.ID, session, opening.Reply)
	if err != nil {
		s.failErr(w, err, "start a role-play")
		return
	}
	writeJSON(w, http.StatusCreated, started)
}

// handleRoleplayTurn takes what the learner said, and answers with it said
// better, when it could be, and the tutor's next line in its part.
func (s *Server) handleRoleplayTurn(w http.ResponseWriter, r *http.Request) {
	if s.Tutor == nil {
		failCode(w, http.StatusServiceUnavailable, "tutor.unavailable", "the tutor is not set up on this server")
		return
	}
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var body struct {
		Text string `json:"text"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	said := strings.TrimSpace(body.Text)
	if said == "" {
		failCode(w, http.StatusBadRequest, "tutor.empty", "say something first")
		return
	}
	if len([]rune(said)) > maxSaid {
		failCode(w, http.StatusBadRequest, "tutor.tooLong", fmt.Sprintf("a turn can be at most %d characters", maxSaid))
		return
	}
	session, err := s.Store.RoleplaySession(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "find the role-play")
		return
	}
	if session.EndedAt != nil {
		s.failRoleplay(w, store.ErrRoleplayEnded, "role-play turn")
		return
	}
	sc, err := s.scenarioOf(r.Context(), u.ID, session.Roleplay)
	if err != nil {
		s.failErr(w, err, "set the scene")
		return
	}
	history := append(conversation(session.Turns), tutor.Message{Role: "user", Content: said})
	answer, ok := s.askTutorOnce(w, r, u.ID, tutor.RoleplayMessages(sc, history), tutor.TurnBudget)
	if !ok {
		return
	}
	turn, err := tutor.ParseTurn(answer)
	if err != nil {
		failCode(w, http.StatusBadGateway, "tutor.silent", "the tutor had nothing to say — try again")
		return
	}
	if err := s.Store.AddRoleplayTurns(r.Context(), id, said, turn.Better, turn.Why, turn.Reply); err != nil {
		s.failRoleplay(w, err, "keep a role-play turn")
		return
	}
	writeJSON(w, http.StatusOK, turn)
}

// handleEndRoleplay closes a session with feedback on the whole of it.
func (s *Server) handleEndRoleplay(w http.ResponseWriter, r *http.Request) {
	if s.Tutor == nil {
		failCode(w, http.StatusServiceUnavailable, "tutor.unavailable", "the tutor is not set up on this server")
		return
	}
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	session, err := s.Store.RoleplaySession(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "find the role-play")
		return
	}
	if session.EndedAt != nil {
		s.failRoleplay(w, store.ErrRoleplayEnded, "end a role-play")
		return
	}
	sc, err := s.scenarioOf(r.Context(), u.ID, session.Roleplay)
	if err != nil {
		s.failErr(w, err, "set the scene")
		return
	}
	answer, ok := s.askTutorOnce(w, r, u.ID, tutor.FeedbackMessages(sc, conversation(session.Turns)), tutor.FeedbackBudget)
	if !ok {
		return
	}
	feedback, err := tutor.ParseFeedback(answer)
	if err != nil {
		s.Log.Warn("tutor gave feedback in another shape", "error", err)
		failCode(w, http.StatusBadGateway, "tutor.badFeedback", "the feedback came back garbled — try again")
		return
	}
	if err := s.Store.EndRoleplay(r.Context(), id, feedback); err != nil {
		s.failRoleplay(w, err, "end a role-play")
		return
	}
	writeJSON(w, http.StatusOK, feedback)
}

func (s *Server) handleRoleplays(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	list, err := s.Store.Roleplays(r.Context(), u.ID, maxRoleplays)
	if err != nil {
		s.failErr(w, err, "list role-plays")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleRoleplay(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	session, err := s.Store.RoleplaySession(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "role-play")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleDeleteRoleplay(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteRoleplay(r.Context(), u.ID, id); err != nil {
		s.failErr(w, err, "delete a role-play")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
