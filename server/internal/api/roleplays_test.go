package api_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/shadowline/server/internal/tutor"
)

// Role-play: the tutor plays a part, corrects each thing the learner says on
// the way, and ends with feedback. Kept, to be read again.

type roleplayJSON struct {
	ID       string `json:"id"`
	Scenario string `json:"scenario"`
	Title    string `json:"title"`
	Topic    string `json:"topic"`
	OwnSide  string `json:"ownSide"`
	EndedAt  *string
	Turns    []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
		Better  string `json:"better"`
		Why     string `json:"why"`
	} `json:"turns"`
	Feedback *struct {
		Summary string `json:"summary"`
	} `json:"feedback"`
}

type turnJSON struct {
	Better string `json:"better"`
	Why    string `json:"why"`
	Reply  string `json:"reply"`
}

const (
	opening  = `{"better": "", "why": "", "reply": "Thanks for coming in. Could you tell me about yourself?"}`
	answered = `{"better": "I have worked in marketing for two years.", "why": "Dùng hiện tại hoàn thành cho việc vẫn đang làm.", "reply": "Great. Why do you want this job?"}`
	reported = `{"summary": "Bạn trả lời tự tin.", "strengths": ["Câu ngắn gọn"], "fixes": [{"said": "I work in marketing since two years", "better": "I have worked in marketing for two years.", "why": "Hiện tại hoàn thành."}], "phrases": [{"phrase": "I'm keen to…", "note": "Nói mong muốn một cách tích cực."}]}`
)

func TestAnInterviewIsPlayedCorrectedAndReportedOn(t *testing.T) {
	h := newHarness(t)
	fake := withTutor(t, h, 0)
	learner := h.login("learner@example.com")

	fake.answer = []string{opening}
	started := expect[roleplayJSON](t, learner.json("POST", "/api/roleplays",
		map[string]string{"scenario": "interview", "topic": "marketing assistant"}), http.StatusCreated)
	if started.Title != "Job interview" || started.Topic != "marketing assistant" || len(started.Turns) != 1 ||
		started.Turns[0].Content != "Thanks for coming in. Could you tell me about yourself?" {
		t.Fatalf("got %+v", started)
	}
	if sent := fake.last(t); !strings.Contains(sent[0].Content, "interview for: marketing assistant") {
		t.Fatalf("the tutor was told %q", sent[0].Content)
	}

	fake.answer = []string{answered[:30], answered[30:]}
	turn := expect[turnJSON](t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns",
		map[string]string{"text": "I work in marketing since two years"}), http.StatusOK)
	if turn.Better != "I have worked in marketing for two years." || turn.Reply != "Great. Why do you want this job?" {
		t.Fatalf("got %+v", turn)
	}
	// The tutor had the conversation so far: its own line, then the learner's.
	sent := fake.last(t)
	if len(sent) != 3 || sent[1].Role != "assistant" || sent[2].Content != "I work in marketing since two years" {
		t.Fatalf("the tutor was sent %+v", sent)
	}

	// A tutor that forgets the JSON has still answered, in its part.
	fake.answer = []string{"Interesting! And what are your strengths?"}
	turn = expect[turnJSON](t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns",
		map[string]string{"text": "Because I love brands."}), http.StatusOK)
	if turn.Reply != "Interesting! And what are your strengths?" || turn.Better != "" {
		t.Fatalf("got %+v", turn)
	}

	fake.answer = []string{reported}
	expect[map[string]any](t, learner.json("POST", "/api/roleplays/"+started.ID+"/end", map[string]any{}), http.StatusOK)
	kept := expect[roleplayJSON](t, learner.do("GET", "/api/roleplays/"+started.ID, "", nil), http.StatusOK)
	if len(kept.Turns) != 5 || kept.Turns[1].Better != "I have worked in marketing for two years." ||
		kept.Turns[1].Why == "" || kept.Feedback == nil || kept.Feedback.Summary != "Bạn trả lời tự tin." || kept.EndedAt == nil {
		t.Fatalf("kept %+v", kept)
	}
	expectCode(t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns", map[string]string{"text": "One more?"}),
		http.StatusConflict, "roleplay.ended")
	expectCode(t, learner.json("POST", "/api/roleplays/"+started.ID+"/end", map[string]any{}),
		http.StatusConflict, "roleplay.ended")

	// Every question, the feedback too, is paid for and counted.
	var asked int
	if err := h.pool.QueryRow(context.Background(), `select count(*) from tutor_questions where outcome = 'answered'`).Scan(&asked); err != nil {
		t.Fatal(err)
	}
	if asked != 4 {
		t.Fatalf("%d questions recorded, want 4", asked)
	}

	list := expect[[]roleplayJSON](t, learner.do("GET", "/api/roleplays", "", nil), http.StatusOK)
	if len(list) != 1 || list[0].ID != started.ID {
		t.Fatalf("list %+v", list)
	}
	expectStatus(t, learner.do("DELETE", "/api/roleplays/"+started.ID, "", nil), http.StatusNoContent)
	expectStatus(t, learner.do("GET", "/api/roleplays/"+started.ID, "", nil), http.StatusNotFound)
}

