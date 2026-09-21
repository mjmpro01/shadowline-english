package keycloak_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shadowline/server/internal/keycloak"
)

func TestEnsureUserCreatesWhenMissing(t *testing.T) {
	var created bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/realms/master/protocol/openid-connect/token":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "tok",
				"expires_in":   300,
			})
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/users"):
			_ = json.NewEncoder(w).Encode([]any{})
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/users"):
			created = true
			w.WriteHeader(http.StatusCreated)
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	admin := &keycloak.Admin{
		BaseURL:    srv.URL,
		Realm:      "shadowline",
		AdminUser:  "admin",
		AdminPass:  "admin",
		HTTPClient: srv.Client(),
	}
	if err := admin.EnsureUser(context.Background(), "We@Example.com", "Ada Lovelace"); err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	if !created {
		t.Fatal("expected a create call")
	}
}

func TestEnsureUserSkipsWhenPresent(t *testing.T) {
	var posts int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/realms/master/protocol/openid-connect/token":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "tok",
				"expires_in":   300,
			})
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/users"):
			_ = json.NewEncoder(w).Encode([]map[string]string{{"id": "abc"}})
		case r.Method == http.MethodPost:
			posts++
			w.WriteHeader(http.StatusCreated)
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	admin := &keycloak.Admin{
		BaseURL:    srv.URL,
		Realm:      "shadowline",
		AdminUser:  "admin",
		AdminPass:  "admin",
		HTTPClient: srv.Client(),
	}
	if err := admin.EnsureUser(context.Background(), "ada@example.com", "Ada"); err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	if posts != 0 {
		t.Fatalf("created user though one existed: %d posts", posts)
	}
}

func TestNilAdminIsNoop(t *testing.T) {
	var admin *keycloak.Admin
	if err := admin.EnsureUser(context.Background(), "a@b.c", "A"); err != nil {
		t.Fatalf("nil EnsureUser: %v", err)
	}
}
