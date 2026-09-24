package tutor

import "strings"

const (
	thinkOpen  = "<think>"
	thinkClose = "</think>"
)

// thinkFilter drops <think>…</think> from an answer as it streams.
//
// Some routes put the model's reasoning, or an empty pair of the tags, at the
// start of the answer — 9router's Claude Code route sent `<think></think>` ahead
// of every reply when this was tried against it. A learner should see the
// answer, not the scaffolding. The tags can arrive split across pieces (`<thi`
// in one, `nk>` in the next), so the tail of each piece that could still be the
// start of a tag is held back until the next piece says what it was.
type thinkFilter struct {
	emit    func(string) error
	inside  bool
	pending string
	// started is whether anything has been emitted. Until then leading blank
	// space is dropped, so an answer that followed a removed block does not open
	// with an empty line.
	started bool
}

func (f *thinkFilter) write(piece string) error {
	buf := f.pending + piece
	f.pending = ""
	var out strings.Builder
	for buf != "" {
		if f.inside {
			i := strings.Index(buf, thinkClose)
			if i < 0 {
				f.pending = partialTag(buf, thinkClose)
				break
			}
			buf = buf[i+len(thinkClose):]
			f.inside = false
			continue
		}
		i := strings.Index(buf, thinkOpen)
		if i < 0 {
			keep := partialTag(buf, thinkOpen)
			out.WriteString(buf[:len(buf)-len(keep)])
			f.pending = keep
			break
		}
		out.WriteString(buf[:i])
		buf = buf[i+len(thinkOpen):]
		f.inside = true
	}
	return f.send(out.String())
}

// flush hands over whatever was being held back once the answer is complete: a
// piece that looked like the start of a tag and turned out not to be one.
func (f *thinkFilter) flush() error {
	if f.inside || f.pending == "" {
		return nil
	}
	text := f.pending
	f.pending = ""
	return f.send(text)
}

func (f *thinkFilter) send(text string) error {
	if !f.started {
		text = strings.TrimLeft(text, " \t\r\n")
	}
	if text == "" {
		return nil
	}
	f.started = true
	return f.emit(text)
}

// partialTag is the longest end of s that could be the start of tag.
func partialTag(s, tag string) string {
	for n := min(len(s), len(tag)-1); n > 0; n-- {
		if strings.HasSuffix(s, tag[:n]) {
			return s[len(s)-n:]
		}
	}
	return ""
}
