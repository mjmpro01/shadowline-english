package tutor

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Role-play: the tutor plays a part — an interviewer, an audience, the other
// person in a dialogue — and the learner the other, a turn at a time. Each
// turn of the learner's comes back with a better way to say it when there is
// one; the session ends in feedback on the whole.

// Budgets: a turn is a correction and a line or two in character; feedback is
// a short report.
const (
	TurnBudget     = 600
	FeedbackBudget = 1500
)

// The fixed scenarios. A dialogue is a scenario too, built from the dialogue.
const (
	Interview    = "interview"
	Presentation = "presentation"
	FromDialogue = "dialogue"
)

// Scenario is what the tutor is told about the part it plays.
type Scenario struct {
	Kind string
	// Topic is the learner's: the job applied for, what the talk is about.
	Topic string
	// For a dialogue: its title, where it happens, the part the tutor plays
	// and the learner's, how it goes, and the phrases to draw the learner to.
	Title     string
	Situation string
	TutorRole string
	OwnRole   string
	Lines     []string
	Phrases   []string
}

func (sc Scenario) scene() string {
	switch sc.Kind {
	case Interview:
		job := sc.Topic
		if job == "" {
			job = "an office job the learner chooses — ask them which, in your first question"
		}
		return "You are a friendly but professional interviewer in a job interview for: " + job + `.
The learner is the candidate. Ask one interview question at a time — about themselves, their experience, strengths and weaknesses, why this job, a difficult situation they handled — and follow up on what they say. After six to eight questions, invite their questions and close the interview politely.`
	case Presentation:
		topic := sc.Topic
		if topic == "" {
			topic = "a topic the learner chooses — ask them what it is, in your first line"
		}
		return "You are the audience at a short presentation the learner is giving, about: " + topic + `.
Let them present a part at a time. React briefly the way a listener would, then ask one question — to clarify, to ask for an example, or to challenge a point politely — the kind they will meet after a real talk. Encourage them to signpost ("First…", "Moving on to…", "To sum up…").`
	default:
		var b strings.Builder
		fmt.Fprintf(&b, "This is the scene %q: %s\n", sc.Title, sc.Situation)
		fmt.Fprintf(&b, "You play %s. The learner plays %s.\n", sc.TutorRole, sc.OwnRole)
		if len(sc.Lines) > 0 {
			b.WriteString("The learner has practised this version of it; follow it loosely, and let the conversation go where they take it:\n")
			for _, line := range sc.Lines {
				b.WriteString("- " + line + "\n")
			}
		}
		if len(sc.Phrases) > 0 {
			fmt.Fprintf(&b, "Give them chances to use these phrases: %s.\n", strings.Join(sc.Phrases, " / "))
		}
		return b.String()
	}
}

const rolePlayer = `You are the role-play partner in Shadowline, an app where adults practise speaking English. The learner is Vietnamese, roughly A2 to B1.

%s
Stay in your part. Speak the way a real person in it would: short, natural turns of one to three sentences, everyday words, contractions. One question at a time. Never explain grammar inside your part.

Every learner turn also gets a correction, outside the part:
- "better": the learner's last message as a native speaker would naturally say it in this situation — fix grammar, word choice and tone, keep their meaning. Leave it "" when it was already natural, or when only punctuation or capitals differ.
- "why": when there is a "better", one short sentence in Vietnamese saying what changed and why. Otherwise "".

Answer with JSON only, no prose and no code fence:
{"better": "...", "why": "...", "reply": "your next line in the part"}
For the first turn, when the learner has said nothing yet, open the scene with "better" and "why" left "".`

const feedbackGiver = `You are an English speaking coach in Shadowline. The learner, a Vietnamese adult around A2 to B1, has just finished this role-play:

%s
Read the conversation and give them feedback. Answer with JSON only, no prose and no code fence:
{"summary": "...", "strengths": ["..."], "fixes": [{"said": "...", "better": "...", "why": "..."}], "phrases": [{"phrase": "...", "note": "..."}]}
- "summary": two or three sentences in Vietnamese on how it went.
- "strengths": two or three things they did well, in Vietnamese.
- "fixes": up to four of their sentences worth saying differently, quoted exactly in "said", with the natural version in English and "why" in Vietnamese.
- "phrases": three or four useful English phrases for this situation that they did not use or used awkwardly, each with a note in Vietnamese on when to say it.`

