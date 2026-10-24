package tutor

import (
	"errors"
	"strings"
	"testing"
)

func TestADraftIsReadFromWhateverIsAroundIt(t *testing.T) {
	answer := "Here you go:\n```json\n" +
		`{"title": "At the bakery", "topic": "Shopping", "lines": [` +
		`{"speaker": "A", "name": "Baker", "text": "Morning! What can I get you?", "vi": "Chào buổi sáng!"},` +
		`{"speaker": "B", "name": "You", "text": "Two croissants, please.", "vi": "Cho tôi hai bánh sừng bò."}]}` +
		"\n```"
	d, err := ParseDraft(answer)
	if err != nil {
		t.Fatal(err)
	}
	if d.Title != "At the bakery" || len(d.Lines) != 2 || d.Lines[1].Name != "You" || d.Phrases == nil {
		t.Fatalf("got %+v", d)
	}
}

func TestADraftThatIsNotADialogueIsRefused(t *testing.T) {
	for _, answer := range []string{
		"I can't write that.",
		`{"title": "x", "lines": [{"speaker": "A", "text": "Hi"}]}`,
		`{"title": "", "lines": [{"speaker": "A", "text": "Hi"}, {"speaker": "B", "text": "Hey"}]}`,
		`{"title": "x", "lines": [`,
	} {
		if _, err := ParseDraft(answer); !errors.Is(err, ErrBadDraft) {
			t.Errorf("%q: got %v", answer, err)
		}
	}
}

func TestTheDraftIsAskedForAtItsLevel(t *testing.T) {
	m := DraftMessages("Ordering at a bakery", "B1")
	if len(m) != 2 || !strings.Contains(m[0].Content, "CEFR level B1") || !strings.Contains(m[1].Content, "bakery") {
		t.Fatalf("got %+v", m)
	}
}
