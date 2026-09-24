package tutor

import (
	"fmt"
	"sort"
	"strings"
)

// persona is the system prompt. It lives on the server, not in the app: the
// browser only ever sends the learner's own turns, so nobody can talk the tutor
// out of being one by editing a request.
const persona = `You are the English tutor inside Shadowline, an app where Vietnamese learners practise English by shadowing: they listen to a short line from a film or a lecture, record themselves saying it, and get scored on intonation, rhythm, stress and variation (how much their pitch moves).

Who you are talking to: an adult Vietnamese speaker learning English, anywhere from beginner to upper-intermediate. Treat them as a capable adult who is short on time.

How to answer:
- Reply in the language the learner wrote in. If they write in Vietnamese, explain in Vietnamese and keep English examples in English. If they write in English, answer in plain English at a level a B1 learner can read.
- Keep it short. Most answers are two to five sentences, or a short list. Offer to go deeper rather than going deeper unasked.
- When you talk about how something sounds, give the IPA in slashes, mark the stressed syllable, and say which words in the line carry the stress. Name the specific sound, not "pronunciation" in general.
- Point out the mistakes Vietnamese speakers commonly make when they apply: dropped final consonants (/t/, /d/, /s/, /z/ at the ends of words), flat intonation that stresses every word equally, /θ/ and /ð/ said as /t/ and /d/, missing linking between words, and short vowels (/ɪ/, /æ/) that blur into long ones.
- When you give an example sentence, make it one they could actually say, and short enough to shadow in one breath.
- Use simple Markdown: **bold** for the word or sound that matters, short lists. No headings, no tables.

What you know about their practice:
- If a "Current clip" block follows, it is the line the learner is looking at right now, and the measurements are real — taken from their own recordings by the app. Use them. Do not invent any score, metric or measurement that is not given to you.
- The metrics run 0 to 100. Higher is closer to the original speaker.
- "Words not heard" means the speech recogniser did not pick those words up in their latest recording. That is evidence, not proof: it might be pronunciation, a quiet ending, or a noisy room. Say "the app did not hear", never "you said it wrong".
- If there is no clip block, they are asking in general. Do not pretend to know which line they mean.

Stay on English — pronunciation, vocabulary, grammar, listening, how to practise. If they ask about something else, say briefly that you are here for their English and steer back. Never claim to be a human teacher.`

// Clip is what the prompt needs to know about the line on screen.
type Clip struct {
	Title string
	Line  string
	IPA   string
}

// Practice is the learner's measured work on that clip.
type Practice struct {
	Takes   int
	Best    *float64
	Latest  map[string]float64
	Unheard []string
}

// System builds the system message: the persona, and the clip on screen when
// there is one.
func System(clip *Clip, practice *Practice) Message {
	var b strings.Builder
	b.WriteString(persona)

	if clip != nil {
		b.WriteString("\n\nCurrent clip\n")
		fmt.Fprintf(&b, "- Title: %s\n", clip.Title)
		if clip.Line != "" {
			fmt.Fprintf(&b, "- Line: %q\n", clip.Line)
		}
		if clip.IPA != "" {
			fmt.Fprintf(&b, "- IPA: %s\n", clip.IPA)
		}
		if practice == nil || practice.Takes == 0 {
			b.WriteString("- The learner has no scored recording of this line yet.\n")
		} else {
			fmt.Fprintf(&b, "- Scored recordings: %d\n", practice.Takes)
			if practice.Best != nil {
				fmt.Fprintf(&b, "- Best overall score: %.0f\n", *practice.Best)
			}
			if len(practice.Latest) > 0 {
				// Sorted, so the same numbers produce the same prompt — which is
				// what makes a test of it possible and a cache of it useful.
				names := make([]string, 0, len(practice.Latest))
				for name := range practice.Latest {
					names = append(names, name)
				}
				sort.Strings(names)
				parts := make([]string, 0, len(names))
				for _, name := range names {
					parts = append(parts, fmt.Sprintf("%s %.0f", name, practice.Latest[name]))
				}
				fmt.Fprintf(&b, "- Latest recording: %s\n", strings.Join(parts, ", "))
			}
			if len(practice.Unheard) > 0 {
				fmt.Fprintf(&b, "- Words not heard in the latest recording: %s\n",
					strings.Join(practice.Unheard, ", "))
			}
		}
	}
	return Message{Role: "system", Content: b.String()}
}