// RoleplayMessages is what the tutor is sent for its next turn: the part it
// plays, and the conversation so far (empty for the opening).
func RoleplayMessages(sc Scenario, history []Message) []Message {
	out := []Message{{Role: "system", Content: fmt.Sprintf(rolePlayer, sc.scene())}}
	if len(history) == 0 {
		return append(out, Message{Role: "user", Content: "(The scene starts. Open it.)"})
	}
	return append(out, history...)
}

// FeedbackMessages asks for feedback on a finished role-play.
func FeedbackMessages(sc Scenario, history []Message) []Message {
	var b strings.Builder
	for _, m := range history {
		who := "Learner"
		if m.Role == "assistant" {
			who = "Partner"
		}
		fmt.Fprintf(&b, "%s: %s\n", who, m.Content)
	}
	return []Message{
		{Role: "system", Content: fmt.Sprintf(feedbackGiver, sc.scene())},
		{Role: "user", Content: "The conversation:\n" + b.String()},
	}
}

// Turn is one turn of the tutor's: the learner's last line said better, and
// its own next line.
type Turn struct {
	Better string `json:"better"`
	Why    string `json:"why"`
	Reply  string `json:"reply"`
}

// ErrNoReply is a turn with nothing to say.
var ErrNoReply = errors.New("the tutor said nothing")

// ParseTurn reads the tutor's turn. A model that answers in plain words
// instead of the JSON asked for has still answered: the words are its reply,
// with no correction.
func ParseTurn(answer string) (Turn, error) {
	var t Turn
	if obj, ok := jsonObject(answer); ok && json.Unmarshal([]byte(obj), &t) == nil && strings.TrimSpace(t.Reply) != "" {
		t.Better, t.Why, t.Reply = strings.TrimSpace(t.Better), strings.TrimSpace(t.Why), strings.TrimSpace(t.Reply)
		if t.Better == "" {
			t.Why = ""
		}
		return t, nil
	}
	t = Turn{Reply: strings.TrimSpace(answer)}
	if t.Reply == "" {
		return t, ErrNoReply
	}
	return t, nil
}

// Feedback is the report on a finished role-play.
type Feedback struct {
	Summary   string        `json:"summary"`
	Strengths []string      `json:"strengths"`
	Fixes     []Fix         `json:"fixes"`
	Phrases   []DraftPhrase `json:"phrases"`
}

// Fix is one of the learner's sentences, said better.
type Fix struct {
	Said   string `json:"said"`
	Better string `json:"better"`
	Why    string `json:"why"`
}

// ErrBadFeedback is feedback that did not come back as asked.
var ErrBadFeedback = errors.New("the tutor's feedback was not a report")

// ParseFeedback reads the report, with every list there even when empty.
func ParseFeedback(answer string) (Feedback, error) {
	var f Feedback
	obj, ok := jsonObject(answer)
	if !ok {
		return f, ErrBadFeedback
	}
	if err := json.Unmarshal([]byte(obj), &f); err != nil {
		return f, fmt.Errorf("%w: %v", ErrBadFeedback, err)
	}
	if strings.TrimSpace(f.Summary) == "" {
		return f, ErrBadFeedback
	}
	if f.Strengths == nil {
		f.Strengths = []string{}
	}
	if f.Fixes == nil {
		f.Fixes = []Fix{}
	}
	if f.Phrases == nil {
		f.Phrases = []DraftPhrase{}
	}
	return f, nil
}

// jsonObject is the JSON object in an answer, even with words or a code fence
// around it.
func jsonObject(answer string) (string, bool) {
	start, end := strings.Index(answer, "{"), strings.LastIndex(answer, "}")
	if start < 0 || end <= start {
		return "", false
	}
	return answer[start : end+1], true
}
