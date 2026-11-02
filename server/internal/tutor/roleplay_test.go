package tutor

import (
	"errors"
	"strings"
	"testing"
)

func TestATurnIsReadWithItsCorrection(t *testing.T) {
	turn, err := ParseTurn("```json\n" + `{"better": "I have worked here for two years.", "why": "Dùng hiện tại hoàn thành.", "reply": "Great. Why do you want this job?"}` + "\n```")
	if err != nil || turn.Better != "I have worked here for two years." || turn.Reply != "Great. Why do you want this job?" {
		t.Fatalf("got %+v, %v", turn, err)
	}
	// No better way, so no reason either.
	turn, _ = ParseTurn(`{"better": "", "why": "Câu ổn.", "reply": "Nice to meet you."}`)
	if turn.Why != "" {
		t.Fatalf("a reason with nothing to correct: %+v", turn)
	}
}

func TestATurnInPlainWordsIsStillAReply(t *testing.T) {
	turn, err := ParseTurn("Thanks for coming in. Tell me about yourself.")
	if err != nil || turn.Reply != "Thanks for coming in. Tell me about yourself." || turn.Better != "" {
		t.Fatalf("got %+v, %v", turn, err)
	}
	if _, err := ParseTurn("   "); !errors.Is(err, ErrNoReply) {
		t.Fatalf("an empty answer: %v", err)
	}
}

func TestFeedbackIsAReport(t *testing.T) {
	f, err := ParseFeedback(`Here: {"summary": "Bạn trả lời rõ ràng.", "fixes": [{"said": "I very like it", "better": "I really like it", "why": "Trật tự từ."}]}`)
	if err != nil || len(f.Fixes) != 1 || f.Strengths == nil || f.Phrases == nil {
		t.Fatalf("got %+v, %v", f, err)
	}
	for _, answer := range []string{"Well done!", `{"summary": ""}`, `{"summary": "x", "fixes": "none"}`} {
		if _, err := ParseFeedback(answer); !errors.Is(err, ErrBadFeedback) {
			t.Errorf("%q: got %v", answer, err)
		}
	}
}

func TestThePartIsInThePrompt(t *testing.T) {
	interview := RoleplayMessages(Scenario{Kind: Interview, Topic: "marketing assistant"}, nil)
	if len(interview) != 2 || !strings.Contains(interview[0].Content, "interview for: marketing assistant") ||
		!strings.Contains(interview[1].Content, "Open it") {
		t.Fatalf("interview: %+v", interview)
	}
	talk := RoleplayMessages(Scenario{Kind: Presentation}, []Message{{Role: "assistant", Content: "Hi"}, {Role: "user", Content: "Hello"}})
	if len(talk) != 3 || !strings.Contains(talk[0].Content, "the audience") || talk[2].Content != "Hello" {
		t.Fatalf("presentation: %+v", talk)
	}
	scene := RoleplayMessages(Scenario{
		Kind: FromDialogue, Title: "Ordering a coffee", Situation: "Ở quán cà phê.",
		TutorRole: "Barista", OwnRole: "You",
		Lines:   []string{"Barista: What can I get for you?", "You: A latte, please."},
		Phrases: []string{"For here or to go?"},
	}, nil)[0].Content
	for _, want := range []string{"You play Barista. The learner plays You.", "- You: A latte, please.", "For here or to go?", `"better"`} {
		if !strings.Contains(scene, want) {
			t.Errorf("the dialogue's prompt has no %q", want)
		}
	}
	feedback := FeedbackMessages(Scenario{Kind: Interview}, []Message{{Role: "assistant", Content: "Hi"}, {Role: "user", Content: "I very like it"}})
	if !strings.Contains(feedback[1].Content, "Learner: I very like it") || !strings.Contains(feedback[0].Content, `"fixes"`) {
		t.Fatalf("feedback: %+v", feedback)
	}
}
