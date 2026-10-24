package store

import (
	"strings"
	"testing"
)

// The starters are what every install opens with, so each must save and be
// worth learning from: a short exchange both ways, meant in Vietnamese, with a
// few phrases to copy down.
func TestTheStarterDialoguesHold(t *testing.T) {
	starters := StarterDialogues()
	if len(starters) != 10 {
		t.Fatalf("%d starter dialogues, want 10", len(starters))
	}
	slugs := map[string]bool{}
	for _, d := range starters {
		if err := d.Clean(); err != nil {
			t.Errorf("%q: %v", d.Title, err)
			continue
		}
		if slug := slugOf(d.Title); slugs[slug] {
			t.Errorf("%q: a second dialogue called %s", d.Title, slug)
		} else {
			slugs[slug] = true
		}
		if n := len(d.Lines); n < 6 || n > 10 {
			t.Errorf("%q: %d lines, want 6 to 10", d.Title, n)
		}
		if n := len(d.Phrases); n < 3 || n > 5 {
			t.Errorf("%q: %d phrases, want 3 to 5", d.Title, n)
		}
		if d.Situation == "" || d.Topic == "" {
			t.Errorf("%q: no situation or topic", d.Title)
		}
		for i, l := range d.Lines {
			if l.Vi == "" || l.Name == "" {
				t.Errorf("%q line %d: no Vietnamese or no name", d.Title, i+1)
			}
		}
		for _, p := range d.Phrases {
			if p.Note == "" {
				t.Errorf("%q: %q has no note", d.Title, p.Phrase)
			}
			// A phrase to copy down is one the dialogue says, "…" standing for
			// the part a learner fills in.
			said := false
			for _, l := range d.Lines {
				line, all := strings.ToLower(l.Text), true
				for _, part := range strings.Split(strings.ToLower(p.Phrase), "…") {
					if part = strings.Trim(part, " ,.?!"); part != "" && !strings.Contains(line, part) {
						all = false
					}
				}
				said = said || all
			}
			if !said {
				t.Errorf("%q: %q is not in any line", d.Title, p.Phrase)
			}
		}
	}
}

func TestADialogueIsBetweenTwoPeople(t *testing.T) {
	two := []DialogueLine{{Speaker: "a", Text: "Hi."}, {Speaker: "B", Text: "Hello."}}
	for _, c := range []struct {
		name string
		in   DialogueInput
		ok   bool
	}{
		{"fine", DialogueInput{Title: "Hi", Lines: two}, true},
		{"no title", DialogueInput{Lines: two}, false},
		{"one line", DialogueInput{Title: "Hi", Lines: two[:1]}, false},
		{"one speaker", DialogueInput{Title: "Hi", Lines: []DialogueLine{{Speaker: "A", Text: "Hi."}, {Speaker: "A", Text: "Me again."}}}, false},
		{"a third", DialogueInput{Title: "Hi", Lines: append([]DialogueLine{{Speaker: "C", Text: "Hey."}}, two...)}, false},
		{"empty line", DialogueInput{Title: "Hi", Lines: append([]DialogueLine{{Speaker: "A", Text: "  "}}, two...)}, false},
		{"bad level", DialogueInput{Title: "Hi", Level: "C2", Lines: two}, false},
	} {
		in := c.in
		in.Lines = append([]DialogueLine(nil), c.in.Lines...)
		err := in.Clean()
		if (err == nil) != c.ok {
			t.Errorf("%s: got %v", c.name, err)
		}
		if c.ok && (in.Level != "A2" || in.Lines[0].Speaker != "A" || in.Phrases == nil) {
			t.Errorf("%s: not cleaned: %+v", c.name, in)
		}
	}
}
