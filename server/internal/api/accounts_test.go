package api_test

import (
	"net/http"
	"net/url"
	"testing"
)

type accountJSON struct {
	ID           string  `json:"id"`
	Email        string  `json:"email"`
	IsAdmin      bool    `json:"isAdmin"`
	AdminGranted bool    `json:"adminGranted"`
	Owner        bool    `json:"owner"`
	SuspendedAt  *string `json:"suspendedAt"`
}

type accountsJSON struct {
	Users []accountJSON `json:"users"`
	Total int           `json:"total"`
}

func accountOf(t *testing.T, admin *client, email string) accountJSON {
	t.Helper()
	list := expect[accountsJSON](t, admin.do("GET", "/api/admin/users?q="+url.QueryEscape(email), "", nil), http.StatusOK)
	for _, u := range list.Users {
		if u.Email == email {
			return u
		}
	}
	t.Fatalf("%s is not in the list", email)
	return accountJSON{}
}

// Admin rights given in the console are written down, and a sign-in does not
// take them back — which is what ADMIN_EMAILS used to do on every login.
func TestAnAdminMadeInTheConsoleStaysOne(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	helper := h.login("helper@example.com")
	expectStatus(t, helper.do("GET", "/api/admin/users", "", nil), http.StatusForbidden)

	target := accountOf(t, admin, "helper@example.com")
	made := expect[accountJSON](t, admin.json("PATCH", "/api/admin/users/"+target.ID,
		map[string]any{"admin": true}), http.StatusOK)
	if !made.IsAdmin || !made.AdminGranted || made.Owner {
		t.Fatalf("after granting: %+v", made)
	}
	// At once, on the session they already have.
	expectStatus(t, helper.do("GET", "/api/admin/users", "", nil), http.StatusOK)

	// And after signing in again, which used to reset it from ADMIN_EMAILS.
	again := h.login("helper@example.com")
	expectStatus(t, again.do("GET", "/api/admin/users", "", nil), http.StatusOK)

	// Taken away, it is gone at once too.
	expect[accountJSON](t, admin.json("PATCH", "/api/admin/users/"+target.ID,
		map[string]any{"admin": false}), http.StatusOK)
	expectStatus(t, again.do("GET", "/api/admin/users", "", nil), http.StatusForbidden)
}

// Suspending signs the person out now, and keeps them out.
func TestASuspendedAccountIsSignedOutAndCannotComeBack(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	expectStatus(t, learner.do("GET", "/api/library/summary", "", nil), http.StatusOK)

	target := accountOf(t, admin, "learner@example.com")
	suspended := expect[accountJSON](t, admin.json("PATCH", "/api/admin/users/"+target.ID,
		map[string]any{"suspended": true}), http.StatusOK)
	if suspended.SuspendedAt == nil {
		t.Fatal("not marked suspended")
	}
	expectStatus(t, learner.do("GET", "/api/library/summary", "", nil), http.StatusUnauthorized)

	// Signing in again ends at the login screen with a reason, and no session.
	c := h.anonymous()
	start := c.do("GET", "/auth/google/start?email=learner%40example.com", "", nil)
	start.Body.Close()
	callback, _ := url.Parse(start.Header.Get("Location"))
	res := c.do("GET", "/auth/google/callback?"+callback.RawQuery, "", nil)
	res.Body.Close()
	if loc := res.Header.Get("Location"); loc != "http://localhost:5173/login?error=suspended" {
		t.Fatalf("sign-in went to %q", loc)
	}
	expectStatus(t, c.do("GET", "/api/library/summary", "", nil), http.StatusUnauthorized)

	// Restored, they can sign in as before.
	expect[accountJSON](t, admin.json("PATCH", "/api/admin/users/"+target.ID,
		map[string]any{"suspended": false}), http.StatusOK)
	expectStatus(t, h.login("learner@example.com").do("GET", "/api/library/summary", "", nil), http.StatusOK)

	list := expect[accountsJSON](t, admin.do("GET", "/api/admin/users?filter=suspended", "", nil), http.StatusOK)
	if list.Total != 0 {
		t.Fatalf("%d still suspended", list.Total)
	}
}

// The two changes nobody could undo from the console are refused: an admin
// changing their own access, and anybody changing an owner's.
func TestOwnersAndYourselfAreOutOfReach(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	helper := h.login("helper@example.com")

	me := accountOf(t, admin, "admin@example.com")
	if !me.Owner {
		t.Fatal("an ADMIN_EMAILS address is not shown as an owner")
	}
	expectStatus(t, admin.json("PATCH", "/api/admin/users/"+me.ID,
		map[string]any{"suspended": true}), http.StatusConflict)

	target := accountOf(t, admin, "helper@example.com")
	expect[accountJSON](t, admin.json("PATCH", "/api/admin/users/"+target.ID,
		map[string]any{"admin": true}), http.StatusOK)
	expectStatus(t, helper.json("PATCH", "/api/admin/users/"+me.ID,
		map[string]any{"admin": false}), http.StatusConflict)
	expectStatus(t, helper.json("PATCH", "/api/admin/users/"+me.ID,
		map[string]any{"suspended": true}), http.StatusConflict)

	admins := expect[accountsJSON](t, admin.do("GET", "/api/admin/users?filter=admins", "", nil), http.StatusOK)
	if admins.Total != 2 {
		t.Fatalf("%d admins listed, want 2", admins.Total)
	}
	expectStatus(t, admin.do("GET", "/api/admin/users?filter=everyone", "", nil), http.StatusBadRequest)
}
