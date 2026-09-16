package store

// StarterClips is the small library a fresh install begins with, so the first
// screen a learner sees is not empty. Published by cmd/seed, and again by the
// test-only reset route.
//
// They carry lines and IPA but no source audio: there is no recording to ship
// with the code, and the app is built for that case — a take against such a
// clip is kept and its contour drawn, but no score is invented for it.
func StarterClips() []NewClip {
	return []NewClip{
		{
			Title:           "Actually, I think it's brilliant",
			Source:          "Starter samples",
			Playlist:        "Starter samples",
			Categories:      []string{"interview", "chat show"},
			Featured:        true,
			TimestampLabel:  "0:00–0:03",
			DurationSeconds: 3.2,
			Summary:         "A short opinion, with the rise landing on the adjective.",
			Captions: []CaptionLine{
				{Text: "Actually, I think it's brilliant.", IPA: "/ˈæktʃuəli aɪ θɪŋk ɪts ˈbrɪljənt/"},
			},
		},
		{
			Title:           "It's not about winning",
			Source:          "Starter samples",
			Playlist:        "Starter samples",
			Categories:      []string{"speech", "daily"},
			Featured:        true,
			TimestampLabel:  "0:00–0:04",
			DurationSeconds: 4.1,
			Summary:         "Two balanced halves — the contrast is carried by stress, not volume.",
			Captions: []CaptionLine{
				{Text: "It's not about winning, it's about showing up.", IPA: "/ɪts nɒt əˈbaʊt ˈwɪnɪŋ ɪts əˈbaʊt ˈʃəʊɪŋ ʌp/"},
			},
		},
		{
			Title:           "That's a really good question",
			Source:          "Starter samples",
			Playlist:        "Starter samples",
			Categories:      []string{"interview", "daily"},
			TimestampLabel:  "0:00–0:03",
			DurationSeconds: 2.8,
			Summary:         "Falling intonation on a statement that sounds like praise.",
			Captions: []CaptionLine{
				{Text: "That's a really good question, honestly.", IPA: "/ðæts ə ˈrɪəli ɡʊd ˈkwestʃən ˈɒnɪstli/"},
			},
		},
		{
			Title:           "One step at a time",
			Source:          "Starter samples",
			Playlist:        "Everyday phrases",
			Categories:      []string{"daily"},
			TimestampLabel:  "0:00–0:03",
			DurationSeconds: 2.6,
			Summary:         "Even rhythm across five short words — easy to rush.",
			Captions: []CaptionLine{
				{Text: "Let's just take it one step at a time.", IPA: "/lets dʒʌst teɪk ɪt wʌn step ət ə taɪm/"},
			},
		},
		{
			Title:           "It was worth it",
			Source:          "Starter samples",
			Playlist:        "Everyday phrases",
			Categories:      []string{"daily"},
			TimestampLabel:  "0:00–0:03",
			DurationSeconds: 3.0,
			Summary:         "A reversal mid-sentence: the pitch resets after \"but\".",
			Captions: []CaptionLine{
				{Text: "It took a while, but it was worth it.", IPA: "/ɪt tʊk ə waɪl bʌt ɪt wəz wɜːθ ɪt/"},
			},
		},
	}
}
