package game

import (
	"math/rand"
	"strings"
	"testing"
)

var pool = []Entry{
	{"apple", "ˈæpəl", "A round fruit"},
	{"table", "ˈteɪbəl", "A piece of furniture with a flat top"},
	{"river", "ˈɹɪvɚ", "A large stream of water"},
	{"music", "ˈmjuzɪk", "Sounds made to be pleasant"},
	{"cloud", "ˈklaʊd", "A white mass in the sky"},
	{"green", "ˈɡɹin", "The colour of grass"},
}

func TestEveryKindOfQuestionHasOneRightAnswerAmongFour(t *testing.T) {
	r := rand.New(rand.NewSource(1))
	target := Entry{"bread", "ˈbɹɛd", "Food made from flour and baked"}
	for _, kind := range []string{GameMeaning, GameListen, GameIPA} {
		for i := 0; i < 50; i++ {
			q, ok := NewQuestion(kind, target, pool, r)
			if !ok {
				t.Fatalf("%s: no question", kind)
			}
			if len(q.Options) != 4 {
				t.Fatalf("%s: %d options", kind, len(q.Options))
			}
			seen, right := map[string]bool{}, 0
			for _, o := range q.Options {
				if seen[o] {
					t.Fatalf("%s: %q twice", kind, o)
				}
				seen[o] = true
				if q.Right(o) {
					right++
				}
			}
			if right != 1 {
				t.Fatalf("%s: %d right answers in %v", kind, right, q.Options)
			}
		}
	}
}

func TestTheListeningQuestionSaysTheWordAndTheOthersDoNotGiveItAway(t *testing.T) {
	r := rand.New(rand.NewSource(2))
	target := pool[0]
	q, _ := NewQuestion(GameListen, target, pool[1:], r)
	if q.Say != "apple" || q.Prompt != "" {
		t.Fatalf("listen: say %q, prompt %q", q.Say, q.Prompt)
	}
	q, _ = NewQuestion(GameMeaning, target, pool[1:], r)
	if q.Say != "" || q.Prompt != "apple" {
		t.Fatalf("meaning: say %q, prompt %q", q.Say, q.Prompt)
	}
	q, _ = NewQuestion(GameIPA, target, pool[1:], r)
	if q.Say != "" || q.Prompt != "ˈæpəl" {
		t.Fatalf("ipa: say %q, prompt %q", q.Say, q.Prompt)
	}
}

func TestScrambledLettersAreNeverTheWordAlready(t *testing.T) {
	r := rand.New(rand.NewSource(3))
	for i := 0; i < 200; i++ {
		q, ok := NewQuestion(GameScramble, Entry{"tea", "ˈti", "A hot drink"}, nil, r)
		if !ok {
			t.Fatal("no scramble for tea")
		}
		if strings.Join(q.Options, "") == "tea" {
			t.Fatal("the letters came back in order")
		}
		if !q.Right("TEA ") || q.Right("eat") {
			t.Fatal("the answer is the word, however it is typed")
		}
		if q.Prompt != "A hot drink" {
			t.Fatal("the definition is the hint")
		}
	}
	for _, w := range []string{"go", "ice-cream", "extraordinarily", "zzz"} {
		if _, ok := NewQuestion(GameScramble, Entry{Word: w}, nil, r); ok {
			t.Errorf("%q should not be scrambled", w)
		}
	}
}

func TestTooSmallAPoolMakesNoQuestion(t *testing.T) {
	r := rand.New(rand.NewSource(4))
	if _, ok := NewQuestion(GameMeaning, pool[0], pool[1:3], r); ok {
		t.Fatal("two wrong answers are not enough")
	}
	// Two words that sound the same cannot both be on an IPA question.
	homophones := []Entry{{"sea", "ˈsi", "a"}, {"see", "ˈsi", "b"}, {"cat", "ˈkæt", "c"}, {"dog", "ˈdɔɡ", "d"}}
	more := append(homophones, Entry{"sun", "ˈsʌn", "e"}, Entry{"hat", "ˈhæt", "f"})
	for _, kind := range []string{GameIPA, GameListen} {
		for i := 0; i < 30; i++ {
			q, ok := NewQuestion(kind, more[0], more[1:], r)
			if !ok {
				t.Fatalf("%s: no question from %d other words", kind, len(more)-1)
			}
			for _, o := range q.Options {
				if o == "see" {
					t.Fatalf("%s: sea and see on one question: %v", kind, q.Options)
				}
			}
		}
	}
}
