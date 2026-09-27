package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/shadowline/server/internal/keycloak"
	"github.com/shadowline/server/internal/storage"
)

// A learner's own copy of what the server keeps: their takes with the line
// each was of, their words, and when they asked the tutor.
func TestALearnerCanTakeTheirDataAway(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("One step at a time"))[0]
	withAudio(t, admin, clip.ID)
	learner := h.login("learner@example.com")
	h.recordScoredTake(t, learner, clip.ID, 71, map[string]float64{"Stress": 64})
	expectStatus(t, learner.json("POST", "/api/vocab", map[string]any{"word": "step"}), http.StatusCreated)

	res := learner.do("GET", "/api/account/export", "", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("export: %d", res.StatusCode)
	}
	if cd := res.Header.Get("Content-Disposition"); !strings.HasPrefix(cd, `attachment; filename="shadowline-`) {
		t.Fatalf("Content-Disposition %q — the browser should save it, not show it", cd)
	}
	var export struct {
		Profile struct {
			Email string `json:"email"`
		} `json:"profile"`
		Takes []struct {
			Clip      string   `json:"clip"`
			Score     *float64 `json:"score"`
			Recording string   `json:"recording"`
		} `json:"takes"`
		Vocabulary []struct {
			Word string `json:"word"`
		} `json:"vocabulary"`
		TutorQuestions []any `json:"tutorQuestions"`
	}
	if err := json.NewDecoder(res.Body).Decode(&export); err != nil {
		t.Fatal(err)
	}
	if export.Profile.Email != "learner@example.com" {
		t.Fatalf("exported %s's profile", export.Profile.Email)
	}
	if len(export.Takes) != 1 || export.Takes[0].Clip != "One step at a time" ||
		export.Takes[0].Score == nil || *export.Takes[0].Score != 71 || export.Takes[0].Recording == "" {
		t.Fatalf("takes: %+v", export.Takes)
	}
	if len(export.Vocabulary) != 1 || export.Vocabulary[0].Word != "step" {
		t.Fatalf("vocabulary: %+v", export.Vocabulary)
	}
	if export.TutorQuestions == nil {
		t.Fatal("tutorQuestions is null rather than empty")
	}
}

// Deleting an account takes the recordings with it, signs the person out, and
// leaves nothing to sign back into.
func TestDeletingAnAccountTakesEverythingWithIt(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clip := publishClips(t, admin, aClip("Line one"))[0]
	withAudio(t, admin, clip.ID)
	learner := h.login("learner@example.com")
	record(t, learner, clip.ID)

	var key string
	if err := h.pool.QueryRow(context.Background(),
		`select audio_key from takes limit 1`).Scan(&key); err != nil {
		t.Fatal(err)
	}

	// Confirmed by typing the address, and not by anything else.
	expectStatus(t, learner.json("DELETE", "/api/account", map[string]any{"email": "someone@else.com"}),
		http.StatusBadRequest)
	expectStatus(t, learner.json("DELETE", "/api/account", map[string]any{"email": " Learner@Example.com "}),
		http.StatusNoContent)

	expectStatus(t, learner.do("GET", "/api/library/summary", "", nil), http.StatusUnauthorized)
	var takes, users int
	_ = h.pool.QueryRow(context.Background(), `select count(*) from takes`).Scan(&takes)
	_ = h.pool.QueryRow(context.Background(),
		`select count(*) from users where email = 'learner@example.com'`).Scan(&users)
	if takes != 0 || users != 0 {
		t.Fatalf("%d takes and %d users left behind", takes, users)
	}
	if rc, err := h.blobs.Open(context.Background(), storage.Takes, key); err == nil {
		rc.Close()
		t.Fatal("the recording is still in storage")
	}

	// Signing in again is a new, empty account, not the old one back.
	again := h.login("learner@example.com")
	summary := expect[[]any](t, again.do("GET", "/api/takes", "", nil), http.StatusOK)
	if len(summary) != 0 {
		t.Fatalf("a new account came back with %d takes", len(summary))
	}
}

