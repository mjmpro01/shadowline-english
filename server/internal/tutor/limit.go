package tutor

import "time"

// Limit is how many questions one learner can put to the tutor in a window.
//
// Every question costs money at the other end, and the chat is the first place
// on the server where one person holding Enter could run up a bill. The count
// is kept in Postgres (store.AskTutor), so every API instance sees the same one.
type Limit struct {
	Max    int
	Window time.Duration
}
