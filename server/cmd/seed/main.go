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

	clips := store.StarterClips()
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
