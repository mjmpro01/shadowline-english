// Package autocut proposes clips from a transcript: a line each, the way an
// admin would cut a recording in the studio, for recordings nobody cuts by
// hand.
//
// The studio proposes from the sound — the pauses in the waveform — because it
// has the audio decoded in the browser. Here there is only the transcript, so
// a line ends where a sentence does, or where the speaker stops for long
// enough, and never runs past what a learner can shadow in one go.
package autocut

import (
	"sort"
	"strings"

	"github.com/shadowline/server/internal/store"
)

const (
	// MaxSeconds is the longest line proposed: the studio's LINE_SECONDS.
	MaxSeconds = 30.0
	// MinSeconds is the shortest line kept on its own; shorter ones join a
	// neighbour, as a "Yes." heard alone is hardly a line to practise.
	MinSeconds = 1.0
	// Pause is the silence that ends a line even without a full stop.
	Pause = 0.7
	// Lead and Tail are the breath kept before the first word and after the
	// last, so a clip does not start or end mid-sound.
	Lead = 0.15
	Tail = 0.25
)

// Line is one proposed clip: where it runs in the recording, and what is said
// in it.
type Line struct {
	Start float64
	End   float64
	Text  string
	IPA   string
}

// Duration is how long the line runs.
func (l Line) Duration() float64 { return l.End - l.Start }

// Lines cuts a transcript into lines. duration is the recording's length, to
// keep the last line's tail inside it; 0 when it is not known.
func Lines(words []store.Word, duration float64) []Line {
	said := make([]store.Word, 0, len(words))
	for _, w := range words {
		w.Text = strings.TrimSpace(w.Text)
		if w.Text != "" && w.End > w.Start {
			said = append(said, w)
		}
	}
	sort.SliceStable(said, func(i, j int) bool { return said[i].Start < said[j].Start })
	if len(said) == 0 {
		return nil
	}

	var runs [][]store.Word
	from := 0
	for i := range said {
		last := i == len(said)-1
		long := said[i].End - said[from].Start
		gap := !last && said[i+1].Start-said[i].End > Pause
		if last || gap || (endsSentence(said[i].Text) && long >= MinSeconds) {
			runs = append(runs, splitLong(said[from:i+1])...)
			from = i + 1
		}
	}
	runs = mergeShort(runs)

	out := make([]Line, len(runs))
	for i, run := range runs {
		first, last := run[0], run[len(run)-1]
		end := last.End + Tail
		if i+1 < len(runs) && end > runs[i+1][0].Start {
			end = runs[i+1][0].Start
		}
		if duration > 0 && end > duration {
			end = duration
		}
		start := first.Start - Lead
		if i > 0 && start < out[i-1].End {
			start = out[i-1].End
		}
		if start < 0 {
			start = 0
		}
		out[i] = Line{Start: round(start), End: round(end), Text: lineOf(run), IPA: ipaOf(run)}
	}
	return out
}

// splitLong cuts a run over MaxSeconds at its longest silence in the middle
// half, again and again until every piece fits. A single word longer than
// that stays whole.
func splitLong(run []store.Word) [][]store.Word {
	if len(run) < 2 || run[len(run)-1].End-run[0].Start <= MaxSeconds {
		return [][]store.Word{run}
	}
	begin, finish := run[0].Start, run[len(run)-1].End
	quarter := (finish - begin) / 4
	best, widest := -1, -1.0
	for i := 0; i+1 < len(run); i++ {
		at := run[i].End
		if at < begin+quarter || at > finish-quarter {
			continue
		}
		gap := run[i+1].Start - run[i].End
		// A sentence ending is worth a little more than its silence.
		if endsSentence(run[i].Text) {
			gap += 0.2
		}
		if gap > widest {
			best, widest = i, gap
		}
	}
	if best < 0 {
		best = len(run)/2 - 1
	}
	return append(splitLong(run[:best+1]), splitLong(run[best+1:])...)
}

// mergeShort joins each run under MinSeconds to the run before it, or after
// it when it is first, as long as the two together still fit.
func mergeShort(runs [][]store.Word) [][]store.Word {
	length := func(run []store.Word) float64 { return run[len(run)-1].End - run[0].Start }
	var out [][]store.Word
	for _, run := range runs {
		if n := len(out); n > 0 && (length(run) < MinSeconds || length(out[n-1]) < MinSeconds) &&
			run[len(run)-1].End-out[n-1][0].Start <= MaxSeconds {
			out[n-1] = append(append([]store.Word{}, out[n-1]...), run...)
			continue
		}
		out = append(out, run)
	}
	return out
}

// endsSentence is whether a word closes a sentence: Whisper puts the stop on
// the word it follows, sometimes inside a closing quote.
func endsSentence(text string) bool {
	t := strings.TrimRight(text, `"'”’)`)
	return strings.HasSuffix(t, ".") || strings.HasSuffix(t, "?") || strings.HasSuffix(t, "!") || strings.HasSuffix(t, "…")
}

// lineOf is the words as a line to read: the studio's rule
// (app-admin/src/lib/transcript.ts), as Whisper attaches punctuation to the
// word it follows.
func lineOf(words []store.Word) string {
	parts := make([]string, len(words))
	for i, w := range words {
		parts[i] = w.Text
	}
	return strings.TrimSpace(strings.Join(parts, " "))
}

// ipaOf is the line's pronunciation in one pair of slashes; a word without
// one contributes nothing.
func ipaOf(words []store.Word) string {
	var spoken []string
	for _, w := range words {
		if w.IPA != "" {
			spoken = append(spoken, w.IPA)
		}
	}
	if len(spoken) == 0 {
		return ""
	}
	return "/" + strings.Join(spoken, " ") + "/"
}

func round(s float64) float64 {
	return float64(int64(s*1000+0.5)) / 1000
}
