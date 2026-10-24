package tutor

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// A dialogue written by the model for an admin to edit: a first draft of a
// short everyday conversation for learners, from a situation.

// DraftBudget is how long a drafted dialogue can run: ten lines each way with
// their Vietnamese, and a few phrases with notes.
const DraftBudget = 2500

// DraftLine and DraftPhrase are the draft's parts, in the shape the console
// edits them.
type DraftLine struct {
	Speaker string `json:"speaker"`
	Name    string `json:"name"`
	Text    string `json:"text"`
	Vi      string `json:"vi"`
}

type DraftPhrase struct {
	Phrase string `json:"phrase"`
	Note   string `json:"note"`
}

// Draft is the model's dialogue.
type Draft struct {
	Title string `json:"title"`
	// Situation is the scene in a sentence of Vietnamese, for the learner.
	Situation string        `json:"situation"`
	Topic     string        `json:"topic"`
	Lines     []DraftLine   `json:"lines"`
	Phrases   []DraftPhrase `json:"phrases"`
}

const draftInstructions = `You write short, natural everyday English dialogues for Vietnamese learners of English.

Write one dialogue for the situation the admin gives, at CEFR level %s.
- A one-sentence situation in Vietnamese saying where this is and who is talking.
- Two people, A and B, each with a short role name ("Barista", "You"). The learner usually plays "You".
- 6 to 10 lines, alternating, the way people really talk: contractions, short answers, polite phrases.
- Each line with a natural Vietnamese translation.
- 3 to 5 phrases worth copying into a phrasebook, each with a note in Vietnamese on when to use it and how it feels.
- Original writing: do not reproduce dialogues from websites or textbooks.

Answer with JSON only, no prose and no code fence, exactly in this shape:
{"title": "...", "situation": "...", "topic": "...", "lines": [{"speaker": "A", "name": "...", "text": "...", "vi": "..."}], "phrases": [{"phrase": "...", "note": "..."}]}`

// DraftMessages asks for a dialogue for a situation, at a level.
func DraftMessages(situation, level string) []Message {
	return []Message{
		{Role: "system", Content: fmt.Sprintf(draftInstructions, level)},
		{Role: "user", Content: "Situation: " + situation},
	}
}

// ErrBadDraft is a model's answer that is not a usable dialogue.
var ErrBadDraft = errors.New("the tutor's draft was not a dialogue")

// ParseDraft reads the model's answer: the JSON object in it, even with words
// or a code fence around it.
func ParseDraft(answer string) (Draft, error) {
	var d Draft
	start, end := strings.Index(answer, "{"), strings.LastIndex(answer, "}")
	if start < 0 || end <= start {
		return d, ErrBadDraft
	}
	if err := json.Unmarshal([]byte(answer[start:end+1]), &d); err != nil {
		return d, fmt.Errorf("%w: %v", ErrBadDraft, err)
	}
	if strings.TrimSpace(d.Title) == "" || len(d.Lines) < 2 {
		return d, ErrBadDraft
	}
	if d.Phrases == nil {
		d.Phrases = []DraftPhrase{}
	}
	return d, nil
}
