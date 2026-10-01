package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAWindowForgetsWhatHasAgedOut(t *testing.T) {
	now := time.Unix(0, 0)
	w := newWindow(2, time.Minute)
	w.now = func() time.Time { return now }
	if !w.allow("k") || !w.allow("k") || w.allow("k") {
		t.Fatal("two allowed, the third not")
	}
	if w.allow("other") == false {
		t.Fatal("keys share an allowance")
	}
	now = now.Add(61 * time.Second)
	if !w.allow("k") {
		t.Fatal("the window did not move on")
	}
}

// The client's address is believed from X-Real-IP only when nginx — a private
// or loopback peer — sent it. Anything else, and every other header, is the
// connection's own address.
func TestTheClientAddressCannotBeMadeUp(t *testing.T) {
	seen := func(remote string, headers map[string]string) string {
		var got string
		h := clientIP(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { got = r.RemoteAddr }))
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = remote
		for k, v := range headers {
			r.Header.Set(k, v)
		}
		h.ServeHTTP(httptest.NewRecorder(), r)
		return got
	}
	if got := seen("203.0.113.9:4000", map[string]string{"X-Real-IP": "1.2.3.4", "True-Client-IP": "5.6.7.8"}); got != "203.0.113.9" {
		t.Fatalf("a public peer chose its own address: %s", got)
	}
	if got := seen("172.18.0.1:4000", map[string]string{"X-Real-IP": "198.51.100.7"}); got != "198.51.100.7" {
		t.Fatalf("nginx through Docker's bridge was not believed: %s", got)
	}
	if got := seen("127.0.0.1:4000", map[string]string{"True-Client-IP": "5.6.7.8", "X-Forwarded-For": "9.9.9.9"}); got != "127.0.0.1" {
		t.Fatalf("a header nginx does not set was believed: %s", got)
	}
}
