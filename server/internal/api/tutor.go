package api

import (
	"context"
	"encoding/json"
	"errors"
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
	// maxAnswer caps a previous answer sent back as history. Ours are short by
	// instruction, so a long one is somebody else's text.
	maxAnswer = 6000
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
// The answer comes back as server-sent events: `{"delta": "..."}` per piece,
// `{"done": true}` at the end, and `{"error": "..."}` if the model fails after
// it has started. A failure before the first piece is an ordinary HTTP error
// instead, because there is still a status code to put it in.
func (s *Server) handleTutorChat(w http.ResponseWriter, r *http.Request) {
	if s.Tutor == nil {
		fail(w, http.StatusServiceUnavailable, "the tutor is not set up on this server")
		return
	}
	u, _ := auth.UserFrom(r.Context())

	var body struct {
		Messages []tutor.Message `json:"messages"`
		ClipID   string          `json:"clipId"`
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
	history, err := conversation(body.Messages)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
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
	question, ok, wait, err := s.Store.AskTutor(r.Context(),
		store.Question{UserID: u.ID, ClipID: clipID, Model: s.Tutor.Model},
		s.TutorLimit.Max, s.TutorLimit.Window)
	if err != nil {
		s.failErr(w, err, "record a question to the tutor")
		return
	}
	if !ok {
		seconds := max(1, int(math.Ceil(wait.Seconds())))
		w.Header().Set("Retry-After", fmt.Sprint(seconds))
		fail(w, http.StatusTooManyRequests,
			fmt.Sprintf("that is a lot of questions at once — try again in %d seconds", seconds))
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

	messages := append([]tutor.Message{tutor.System(body.Locale, clip, practice)}, history...)

	control := http.NewResponseController(w)
	if err := control.SetWriteDeadline(time.Now().Add(streamTimeout)); err != nil {
		s.Log.Warn("could not extend the deadline for a tutor answer", "error", err)
	}

	// Headers are held back until the first piece arrives, so a model that
	// refuses outright can still be reported with a status code.
	started := false
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

// conversation checks what the browser sent and keeps the part the model gets.
//
// Only the learner's and the tutor's own turns: a `system` message from the
// browser is refused rather than dropped, because a request carrying one is
// somebody trying something.
func conversation(in []tutor.Message) ([]tutor.Message, error) {
	if len(in) == 0 {
		return nil, errors.New("there is no question to answer")
	}
	if len(in) > maxTurns {
		in = in[len(in)-maxTurns:]
	}
	out := make([]tutor.Message, 0, len(in))
	for _, m := range in {
		m.Content = strings.TrimSpace(m.Content)
		switch m.Role {
		case "user":
			if len([]rune(m.Content)) > maxAsk {
				return nil, fmt.Errorf("a message can be at most %d characters", maxAsk)
			}
		case "assistant":
			if len([]rune(m.Content)) > maxAnswer {
				return nil, errors.New("an earlier answer is longer than any the tutor gives")
			}
		default:
			return nil, fmt.Errorf("a message can come from the learner or the tutor, not %q", m.Role)
		}
		if m.Content == "" {
			continue
		}
		out = append(out, m)
	}
	if len(out) == 0 || out[len(out)-1].Role != "user" {
		return nil, errors.New("the last message has to be the learner's question")
	}
	return out, nil
}
