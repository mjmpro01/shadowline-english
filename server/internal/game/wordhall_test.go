package game

import (
	"strings"
	"testing"
)

func TestTheWordHallStepsAreWhereTheStoryNeedsThem(t *testing.T) {
	for step, id := range map[int]string{HallStep: "silent_hall", GlassesStep: "ipa_glasses",
		LibraryStep: "first_donation", LetterStep: "first_letter"} {
		if step >= len(MainQuests) || MainQuests[step].ID != id {
			t.Errorf("step %d should be %s", step, id)
		}
	}
	if got := MainQuests[GlassesStep].Reward.Items["ipa_glasses"]; got != 1 {
		t.Fatalf("Sage Orin gives %d glasses", got)
	}
	if it, ok := ItemByID("ipa_glasses"); !ok || it.Kind != "tool" || it.UnlockStep != Never {
		t.Fatalf("the glasses are not a tool kept out of the shop: %+v", it)
	}
}

// A letter has to say, in words, what it asks for: reading it is the only way
// to know.
func TestEveryLetterSaysWhatItWants(t *testing.T) {
	numbers := map[int][]string{1: {" a ", " an ", "one"}, 2: {"two"}, 3: {"three"}}
	for _, p := range Townsfolk {
		letters := Letters[p.ID]
		if len(letters) < 3 {
			t.Errorf("%s writes only %d letters", p.ID, len(letters))
		}
		for i, l := range letters {
			it, ok := ItemByID(l.Item)
			if !ok || it.Price == 0 || it.UnlockStep > LetterStep {
				t.Errorf("%s letter %d asks for %s, which cannot be bought by then", p.ID, i, l.Item)
			}
			if l.Qty < 1 || l.Qty > 3 || l.Gold <= 0 {
				t.Errorf("%s letter %d: %d of them for %d gold", p.ID, i, l.Qty, l.Gold)
			}
			var body string
			for _, line := range l.Body {
				if line.En == "" || line.Vi == "" {
					t.Errorf("%s letter %d has a line with something missing", p.ID, i)
				}
				body += " " + strings.ToLower(line.En) + " "
			}
			said := false
			for _, n := range numbers[l.Qty] {
				said = said || strings.Contains(body, n)
			}
			if !said {
				t.Errorf("%s letter %d does not say how many: %q", p.ID, i, body)
			}
		}
	}
}

func TestTheDaysLetterIsTheSameAllDay(t *testing.T) {
	from, letter := LetterFor("user-1", "2026-10-21")
	again, same := LetterFor("user-1", "2026-10-21")
	if from.ID != again.ID || letter.Body[1] != same.Body[1] {
		t.Fatal("the day's letter changed when asked again")
	}
	writers := map[string]bool{}
	for d := 1; d <= 28; d++ {
		p, _ := LetterFor("user-1", "2026-10-"+string(rune('0'+d/10))+string(rune('0'+d%10)))
		writers[p.ID] = true
	}
	if len(writers) < 3 {
		t.Fatalf("four weeks of letters came from only %d people", len(writers))
	}
}

func TestTheLibrarysMilestonesClimb(t *testing.T) {
	last := 0
	for _, m := range LibraryMilestones {
		if m.Words <= last {
			t.Fatalf("milestone %d does not follow %d", m.Words, last)
		}
		last = m.Words
		for item := range m.Reward.Items {
			if _, ok := ItemByID(item); !ok {
				t.Errorf("milestone %d gives %s, which is not an item", m.Words, item)
			}
		}
		if got, ok := MilestoneByWords(m.Words); !ok || got.Words != m.Words {
			t.Errorf("milestone %d cannot be found", m.Words)
		}
	}
	if _, ok := MilestoneByWords(4); ok {
		t.Fatal("found a milestone that is not one")
	}
}
