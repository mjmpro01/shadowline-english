package api_test

import (
	"net/http"
	"net/url"
	"testing"
)

// signInFrom runs the fake provider's login, started with ?from=, and answers
// where the callback sends the browser.
func signInFrom(t *testing.T, c *client, email, from string) string {
	t.Helper()
	start := "/auth/google/start?email=" + url.QueryEscape(email)
	if from != "" {
		start += "&from=" + url.QueryEscape(from)
	}
	resp := c.do("GET", start, "", nil)
	resp.Body.Close()
	u, err := url.Parse(resp.Header.Get("Location"))
	if err != nil {
		t.Fatalf("parse callback url: %v", err)
	}
	resp = c.do("GET", "/auth/google/callback?"+u.RawQuery, "", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("callback answered %d, want 302", resp.StatusCode)
	}
	return resp.Header.Get("Location")
}

// A login begun on the console's own login screen comes back to the console,
// and one that fails goes back to that screen, not the learner app's.
func TestALoginStartedFromTheConsoleComesBackToIt(t *testing.T) {
	h := newHarness(t)

	if got := signInFrom(t, h.anonymous(), "admin@example.com", "admin"); got != "http://localhost:5173/admin/" {
		t.Fatalf("a console login landed on %q, want the console", got)
	}
	if got := signInFrom(t, h.anonymous(), "learner@example.com", ""); got != "http://localhost:5173/dashboard" {
		t.Fatalf("an app login landed on %q, want the dashboard", got)
	}
}

// Only the places we know: anything else is the learner app, so the parameter
// cannot be used to send somebody off the site after a real login.
func TestAnUnknownStartingPointIsTheLearnerApp(t *testing.T) {
	h := newHarness(t)
	for _, from := range []string{"https://evil.example", "//evil.example", "/admin/../x", "ADMIN"} {
		if got := signInFrom(t, h.anonymous(), "learner@example.com", from); got != "http://localhost:5173/dashboard" {
			t.Fatalf("from=%q landed on %q, want the dashboard", from, got)
		}
	}
}

func TestAConsoleLoginThatFailsGoesBackToTheConsolesLoginScreen(t *testing.T) {
	h := newHarness(t)
	c := h.anonymous()
	resp := c.do("GET", "/auth/google/start?email=admin@example.com&from=admin", "", nil)
	resp.Body.Close()

	resp = c.do("GET", "/auth/google/callback?error=access_denied", "", nil)
	defer resp.Body.Close()
	if got := resp.Header.Get("Location"); got != "http://localhost:5173/admin/login?error=cancelled" {
		t.Fatalf("a cancelled console login went to %q", got)
	}
}

// Where a login started is forgotten once it finishes, so an abandoned
// console login cannot send a later app login to the console.
func TestTheStartingPointIsForgottenAfterOneLogin(t *testing.T) {
	h := newHarness(t)
	c := h.anonymous()
	signInFrom(t, c, "admin@example.com", "admin")
	if got := signInFrom(t, c, "admin@example.com", ""); got != "http://localhost:5173/dashboard" {
		t.Fatalf("the next app login landed on %q, want the dashboard", got)
	}
}