// fakeKeycloak keeps one password per address and answers the four calls the
// server makes: the password grant, an admin token, finding a user, and
// setting a password.
type fakeKeycloak struct {
	mu        sync.Mutex
	passwords map[string]string
	deleted   []string
}

func (k *fakeKeycloak) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	k.mu.Lock()
	defer k.mu.Unlock()
	switch {
	case strings.HasSuffix(r.URL.Path, "/protocol/openid-connect/token"):
		_ = r.ParseForm()
		// The master realm is the server's own admin login; the app's realm
		// is a learner's password being checked.
		if !strings.Contains(r.URL.Path, "/realms/master/") &&
			k.passwords[r.Form.Get("username")] != r.Form.Get("password") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 300})
	case strings.HasSuffix(r.URL.Path, "/userinfo"):
		_ = json.NewEncoder(w).Encode(map[string]string{"name": ""})
	case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/users"):
		email := r.URL.Query().Get("email")
		if _, ok := k.passwords[email]; !ok {
			_ = json.NewEncoder(w).Encode([]any{})
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]string{{"id": url.PathEscape(email)}})
	case r.Method == http.MethodPut && strings.HasSuffix(r.URL.Path, "/reset-password"):
		parts := strings.Split(r.URL.Path, "/")
		email, _ := url.PathUnescape(parts[len(parts)-2])
		var body struct {
			Value string `json:"value"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		k.passwords[email] = body.Value
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodDelete:
		parts := strings.Split(r.URL.Path, "/")
		email, _ := url.PathUnescape(parts[len(parts)-1])
		k.deleted = append(k.deleted, email)
		delete(k.passwords, email)
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func withKeycloak(t *testing.T, h *harness, passwords map[string]string) *fakeKeycloak {
	t.Helper()
	fake := &fakeKeycloak{passwords: passwords}
	server := httptest.NewServer(fake)
	t.Cleanup(server.Close)
	h.srv.Users = &keycloak.Admin{
		BaseURL: server.URL, Realm: "shadowline", AdminUser: "admin", AdminPass: "admin",
		ClientID: "shadowline", ClientSecret: "secret", HTTPClient: server.Client(),
	}
	return fake
}

// A password is changed only by somebody who knows the current one.
func TestChangingAPasswordNeedsTheCurrentOne(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")

	// No Keycloak, no passwords to change — and the profile says so.
	expectStatus(t, learner.json("POST", "/api/account/password",
		map[string]any{"current": "a", "next": "longenough"}), http.StatusNotFound)

	fake := withKeycloak(t, h, map[string]string{"learner@example.com": "old-password"})
	me := expect[struct {
		User struct {
			Passwords bool `json:"passwords"`
		} `json:"user"`
	}](t, learner.do("GET", "/auth/me", "", nil), http.StatusOK)
	if !me.User.Passwords {
		t.Fatal("the profile does not say passwords can be changed")
	}

	expectStatus(t, learner.json("POST", "/api/account/password",
		map[string]any{"current": "wrong", "next": "new-password"}), http.StatusForbidden)
	expectStatus(t, learner.json("POST", "/api/account/password",
		map[string]any{"current": "old-password", "next": "short"}), http.StatusBadRequest)
	expectStatus(t, learner.json("POST", "/api/account/password",
		map[string]any{"current": "old-password", "next": "new-password"}), http.StatusNoContent)
	if fake.passwords["learner@example.com"] != "new-password" {
		t.Fatal("the new password did not reach Keycloak")
	}

	// And deleting the account deletes the Keycloak user, so the address is
	// free to register afresh.
	expectStatus(t, learner.json("DELETE", "/api/account", map[string]any{"email": "learner@example.com"}),
		http.StatusNoContent)
	if len(fake.deleted) != 1 || fake.deleted[0] != "learner@example.com" {
		t.Fatalf("Keycloak deletes: %v", fake.deleted)
	}
}
