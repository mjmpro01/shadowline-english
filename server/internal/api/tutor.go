package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
	"github.com/shadowline/server/internal/tutor"
)

const (
	// maxTurns is how much of the conversation goes back to the model. The app
	// keeps more on screen; the model gets the recent end, because every turn
	// sent is paid for again on every message after it.
	maxTurns = 20
	// maxAsk caps one message from the learner. A question about English fits in
	// far less; this is here for the paste of a whole article.
	maxAsk = 2000
	// maxHistory is all the conversation's text the model is sent, oldest turns
	// dropped first: every turn sent is paid for again on every question after.
	maxHistory = 12000
	// maxTitle is how much of the first question names a conversation in the list.
	maxTitle = 80
	// maxConversations is how many the history list shows.
	maxConversations = 50
	// streamTimeout is the deadline for one answer. Longer than the minute every
	// other request gets: a model that is thinking is not a stuck handler.
	streamTimeout = 3 * time.Minute
)

// languageTag is the shape of a BCP 47 tag the app might send — "vi", "en",
// "pt-BR", "zh-Hant". It goes into the system prompt, so anything else is
// refused rather than passed on: this field is not a place for sentences.
var languageTag = regexp.MustCompile(`^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$`)

// handleTutorStatus says whether there is a tutor at all, so the app can leave
// the chat out rather than offer one that answers every message with an error.
func (s *Server) handleTutorStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"enabled": s.Tutor != nil})
}

