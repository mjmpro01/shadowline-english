package store

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func line(start, end float64, text string, audio bool) Clip {
	return Clip{ID: uuid.New(), StartSeconds: start, EndSeconds: end, DurationSeconds: end - start,
		Captions: []CaptionLine{{Text: text}}, HasAudio: audio}
}

func TestAPassageRunsHalfAMinuteToAMinuteAndAHalf(t *testing.T) {
	var clips []Clip
	for i := 0; i < 12; i++ {
		clips = append(clips, line(float64(i*8), float64(i*8+8), "a line", true))
	}
	got := PassageFrom(clips, clips[2].ID)
	if len(got) != 4 || got[0].ID != clips[2].ID {
		t.Fatalf("from the third line: %d lines, want 4 (32 s)", len(got))
	}

	// Lines long enough that the next would run past ninety seconds stop it.
	long := []Clip{line(0, 25, "a", true), line(25, 50, "b", true), line(50, 85, "c", true), line(85, 115, "d", true)}
	if got := PassageFrom(long, long[0].ID); len(got) != 2 {
		t.Fatalf("25 + 25 s is past half a minute: want 2 lines, got %d", len(got))
	}

	// A line without its sound is passed over; a short episode is taken whole.
	short := []Clip{line(0, 4, "a", true), line(4, 8, "b", false), line(8, 12, "c", true)}
	got = PassageFrom(short, short[0].ID)
	if len(got) != 2 || got[1].ID != short[2].ID {
		t.Fatalf("a short episode with a silent line: %+v", got)
	}
	if PassageFrom(short, uuid.New()) != nil {
		t.Fatal("a passage from a line that is not in the episode")
	}
}

// words lays out n words a third of a second apart from t, the last of a
// phrase ending in a full stop when stop is set.
func words(t float64, texts ...string) []Word {
	out := make([]Word, len(texts))
	for i, w := range texts {
		out[i] = Word{Start: t + float64(i)*0.4, End: t + float64(i)*0.4 + 0.3, Text: " " + w}
	}
	return out
}

func TestALineIsCutIntoPhrasesOfThreeToSevenSeconds(t *testing.T) {
	text := "I wake up early every morning, and I make a cup of tea before I go to work in the city by train."
	c := line(100, 110, text, true)
	fields := strings.Fields(text)
	ws := words(100.2, fields...)

	chunks := ChunksOf(c, ws)
	if len(chunks) < 2 {
		t.Fatalf("a ten-second line in %d pieces", len(chunks))
	}
	var joined []string
	for i, ch := range chunks {
		joined = append(joined, ch.Text)
		length := ch.End - ch.Start
		if i < len(chunks)-1 && (length < ChunkAtPunctuation || length > ChunkMax+0.5) {
			t.Errorf("piece %d is %.1f s: %q", i, length, ch.Text)
		}
		if i > 0 && ch.Start < chunks[i-1].Start {
			t.Errorf("piece %d starts before the one before it", i)
		}
	}
	// The pieces hold their words whole, with a little room either side: the
	// words run from 0.2 s into the line, as the line's own audio counts.
	first, last := ws[0].Start-c.StartSeconds, ws[len(ws)-1].End-c.StartSeconds
	if chunks[0].Start >= first || chunks[len(chunks)-1].End <= last || chunks[len(chunks)-1].End > c.DurationSeconds {
		t.Fatalf("the pieces cut into their words (%.2f–%.2f): %+v", first, last, chunks)
	}
	// The words are the line's own, written by a person, with their commas.
	if strings.Join(joined, " ") != text {
		t.Fatalf("the pieces say %q", strings.Join(joined, " "))
	}
	// A comma is where a phrase ends.
	if !strings.HasSuffix(chunks[0].Text, "morning,") {
		t.Fatalf("the first piece ends at %q", chunks[0].Text)
	}
}

func TestWhatWasHeardIsUsedWhenTheLineSaysSomethingElse(t *testing.T) {
	c := line(0, 4, "Hello there everyone", true)
	got := ChunksOf(c, words(0.1, "hello", "there", "every", "one"))
	if len(got) != 1 || got[0].Text != "hello there every one" {
		t.Fatalf("four words heard, three written: %+v", got)
	}
}

func TestALineWithNoTranscriptIsOnePiece(t *testing.T) {
	c := line(0, 9, "No words were heard here.", true)
	got := ChunksOf(c, nil)
	if len(got) != 1 || got[0].Start != 0 || got[0].End != 9 || got[0].Text != "No words were heard here." {
		t.Fatalf("without a transcript: %+v", got)
	}
	// Words from another part of the recording are not this line's.
	if got := ChunksOf(c, words(50, "far", "away")); len(got) != 1 || got[0].Text != c.Captions[0].Text {
		t.Fatalf("words from elsewhere: %+v", got)
	}
}
