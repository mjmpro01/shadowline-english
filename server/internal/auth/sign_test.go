package auth

import (
	"strings"
	"testing"
	"time"
)

func signer() *Signer { return NewSigner(strings.Repeat("k", 32)) }

func TestAFileSignatureIsAcceptedOnlyForItsOwnObject(t *testing.T) {
	s := signer()
	expires := time.Now().Add(time.Hour)
	query := s.SignPath("clips", "clip/one/audio.wav", expires)

	exp, sig := split(t, query)
	if !s.VerifyPath("clips", "clip/one/audio.wav", exp, sig) {
		t.Fatal("a signature this server produced was rejected")
	}

	// Anything the signature covers, changed: a different object, a different
	// bucket, a different expiry. Each has to fail, or a link to one recording
	// would open another.
	if s.VerifyPath("clips", "clip/two/audio.wav", exp, sig) {
		t.Fatal("the signature opened a different object")
	}
	if s.VerifyPath("takes", "clip/one/audio.wav", exp, sig) {
		t.Fatal("the signature opened a different bucket")
	}
	if s.VerifyPath("clips", "clip/one/audio.wav", "9999999999", sig) {
		t.Fatal("the expiry could be extended without breaking the signature")
	}
}

// The whole point of an expiry is that a leaked URL stops working.
func TestAnExpiredFileSignatureIsRejected(t *testing.T) {
	s := signer()
	query := s.SignPath("clips", "clip/one/audio.wav", time.Now().Add(-time.Second))
	exp, sig := split(t, query)

	if s.VerifyPath("clips", "clip/one/audio.wav", exp, sig) {
		t.Fatal("an expired link still worked")
	}
}

// The length prefix in mac() is what stops two different inputs signing the
// same: without it ("ab", "c") and ("a", "bc") are the same byte stream.
func TestSignaturesDoNotCollideAcrossFieldBoundaries(t *testing.T) {
	s := signer()
	expires := time.Now().Add(time.Hour)

	exp, sig := split(t, s.SignPath("clips", "ab/c", expires))
	if s.VerifyPath("clipsa", "b/c", exp, sig) {
		t.Fatal("moving a character between bucket and key kept the signature valid")
	}
}

func TestStateIsRejectedWhenForgedOrExpired(t *testing.T) {
	s := signer()

	if !s.VerifyState(s.SignState("nonce", time.Now().Add(time.Minute))) {
		t.Fatal("a state this server signed was rejected")
	}
	if s.VerifyState(s.SignState("nonce", time.Now().Add(-time.Minute))) {
		t.Fatal("an expired state was accepted")
	}
	if s.VerifyState("nonce.9999999999.notasignature") {
		t.Fatal("a forged state was accepted")
	}
	if s.VerifyState("no-dots-at-all") {
		t.Fatal("a malformed state was accepted")
	}

	// A different server must not accept our states, or a shared redirect URL
	// would let one deployment start a login another one finishes.
	other := NewSigner(strings.Repeat("j", 32))
	if other.VerifyState(s.SignState("nonce", time.Now().Add(time.Minute))) {
		t.Fatal("another server's secret verified our state")
	}
}

func split(t *testing.T, query string) (exp, sig string) {
	t.Helper()
	expPart, sigPart, ok := strings.Cut(query, "&")
	if !ok {
		t.Fatalf("unexpected query %q", query)
	}
	return strings.TrimPrefix(expPart, "expires="), strings.TrimPrefix(sigPart, "sig=")
}