// handleTutorChat streams the tutor's answer to the learner's latest message.
//
// The browser sends the conversation — learner and tutor turns only — and which
// clip is on screen, if any. The system prompt is added here and nowhere else,
// along with the learner's real measurements on that clip, so the tutor's advice
// is about their take rather than about takes in general, and so nobody can talk
// it out of being a tutor by editing a request.
//
// The browser sends one question and the conversation it belongs to, if any.
// The history is read from the database — the browser used to send it, which
// let it write the tutor's past answers for it — and the question and answer
// are kept there when the answer ends, so the learner can come back to them.
//
// The answer comes back as server-sent events: `{"delta": "..."}` per piece,
// the first also carrying `"conversation"` (its id, new or not), `{"done":
// true}` at the end, and `{"error": "..."}` if the model fails after it has
// started. A failure before the first piece is an ordinary HTTP error instead,
// because there is still a status code to put it in, and keeps nothing.
func (s *Server) handleTutorChat(w http.ResponseWriter, r *http.Request) {
	if s.Tutor == nil {
		fail(w, http.StatusServiceUnavailable, "the tutor is not set up on this server")
		return
	}
	u, _ := auth.UserFrom(r.Context())

	var body struct {
		Message        string `json:"message"`
		ConversationID string `json:"conversationId"`
		ClipID         string `json:"clipId"`
		// The language the app is set to. The tutor answers in the language of
		// the question; this is for a message that does not have one, like a
		// bare English sentence to correct.
		Locale string `json:"locale"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Locale != "" && !languageTag.MatchString(body.Locale) {
		fail(w, http.StatusBadRequest, "locale is not a language tag")
		return
	}
	asked := strings.TrimSpace(body.Message)
	if asked == "" {
		fail(w, http.StatusBadRequest, "there is no question to answer")
		return
	}
	if len([]rune(asked)) > maxAsk {
		fail(w, http.StatusBadRequest, fmt.Sprintf("a message can be at most %d characters", maxAsk))
		return
	}

	// A conversation to carry on is this learner's, or there is none.
	var history []tutor.Message
	var conversationID *uuid.UUID
	if body.ConversationID != "" {
		id, err := uuid.Parse(body.ConversationID)
		if err != nil {
			fail(w, http.StatusBadRequest, "conversationId is not an id")
			return
		}
		if _, err := s.Store.TutorConversation(r.Context(), u.ID, id); err != nil {
			s.failErr(w, err, "find the conversation")
			return
		}
		turns, err := s.Store.TutorTurns(r.Context(), id)
		if err != nil {
			s.failErr(w, err, "read the conversation")
			return
		}
		history = recent(turns)
		conversationID = &id
	}

	var clip *tutor.Clip
	var practice *tutor.Practice
	var clipID *uuid.UUID
	if body.ClipID != "" {
		id, err := uuid.Parse(body.ClipID)
		if err != nil {
			fail(w, http.StatusBadRequest, "clipId is not an id")
			return
		}
		clipID = &id
	}

	// The question is written down before it is asked, and counted against the
	// learner's allowance in the same step: the row is both the limit and the
	// record of what the tutor costs.
	question, refused, wait, err := s.Store.AskTutor(r.Context(),
		store.Question{UserID: u.ID, ClipID: clipID, Model: s.Tutor.Model},
		store.TutorAllowance{
			Max: s.TutorLimit.Max, Window: s.TutorLimit.Window,
			Daily: s.TutorLimit.Daily, TotalDaily: s.TutorLimit.TotalDaily,
		})
	if err != nil {
		s.failErr(w, err, "record a question to the tutor")
		return
	}
	if refused != store.TutorAllowed {
		seconds := max(1, int(math.Ceil(wait.Seconds())))
		w.Header().Set("Retry-After", fmt.Sprint(seconds))
		var why string
		switch refused {
		case store.TutorDayUsed:
			why = fmt.Sprintf("you have asked the tutor a lot today — it can answer again in about %d hours", max(1, seconds/3600))
		case store.TutorAllUsed:
			why = "the tutor has answered all it can for today — try again later"
		default:
			why = fmt.Sprintf("that is a lot of questions at once — try again in %d seconds", seconds)
		}
		fail(w, http.StatusTooManyRequests, why)
		return
	}
	// However the answer ends, it is recorded — on a context of its own, since
	// a learner pressing Stop cancels the request's.
	outcome := store.TutorFailed
	var usage tutor.Usage
	defer func() {
		var in, out *int
		if usage.Reported {
			in, out = &usage.PromptTokens, &usage.CompletionTokens
		}
		if err := s.Store.TutorAnswer(context.WithoutCancel(r.Context()), question, outcome, in, out); err != nil {
			s.Log.Warn("could not record a tutor answer", "error", err)
		}
	}()

	if clipID != nil {
		found, err := s.Store.ClipByID(r.Context(), *clipID)
		if err != nil {
			s.failErr(w, err, "get the clip for the tutor")
			return
		}
		clip = &tutor.Clip{Title: found.Title}
		if len(found.Captions) > 0 {
			clip.Line, clip.IPA = found.Captions[0].Text, found.Captions[0].IPA
		}
		done, err := s.Store.PracticeOn(r.Context(), u.ID, *clipID)
		if err != nil {
			s.failErr(w, err, "read practice for the tutor")
			return
		}
		practice = &tutor.Practice{
			Takes: done.Takes, Best: done.Best, Latest: done.Latest, Unheard: done.Unheard,
		}
	}

	// A new conversation is opened now, so its id can go out with the first
	// piece of the answer — a learner who stops the answer still has it to
	// carry on from. One that never gets an exchange is dropped again below.
	started := false
	opened := false
	if conversationID == nil {
		id, err := s.Store.StartTutorConversation(r.Context(), u.ID, clipID, titleOf(asked))
		if err != nil {
			s.failErr(w, err, "start a conversation")
			return
		}
		conversationID, opened = &id, true
	}
	var said strings.Builder
	defer func() {
		keep := context.WithoutCancel(r.Context())
		answer := strings.TrimSpace(said.String())
		if answer != "" {
			// Kept however it ended — answered, stopped or cut off — because
			// that is what the learner saw.
			if err := s.Store.RecordTutorExchange(keep, *conversationID, asked, answer); err != nil {
				s.Log.Warn("could not keep a tutor exchange", "error", err)
			}
		} else if opened {
			if err := s.Store.DropEmptyTutorConversation(keep, *conversationID); err != nil {
				s.Log.Warn("could not drop an empty conversation", "error", err)
			}
		}
	}()

	messages := append([]tutor.Message{tutor.System(body.Locale, clip, practice)}, history...)
	messages = append(messages, tutor.Message{Role: "user", Content: asked})

	control := http.NewResponseController(w)
	if err := control.SetWriteDeadline(time.Now().Add(streamTimeout)); err != nil {
		s.Log.Warn("could not extend the deadline for a tutor answer", "error", err)
	}

	// Headers are held back until the first piece arrives, so a model that
	// refuses outright can still be reported with a status code.
	send := func(event any) error {
		if !started {
			h := w.Header()
			h.Set("Content-Type", "text/event-stream")
			h.Set("Cache-Control", "no-cache")
			// nginx buffers proxied responses by default, which would hold the
			// whole answer back and deliver it at once — the opposite of streaming.
			h.Set("X-Accel-Buffering", "no")
			w.WriteHeader(http.StatusOK)
			started = true
		}
		raw, err := json.Marshal(event)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", raw); err != nil {
			return err
		}
		return control.Flush()
	}

	usage, err = s.Tutor.Stream(r.Context(), messages, func(delta string) error {
		first := said.Len() == 0
		said.WriteString(delta)
		if first {
			return send(map[string]string{"delta": delta, "conversation": conversationID.String()})
		}
		return send(map[string]string{"delta": delta})
	})

	switch {
	case err == nil:
		if !started {
			fail(w, http.StatusBadGateway, "the tutor had nothing to say — try asking again")
			return
		}
		outcome = store.TutorAnswered
		_ = send(map[string]bool{"done": true})
	case r.Context().Err() != nil:
		outcome = store.TutorStopped
		// The learner closed the chat or asked something else. Nothing to say
		// and nobody to say it to.
	case !started:
		s.Log.Warn("tutor failed", "error", err)
		fail(w, http.StatusBadGateway, "the tutor could not answer just now — try again in a moment")
	default:
		s.Log.Warn("tutor failed mid-answer", "error", err)
		_ = send(map[string]string{"error": "the answer was cut off — try asking again"})
	}
}

// handleTutorUsage is what the tutor has cost: questions and tokens by day,
// and the learners asking most, over the last `days` days (30 unless asked).
//
// Tokens are what the router reported. It reports nothing for an answer the
// learner stopped, so those days read low by that much — the question is still
// counted.
func (s *Server) handleTutorUsage(w http.ResponseWriter, r *http.Request) {
	days := 30
	if raw := r.URL.Query().Get("days"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 366 {
			fail(w, http.StatusBadRequest, "days is a number from 1 to 366")
			return
		}
		days = n
	}
	byDay, byLearner, err := s.Store.TutorUsage(r.Context(), days, 20)
	if err != nil {
		s.failErr(w, err, "read the tutor's usage")
		return
	}
	var model string
	if s.Tutor != nil {
		model = s.Tutor.Model
	}
	if byDay == nil {
		byDay = []store.TutorDay{}
	}
	if byLearner == nil {
		byLearner = []store.TutorLearner{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"days":     byDay,
		"learners": byLearner,
		"model":    model,
		"limit": map[string]any{
			"questions":     s.TutorLimit.Max,
			"windowMinutes": int(s.TutorLimit.Window.Minutes()),
		},
	})
}

// recent is the end of a conversation the model is sent: at most maxTurns
// turns and maxHistory characters, the latest kept.
func recent(turns []store.TutorTurn) []tutor.Message {
	if len(turns) > maxTurns {
		turns = turns[len(turns)-maxTurns:]
	}
	total := 0
	start := len(turns)
	for start > 0 {
		n := len([]rune(turns[start-1].Content))
		if total+n > maxHistory {
			break
		}
		total += n
		start--
	}
	out := make([]tutor.Message, 0, len(turns)-start)
	for _, t := range turns[start:] {
		out = append(out, tutor.Message{Role: t.Role, Content: t.Content})
	}
	return out
}

// titleOf names a conversation after its first question.
func titleOf(question string) string {
	title := strings.Join(strings.Fields(question), " ")
	if runes := []rune(title); len(runes) > maxTitle {
		title = strings.TrimSpace(string(runes[:maxTitle-1])) + "…"
	}
	return title
}

// handleTutorConversations is the learner's history, the latest first.
func (s *Server) handleTutorConversations(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	list, err := s.Store.TutorConversations(r.Context(), u.ID, maxConversations)
	if err != nil {
		s.failErr(w, err, "list conversations")
		return
	}
	writeJSON(w, http.StatusOK, orNone(list))
}

// handleTutorConversation is one conversation with everything said in it.
func (s *Server) handleTutorConversation(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	conversation, err := s.Store.TutorConversation(r.Context(), u.ID, id)
	if err != nil {
		s.failErr(w, err, "get the conversation")
		return
	}
	turns, err := s.Store.TutorTurns(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "read the conversation")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"conversation": conversation, "messages": orNone(turns)})
}

func (s *Server) handleDeleteTutorConversation(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteTutorConversation(r.Context(), u.ID, id); err != nil {
		s.failErr(w, err, "delete the conversation")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
