package api_test

import (
	"net/http"
	"testing"
)

// Accounts are matched by address, and anybody can register any address with
// Keycloak. These are the ways that used to hand one person's account to
// another, each now closed.

// Registering an address that already has an account used to sign the
// registrant in to it — here the admin's, with admin rights and a new name.
func TestRegisteringAnAddressWithAnAccountDoesNotSignIntoIt(t *testing.T) {
	h := newHarness(t)
	h.login("admin@example.com")
	// Keycloak learns of the admin only after the Google login: the mirror into
	// it is best-effort, and Keycloak being down meanwhile is all it takes.
	withKeycloak(t, h, map[string]string{})

	attacker := h.anonymous()
	expectStatus(t, attacker.json("POST", "/auth/register",
		map[string]any{"email": "admin@example.com", "password": "attacker-pw", "name": "Mallory"}), http.StatusConflict)

	me := expect[map[string]any](t, attacker.do("GET", "/auth/me", "", nil), http.StatusOK)
	if me["user"] != nil {
		t.Fatalf("the registrant was signed in as %v", me["user"])
	}
	expectStatus(t, attacker.do("GET", "/api/admin/users", "", nil), http.StatusUnauthorized)
}

// A listed admin address nobody has signed in with yet: registering it gives
// an account, but not the admin rights the address would carry if proven.
func TestAnUnconfirmedAddressGetsNoAdminRights(t *testing.T) {
	h := newHarness(t)
	withKeycloak(t, h, map[string]string{})

	attacker := h.anonymous()
	got := expect[struct {
		User struct {
			IsAdmin bool `json:"isAdmin"`
		} `json:"user"`
	}](t, attacker.json("POST", "/auth/register",
		map[string]any{"email": "admin@example.com", "password": "attacker-pw"}), http.StatusOK)
	if got.User.IsAdmin {
		t.Fatal("registering a listed admin address made the registrant an admin")
	}
	expectStatus(t, attacker.do("GET", "/api/admin/users", "", nil), http.StatusForbidden)

	// The address's owner proves it with Google and gets their rights; the
	// registrant's password no longer opens the account.
	owner := h.login("admin@example.com")
	expectStatus(t, owner.do("GET", "/api/admin/users", "", nil), http.StatusOK)
	expectStatus(t, h.anonymous().json("POST", "/auth/login",
		map[string]any{"email": "admin@example.com", "password": "attacker-pw"}), http.StatusForbidden)
}

// Registering somebody's address before they ever join, then waiting for them:
// their Google login lands in the account the registrant holds a password to.
// Once a confirmed identity has used the account, the unconfirmed one is out.
func TestAnAccountRegisteredAheadOfItsOwnerIsClosedToTheRegistrant(t *testing.T) {
	h := newHarness(t)
	withKeycloak(t, h, map[string]string{})

	expectStatus(t, h.anonymous().json("POST", "/auth/register",
		map[string]any{"email": "learner@example.com", "password": "lying-in-wait"}), http.StatusOK)
	// Before the owner arrives the registrant's own account works as normal.
	expectStatus(t, h.anonymous().json("POST", "/auth/login",
		map[string]any{"email": "learner@example.com", "password": "lying-in-wait"}), http.StatusOK)

	h.login("learner@example.com")
	expectStatus(t, h.anonymous().json("POST", "/auth/login",
		map[string]any{"email": "learner@example.com", "password": "lying-in-wait"}), http.StatusForbidden)
}

// With REQUIRE_VERIFIED_EMAIL, a registration mails a confirmation link and
// signs nobody in, and an unconfirmed password is turned away.
func TestRequiringConfirmedAddressesMailsALinkInsteadOfSigningIn(t *testing.T) {
	h := newHarness(t)
	fake := withKeycloak(t, h, map[string]string{})
	h.srv.Cfg.RequireVerifiedEmail = true

	someone := h.anonymous()
	got := expect[map[string]any](t, someone.json("POST", "/auth/register",
		map[string]any{"email": "new@example.com", "password": "a-good-password"}), http.StatusAccepted)
	if got["verify"] != true {
		t.Fatalf("register answered %v", got)
	}
	if len(fake.mailed) != 1 || fake.mailed[0] != "new@example.com" {
		t.Fatalf("mailed %v", fake.mailed)
	}
	me := expect[map[string]any](t, someone.do("GET", "/auth/me", "", nil), http.StatusOK)
	if me["user"] != nil {
		t.Fatal("an unconfirmed registration was signed in")
	}
	expectStatus(t, someone.json("POST", "/auth/login",
		map[string]any{"email": "new@example.com", "password": "a-good-password"}), http.StatusForbidden)

	// Confirmed, it signs in.
	delete(fake.unverified, "new@example.com")
	expectStatus(t, someone.json("POST", "/auth/login",
		map[string]any{"email": "new@example.com", "password": "a-good-password"}), http.StatusOK)
}
