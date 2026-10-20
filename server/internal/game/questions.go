package game

import (
	"math/rand"
	"strings"
	"unicode"
)

// Entry is a word with what the dictionary says about it.
type Entry struct {
	Word    string `json:"word"`
	IPA     string `json:"ipa"`
	Meaning string `json:"meaning"`
}

// Question is one turn of a fight. Answer stays on the server: the browser is
// sent the rest.
type Question struct {
	Kind string `json:"kind"`
	// Prompt is what the player is asked about: the word (meaning), the IPA
	// (ipa), or the definition as a hint (scramble). Empty for listen.
	Prompt string `json:"prompt"`
	// Say is the word to speak aloud, for listen. The browser has to know it
	// to say it.
	Say string `json:"say,omitempty"`
	// Options to choose from; for scramble, the word's letters, shuffled.
	Options []string `json:"options"`
	// Word is the word the question is about, and Answer what counts as right.
	Word   string `json:"-"`
	Answer string `json:"-"`
}

// Scrambles reports whether a word can be put back from its letters: plain
// letters, short enough to rearrange in the time.
func Scrambles(word string) bool {
	n := 0
	for _, r := range word {
		if !unicode.IsLetter(r) {
			return false
		}
		n++
	}
	return n >= 3 && n <= 9
}

// NewQuestion makes a question of a kind about target, with wrong answers from
// pool. ok is false when the pool cannot make that kind (too few distinct
// entries, or a word that does not scramble), so the caller can try another.
func NewQuestion(kind string, target Entry, pool []Entry, r *rand.Rand) (q Question, ok bool) {
	q = Question{Kind: kind, Word: target.Word}
	switch kind {
	case GameScramble:
		if !Scrambles(target.Word) {
			return q, false
		}
		letters := []rune(strings.ToLower(target.Word))
		shuffled := append([]rune{}, letters...)
		for i := 0; i < 20; i++ {
			r.Shuffle(len(shuffled), func(a, b int) { shuffled[a], shuffled[b] = shuffled[b], shuffled[a] })
			if string(shuffled) != string(letters) {
				break
			}
		}
		if string(shuffled) == string(letters) {
			return q, false // every letter the same: nothing to unscramble
		}
		q.Prompt = target.Meaning
		for _, l := range shuffled {
			q.Options = append(q.Options, string(l))
		}
		q.Answer = strings.ToLower(target.Word)
		return q, true
	case GameMeaning:
		q.Prompt = target.Word
		q.Answer = target.Meaning
		q.Options = options(target, pool, r, func(e Entry) string { return e.Meaning })
	case GameListen:
		q.Say = target.Word
		q.Answer = target.Word
		q.Options = options(target, soundsDifferent(target, pool), r, func(e Entry) string { return e.Word })
	case GameIPA:
		if target.IPA == "" {
			return q, false
		}
		q.Prompt = target.IPA
		q.Answer = target.Word
		q.Options = options(target, soundsDifferent(target, pool), r, func(e Entry) string { return e.Word })
	default:
		return q, false
	}
	return q, q.Options != nil
}

// options is the right answer and three wrong ones, shuffled, all different;
// nil when the pool has too few.
func options(target Entry, pool []Entry, r *rand.Rand, field func(Entry) string) []string {
	right := field(target)
	seen := map[string]bool{norm(right): true}
	out := []string{right}
	order := r.Perm(len(pool))
	for _, i := range order {
		v := field(pool[i])
		if v == "" || seen[norm(v)] || norm(pool[i].Word) == norm(target.Word) {
			continue
		}
		seen[norm(v)] = true
		out = append(out, v)
		if len(out) == 4 {
			break
		}
	}
	if len(out) < 4 {
		return nil
	}
	r.Shuffle(len(out), func(a, b int) { out[a], out[b] = out[b], out[a] })
	return out
}

// soundsDifferent is the pool without words pronounced like the target: on a
// listening or an IPA question, "see" beside "sea" would make two answers
// right.
func soundsDifferent(target Entry, pool []Entry) []Entry {
	out := make([]Entry, 0, len(pool))
	for _, e := range pool {
		if norm(e.IPA) != norm(target.IPA) {
			out = append(out, e)
		}
	}
	return out
}

// Right reports whether an answer is the right one.
func (q Question) Right(answer string) bool {
	return answer != "" && norm(answer) == norm(q.Answer)
}

func norm(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
