// Command vapid prints a new VAPID key pair for study reminders, as the lines
// to put in server/.env. Run it once, on the server: the private key belongs
// in that file and nowhere else — not the repository, not a chat.
//
// A new pair makes every browser's subscription useless, so learners would
// have to turn reminders on again: generate one once and keep it.
package main

import (
	"fmt"
	"os"

	"github.com/SherClockHolmes/webpush-go"
)

func main() {
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot make a key pair:", err)
		os.Exit(1)
	}
	fmt.Println("VAPID_PUBLIC_KEY=" + public)
	fmt.Println("VAPID_PRIVATE_KEY=" + private)
	fmt.Println("VAPID_SUBJECT=mailto:you@example.com")
}
