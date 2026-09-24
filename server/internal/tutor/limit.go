package tutor

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// Limiter caps how many messages one learner can send in a window.
//
// Every message costs money at the other end, and this is the first endpoint on
// the server where one person holding Enter could run up a bill. In memory,
// which is right for the single API instance this deploys as; a second replica
// would give each learner the allowance twice, and the day there is one this
// wants to move into Postgres.
type Limiter struct {
	Max    int
	Window time.Duration

	mu   sync.Mutex
	sent map[uuid.UUID][]time.Time
}

// Allow records a message and reports whether it fits, and if not, how long
// until the oldest one in the window falls out of it.
func (l *Limiter) Allow(user uuid.UUID, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.sent == nil {
		l.sent = map[uuid.UUID][]time.Time{}
	}

	cutoff := now.Add(-l.Window)
	kept := l.sent[user][:0]
	for _, at := range l.sent[user] {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) >= l.Max {
		l.sent[user] = kept
		return false, kept[0].Sub(cutoff)
	}
	l.sent[user] = append(kept, now)
	return true, 0
}
