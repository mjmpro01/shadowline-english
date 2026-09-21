// Package keycloak talks to the Keycloak Admin API so every Shadowline login
// (Google or email/password) leaves a matching user that can receive password
// reset mail later.
package keycloak

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Admin creates and looks up users in a realm. Nil-safe: callers may hold a
// nil *Admin when Keycloak is not configured and skip sync.
type Admin struct {
	BaseURL      string // e.g. http://keycloak:8080 — no trailing slash
	Realm        string
	AdminUser    string
	AdminPass    string
	ClientID     string // confidential client for password grant + reset mail
	ClientSecret string
	HTTPClient   *http.Client

	mu    sync.Mutex
	token string
	exp   time.Time
}

func (a *Admin) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return &http.Client{Timeout: 15 * time.Second}
}

// EnsureUser creates the user when missing. Existing users are left alone so a
// password set through Keycloak registration is never wiped by a Google login.
func (a *Admin) EnsureUser(ctx context.Context, email, name string) error {
	if a == nil || a.BaseURL == "" {
		return nil
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return fmt.Errorf("empty email")
	}

	id, err := a.findByEmail(ctx, email)
	if err != nil {
		return err
	}
	if id != "" {
		return nil
	}

	first, last := splitName(name)
	body, err := json.Marshal(map[string]any{
		"username":      email,
		"email":         email,
		"enabled":       true,
		"emailVerified": true,
		"firstName":     first,
		"lastName":      last,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		a.BaseURL+"/admin/realms/"+url.PathEscape(a.Realm)+"/users",
		bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := a.authorize(ctx, req); err != nil {
		return err
	}

	resp, err := a.client().Do(req)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	defer resp.Body.Close()
	// 409: a concurrent create won the race — the user is there either way.
	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusConflict {
		return nil
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("create user: %s: %s", resp.Status, bytes.TrimSpace(raw))
}

func (a *Admin) findByEmail(ctx context.Context, email string) (string, error) {
	q := url.Values{"email": {email}, "exact": {"true"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		a.BaseURL+"/admin/realms/"+url.PathEscape(a.Realm)+"/users?"+q.Encode(), nil)
	if err != nil {
		return "", err
	}
	if err := a.authorize(ctx, req); err != nil {
		return "", err
	}
	resp, err := a.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("lookup user: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("lookup user: %s: %s", resp.Status, bytes.TrimSpace(raw))
	}
	var users []struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
		return "", fmt.Errorf("decode users: %w", err)
	}
	if len(users) == 0 {
		return "", nil
	}
	return users[0].ID, nil
}

func (a *Admin) authorize(ctx context.Context, req *http.Request) error {
	tok, err := a.accessToken(ctx)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	return nil
}

func (a *Admin) accessToken(ctx context.Context) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.token != "" && time.Now().Before(a.exp) {
		return a.token, nil
	}

	form := url.Values{
		"grant_type": {"password"},
		"client_id":  {"admin-cli"},
		"username":   {a.AdminUser},
		"password":   {a.AdminPass},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		a.BaseURL+"/realms/master/protocol/openid-connect/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := a.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("admin token: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("admin token: %s: %s", resp.Status, bytes.TrimSpace(raw))
	}
	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decode admin token: %w", err)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("admin token response had no access_token")
	}
	a.token = out.AccessToken
	// Refresh a minute early so a slow EnsureUser does not race expiry.
	ttl := time.Duration(out.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = time.Minute
	}
	a.exp = time.Now().Add(ttl - time.Minute)
	if time.Now().After(a.exp) {
		a.exp = time.Now().Add(30 * time.Second)
	}
	return a.token, nil
}

func splitName(name string) (first, last string) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", ""
	}
	parts := strings.Fields(name)
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.Join(parts[1:], " ")
}