// A dialogue played: the tutor takes the other side, knows how it goes, and
// is told the phrases to draw out.
func TestADialogueIsPlayedFromTheOtherSide(t *testing.T) {
	h := newHarness(t)
	seedDialogues(t, h)
	fake := withTutor(t, h, 0)
	learner := h.login("learner@example.com")

	fake.answer = []string{`{"better": "", "why": "", "reply": "Hi there! What can I get for you?"}`}
	started := expect[roleplayJSON](t, learner.json("POST", "/api/roleplays",
		map[string]string{"scenario": "dialogue", "dialogueId": "ordering-a-coffee"}), http.StatusCreated)
	if started.Title != "Ordering a coffee" || started.OwnSide != "B" {
		t.Fatalf("got %+v", started)
	}
	prompt := fake.last(t)[0].Content
	for _, want := range []string{"You play Barista. The learner plays You.", "Barista: Sure. For here or to go?", "Keep the change."} {
		if !strings.Contains(prompt, want) {
			t.Errorf("the prompt has no %q", want)
		}
	}

	// The other side, asked for.
	expect[roleplayJSON](t, learner.json("POST", "/api/roleplays",
		map[string]string{"scenario": "dialogue", "dialogueId": "ordering-a-coffee", "side": "A"}), http.StatusCreated)
	if prompt := fake.last(t)[0].Content; !strings.Contains(prompt, "You play You. The learner plays Barista.") {
		t.Fatalf("the prompt: %s", prompt)
	}

	expectStatus(t, learner.json("POST", "/api/roleplays",
		map[string]string{"scenario": "dialogue", "dialogueId": "no-such-dialogue"}), http.StatusNotFound)
	expectCode(t, learner.json("POST", "/api/roleplays", map[string]string{"scenario": "karaoke"}),
		http.StatusBadRequest, "roleplay.invalid")
}

func TestARoleplayIsItsLearners(t *testing.T) {
	h := newHarness(t)
	fake := withTutor(t, h, 0)
	learner := h.login("learner@example.com")
	other := h.login("other@example.com")
	fake.answer = []string{opening}
	started := expect[roleplayJSON](t, learner.json("POST", "/api/roleplays", map[string]string{"scenario": "presentation"}), http.StatusCreated)

	expectStatus(t, other.do("GET", "/api/roleplays/"+started.ID, "", nil), http.StatusNotFound)
	expectStatus(t, other.json("POST", "/api/roleplays/"+started.ID+"/turns", map[string]string{"text": "Hi"}), http.StatusNotFound)
	expectStatus(t, other.json("POST", "/api/roleplays/"+started.ID+"/end", map[string]any{}), http.StatusNotFound)
	expectStatus(t, other.do("DELETE", "/api/roleplays/"+started.ID, "", nil), http.StatusNotFound)
	if theirs := expect[[]roleplayJSON](t, other.do("GET", "/api/roleplays", "", nil), http.StatusOK); len(theirs) != 0 {
		t.Fatalf("another learner's list: %+v", theirs)
	}
	expectCode(t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns", map[string]string{"text": "  "}),
		http.StatusBadRequest, "tutor.empty")
	expectCode(t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns", map[string]string{"text": strings.Repeat("a", 501)}),
		http.StatusBadRequest, "tutor.tooLong")
}

// Role-play is the tutor's time like any question: within the allowance, and
// not at all without a tutor.
func TestARoleplayIsWithinTheTutorsAllowance(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	expectCode(t, learner.json("POST", "/api/roleplays", map[string]string{"scenario": "interview"}),
		http.StatusServiceUnavailable, "tutor.unavailable")

	fake := withTutor(t, h, 2)
	h.srv.TutorLimit = tutor.Limit{Max: 2, Window: time.Minute}
	fake.answer = []string{opening}
	started := expect[roleplayJSON](t, learner.json("POST", "/api/roleplays", map[string]string{"scenario": "interview"}), http.StatusCreated)
	fake.answer = []string{answered}
	expect[turnJSON](t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns", map[string]string{"text": "Hello"}), http.StatusOK)
	expectCode(t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns", map[string]string{"text": "Hello again"}),
		http.StatusTooManyRequests, "tutor.window")
	kept := expect[roleplayJSON](t, learner.do("GET", "/api/roleplays/"+started.ID, "", nil), http.StatusOK)
	if len(kept.Turns) != 3 {
		t.Fatalf("a refused turn was kept: %+v", kept.Turns)
	}

	// A router that fails keeps nothing either.
	h.srv.TutorLimit = tutor.Limit{}
	fake.status = http.StatusPaymentRequired
	expectCode(t, learner.json("POST", "/api/roleplays/"+started.ID+"/turns", map[string]string{"text": "Hello again"}),
		http.StatusBadGateway, "tutor.unreachable")
	if kept := expect[roleplayJSON](t, learner.do("GET", "/api/roleplays/"+started.ID, "", nil), http.StatusOK); len(kept.Turns) != 3 {
		t.Fatalf("a failed turn was kept: %+v", kept.Turns)
	}
}
