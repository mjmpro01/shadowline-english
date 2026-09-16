// Command seed publishes a small starter library so a fresh install is not an
// empty screen, and so the browser tests have something to practise against.
//
// The clips carry lines and IPA but no source audio: there is no recording to
// ship, and the app is built for that case — a take against such a clip is kept
// and its contour drawn, but no score is invented for it. Upload audio from the
// studio to make them scoreable.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/shadowline/server/internal/db"
	"github.com/shadowline/server/internal/store"
)

var clips = []store.NewClip{
	{
		Title:           "Actually, I think it's brilliant",
		Source:          "Starter samples",
		Playlist:        "Starter samples",
		Categories:      []string{"interview", "chat show"},
		TimestampLabel:  "0:00–0:03",
		DurationSeconds: 3.2,
		Summary:         "A short opinion, with the rise landing on the adjective.",
		Captions: []store.CaptionLine{
			{Text: "Actually, I think it's brilliant.", IPA: "/ˈæktʃuəli aɪ θɪŋk ɪts ˈbrɪljənt/"},
		},
	},
	{
		Title:           "It's not about winning",
		Source:          "Starter samples",
		Playlist:        "Starter samples",
		Categories:      []string{"speech", "daily"},
		TimestampLabel:  "0:00–0:04",
		DurationSeconds: 4.1,
		Summary:         "Two balanced halves — the contrast is carried by stress, not volume.",
		Captions: []store.CaptionLine{
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
		Captions: []store.CaptionLine{
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
		Captions: []store.CaptionLine{
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
		Captions: []store.CaptionLine{
			{Text: "It took a while, but it was worth it.", IPA: "/ɪt tʊk ə waɪl bʌt ɪt wəz wɜːθ ɪt/"},
		},
	},
}

func main() {
	feature := flag.Int("feature", 2, "how many of the seeded clips to feature on the dashboard")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.Open(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatal(err)
	}
	st := store.New(pool)

	existing, err := st.ListClips(ctx)
	if err != nil {
		log.Fatal(err)
	}
	// Running this twice should not double the library.
	if len(existing) > 0 {
		fmt.Printf("library already holds %d clips — nothing to seed\n", len(existing))
		return
	}

	for i, clip := range clips {
		clip.Featured = i < *feature
		created, err := st.CreateClip(ctx, clip, uuid.Nil)
		if err != nil {
			log.Fatalf("create %q: %v", clip.Title, err)
		}
		fmt.Printf("published %s  %s\n", created.ID, created.Title)
	}
	fmt.Printf("\n%d clips published, %d featured. They have no source audio yet —\n", len(clips), *feature)
	fmt.Println("upload a recording in the clip studio to make takes against them scoreable.")
}
