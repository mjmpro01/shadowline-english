package api

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// window counts events per key over a sliding period, in memory.
//
// In memory because there is one API process and what it guards is short:
// guesses at a password, lookups that cost money. A restart forgets the counts,
// which costs an attacker nothing they could not get by waiting the window out.
type window struct {
	max int
	per time.Duration
	now func() time.Time

	mu   sync.Mutex
	hits map[string][]time.Time
}

func newWindow(max int, per time.Duration) *window {
	return &window{max: max, per: per, now: time.Now, hits: map[string][]time.Time{}}
}

// full is whether key has used its allowance, without spending any of it.
func (w *window) full(key string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return len(w.recent(key)) >= w.max
}

// add records one event for key.
func (w *window) add(key string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.hits[key] = append(w.recent(key), w.now())
	// Keys whose events have all aged out are dropped now and then, or a
	// stream of one-off addresses would grow the map for as long as it runs.
	if len(w.hits) > 10_000 {
		for k := range w.hits {
			if len(w.recent(k)) == 0 {
				delete(w.hits, k)
			}
		}
	}
}

// allow spends one of key's allowance, or says there is none left.
func (w *window) allow(key string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	recent := w.recent(key)
	if len(recent) >= w.max {
		return false
	}
	w.hits[key] = append(recent, w.now())
	return true
}

// recent is key's events inside the window, oldest first. Callers hold mu.
func (w *window) recent(key string) []time.Time {
	cutoff := w.now().Add(-w.per)
	events := w.hits[key]
	i := 0
	for i < len(events) && !events[i].After(cutoff) {
		i++
	}
	if i == len(events) {
		delete(w.hits, key)
		return nil
	}
	return events[i:]
}

// limits are the allowances the API enforces itself. Generous to a person and
// tight to a script: nobody mistypes a password ten times in fifteen minutes,
// or meets sixty words a dictionary has never heard of in an hour.
type limits struct {
	// Wrong passwords per address, so guessing one account's is slow from any
	// number of machines.
	loginFailures *window
	// Sign-in, registration and reset requests per client, so one machine
	// cannot walk through many addresses either.
	authAttempts *window
	// New accounts per client.
	registrations *window
	// Reset or confirmation mails per address: each one lands in somebody's
	// inbox.
	mails *window
	// Lookups of words nobody has looked up before, per learner: each is a
	// dictionary request and often a model call, paid for.
	newWords *window
}

func newLimits() *limits {
	return &limits{
		loginFailures: newWindow(10, 15*time.Minute),
		authAttempts:  newWindow(30, 15*time.Minute),
		registrations: newWindow(5, time.Hour),
		mails:         newWindow(3, time.Hour),
		newWords:      newWindow(60, time.Hour),
	}
}

func tooMany(w http.ResponseWriter, what string) {
	w.Header().Set("Retry-After", "900")
	fail(w, http.StatusTooManyRequests, what)
}

// clientIP replaces chi's RealIP, which believed True-Client-IP and
// X-Forwarded-For from anybody: a limit per client would then be a limit per
// made-up header. X-Real-IP is taken only from a peer on a private or loopback
// address — nginx on the host, which sets it, reaching the API directly or
// through Docker's bridge — and the connection's own address otherwise.
func clientIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		peer, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			peer = r.RemoteAddr
		}
		if ip := net.ParseIP(peer); ip != nil && (ip.IsLoopback() || ip.IsPrivate()) {
			if forwarded := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); forwarded != nil {
				peer = forwarded.String()
			}
		}
		r.RemoteAddr = peer
		next.ServeHTTP(w, r)
	})
}
