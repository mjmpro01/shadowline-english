package autocut

import (
	"strings"
	"testing"

	"github.com/shadowline/server/internal/store"
)

// said lays words out one after another, each 0.3 s long with 0.1 s between,
// starting at `at`; a word ending in "|" is followed by a long pause instead.
func said(at float64, text string) []store.Word {
	var out []store.Word
	for _, f := range strings.Fields(text) {
		pause := strings.HasSuffix(f, "|")
		f = strings.TrimSuffix(f, "|")
		out = append(out, store.Word{Start: at, End: at + 0.3, Text: f, IPA: "x"})
		at += 0.4
		if pause {
			at += 1.0
		}
	}
	return out
}

func TestALineEndsWithItsSentence(t *testing.T) {
	words := said(1, "Hello there, how are you today? I am fine, thanks for asking.")
	got := Lines(words, 0)
	if len(got) != 2 || got[0].Text != "Hello there, how are you today?" || got[1].Text != "I am fine, thanks for asking." {
		t.Fatalf("got %+v", got)
	}
	if got[0].IPA != "/x x x x x x/" {
		t.Fatalf("ipa %q", got[0].IPA)
	}
}

func TestALongPauseEndsALine(t *testing.T) {
	got := Lines(said(0, "so we went to the market| and then we bought some bread"), 0)
	if len(got) != 2 || got[0].Text != "so we went to the market" {
		t.Fatalf("got %+v", got)
	}
}

func TestLinesDoNotOverlapAndKeepABreath(t *testing.T) {
	got := Lines(said(0.05, "One sentence here. Another one right after it."), 4)
	if len(got) != 2 {
		t.Fatalf("got %+v", got)
	}
	if got[0].Start != 0 {
		t.Fatalf("the lead goes below zero: %+v", got[0])
	}
	if got[0].End > got[1].Start {
		t.Fatalf("lines overlap: %+v", got)
	}
	words := said(0.05, "One sentence here. Another one right after it.")
	if last := words[len(words)-1]; got[1].End < last.End || got[1].End > 4 {
		t.Fatalf("the tail: %+v (last word ends %.2f)", got[1], last.End)
	}
}

func TestATooShortLineJoinsItsNeighbour(t *testing.T) {
	got := Lines(said(0, "Yes. I think that is exactly right for us."), 0)
	if len(got) != 1 || !strings.HasPrefix(got[0].Text, "Yes. I think") {
		t.Fatalf("got %+v", got)
	}
}

func TestALongRunIsCutToFit(t *testing.T) {
	// A hundred words without a stop or a pause: forty seconds.
	got := Lines(said(0, strings.Repeat("word ", 100)), 0)
	if len(got) < 2 {
		t.Fatalf("one line of %.1f s", got[0].Duration())
	}
	words := 0
	for _, l := range got {
		if l.Duration() > MaxSeconds+Lead+Tail {
			t.Fatalf("a line of %.1f s", l.Duration())
		}
		words += len(strings.Fields(l.Text))
	}
	if words != 100 {
		t.Fatalf("%d words kept of 100", words)
	}
}

func TestNothingSaidIsNoLines(t *testing.T) {
	if got := Lines([]store.Word{{Start: 1, End: 1, Text: "x"}, {Start: 2, End: 3, Text: " "}}, 0); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}
