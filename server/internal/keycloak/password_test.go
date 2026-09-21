package keycloak_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shadowline/server/internal/keycloak"
)

func TestPasswordLoginSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/token"):
			_ = r.ParseForm()
			if r.Form.Get("grant_type") != "password" || r.Form.Get("username") != "ada@example.com" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok"})
		case strings.HasSuffix(r.URL.Path, "/userinfo"):
			_ = json.NewEncoder(w).Encode(map[string]any{"name": "Ada Lovelace"})
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	admin := &keycloak.Admin{
		BaseURL:      srv.URL,
		Realm:        "shadowline",
		ClientID:     "shadowline-api",
		ClientSecret: "secret",
		HTTPClient:   srv.Client(),
	}
	name, err := admin.PasswordLogin(context.Background(), "Ada@Example.com", "secret")
	if err != nil {
		t.Fatalf("PasswordLogin: %v", err)
	}
	if name != "Ada Lovelace" {
		t.Fatalf("name = %q", name)
	}
}

func TestPasswordLoginRejectsBadPassword(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
	}))
	defer srv.Close()

	admin := &keycloak.Admin{
		BaseURL:      srv.URL,
		Realm:        "shadowline",
		ClientID:     "c",
		ClientSecret: "s",
		HTTPClient:   srv.Client(),
	}
	_, err := admin.PasswordLogin(context.Background(), "a@b.c", "wrong")
	if !errors.Is(err, keycloak.ErrInvalidCredentials) {
		t.Fatalf("err = %v", err)
	}
}

func TestRegisterConflict(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/realms/master/protocol/openid-connect/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 300})
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/users"):
			_ = json.NewEncoder(w).Encode([]map[string]string{{"id": "existing"}})
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
	err := admin.Register(context.Background(), "ada@example.com", "pass", "Ada")
	if !errors.Is(err, keycloak.ErrConflict) {
		t.Fatalf("err = %v", err)
	}
}

func TestRegisterCreates(t *testing.T) {
	var created bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/realms/master/protocol/openid-connect/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 300})
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
	if err := admin.Register(context.Background(), "new@example.com", "pass", "New"); err != nil {
		t.Fatalf("Register: %v", err)
	}
	if !created {
		t.Fatal("expected create")
	}
}

func TestSendResetPasswordNoopWhenMissing(t *testing.T) {
	var put bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/realms/master/protocol/openid-connect/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 300})
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/users"):
			_ = json.NewEncoder(w).Encode([]any{})
		case r.Method == http.MethodPut:
			put = true
			w.WriteHeader(http.StatusNoContent)
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
		ClientID:   "shadowline-api",
		HTTPClient: srv.Client(),
	}
	if err := admin.SendResetPassword(context.Background(), "missing@example.com", "http://localhost:5173/login"); err != nil {
		t.Fatalf("SendResetPassword: %v", err)
	}
	if put {
		t.Fatal("must not email a missing user")
	}
}
