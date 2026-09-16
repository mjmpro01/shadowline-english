package api_test

import (
	"net/http"
	"strings"
	"testing"
)

type profileJSON struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	IsAdmin bool   `json:"isAdmin"`
}

type meJSON struct {
	User *profileJSON `json:"user"`
}

func TestAnonymousIsNotSignedIn(t *testing.T) {
	h := newHarness(t)
	c := h.anonymous()

	me := expect[meJSON](t, c.do("GET", "/auth/me", "", nil), http.StatusOK)
	if me.User != nil {
		t.Fatalf("anonymous request reported a user: %+v", me.User)
	}
	expectStatus(t, c.do("GET", "/api/clips", "", nil), http.StatusUnauthorized)
}

func TestSignInCreatesTheUser(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	me := expect[meJSON](t, c.do("GET", "/auth/me", "", nil), http.StatusOK)
	if me.User == nil {
		t.Fatal("signed-in request reported no user")
	}
	if me.User.Email != "learner@example.com" {
		t.Fatalf("signed in as %q", me.User.Email)
	}
}

// Admin comes from ADMIN_EMAILS on the server. The browser used to decide this
// for itself with a toggle on the Profile screen; this is the test that the
// toggle is gone for good.
func TestAdminComesFromConfigurationNotFromTheClient(t *testing.T) {
	h := newHarness(t)

	learner := expect[meJSON](t, h.login("learner@example.com").do("GET", "/auth/me", "", nil), http.StatusOK)
	if learner.User.IsAdmin {
		t.Fatal("an ordinary address was granted admin")
	}

	admin := expect[meJSON](t, h.login("admin@example.com").do("GET", "/auth/me", "", nil), http.StatusOK)
	if !admin.User.IsAdmin {
		t.Fatal("the configured admin address was not granted admin")
	}
}

func TestAdminRoutesRejectOrdinaryLearners(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	body := map[string]any{"clips": []map[string]any{{"title": "Line one", "durationSeconds": 3}}}
	expectStatus(t, c.json("POST", "/api/admin/clips", body), http.StatusForbidden)
}

func TestLogoutEndsTheSession(t *testing.T) {
	h := newHarness(t)
	c := h.login("learner@example.com")

	expectStatus(t, c.json("POST", "/auth/logout", nil), http.StatusOK)

	me := expect[meJSON](t, c.do("GET", "/auth/me", "", nil), http.StatusOK)
	if me.User != nil {
		t.Fatal("still signed in after logout")
	}
}

// A callback with a state the server never signed must not produce a session,
// or the login flow would accept a request forged by any other site.
func TestCallbackRejectsAnUnsignedState(t *testing.T) {
	h := newHarness(t)
	c := h.anonymous()

	// Start the flow so the PKCE cookie exists — the state is the only thing
	// wrong here.
	resp := c.do("GET", "/auth/google/start?email=learner@example.com", "", nil)
	resp.Body.Close()

	expectStatus(t,
		c.do("GET", "/auth/google/callback?state=forged.9999999999.nope&code=attacker@example.com", "", nil),
		http.StatusBadRequest)

	me := expect[meJSON](t, c.do("GET", "/auth/me", "", nil), http.StatusOK)
	if me.User != nil {
		t.Fatalf("a forged state signed someone in as %s", me.User.Email)
	}
}

// Without the PKCE cookie the exchange must not proceed, even with a state this
// server really did sign — that is what stops a captured authorization code
// being redeemed from somewhere else.
func TestCallbackRejectsAMissingVerifier(t *testing.T) {
	h := newHarness(t)
	c := h.anonymous()

	resp := c.do("GET", "/auth/google/start?email=learner@example.com", "", nil)
	location := resp.Header.Get("Location")
	resp.Body.Close()

	state := location[strings.Index(location, "state=")+len("state="):]
	if i := strings.Index(state, "&"); i >= 0 {
		state = state[:i]
	}

	// A different browser: same signed state, no PKCE cookie.
	other := h.anonymous()
	expectStatus(t,
		other.do("GET", "/auth/google/callback?state="+state+"&code=attacker@example.com", "", nil),
		http.StatusBadRequest)
}
