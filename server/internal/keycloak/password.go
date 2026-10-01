package keycloak

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Sentinel errors the HTTP layer maps to status codes for the in-app forms.
var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrConflict           = errors.New("user already exists")
)

// Login is who a password grant says signed in.
type Login struct {
	// Name is the display name, possibly empty.
	Name string
	// Verified is whether Keycloak has the address as confirmed. False when it
	// could not say, which is the safe way to be wrong.
	Verified bool
}

// PasswordLogin checks email/password against Keycloak via the resource-owner
// password grant.
func (a *Admin) PasswordLogin(ctx context.Context, email, password string) (Login, error) {
	if a == nil || a.BaseURL == "" {
		return Login{}, fmt.Errorf("keycloak not configured")
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return Login{}, ErrInvalidCredentials
	}
	if a.ClientID == "" || a.ClientSecret == "" {
		return Login{}, fmt.Errorf("keycloak client credentials missing")
	}

	form := url.Values{
		"grant_type":    {"password"},
		"client_id":     {a.ClientID},
		"client_secret": {a.ClientSecret},
		"username":      {email},
		"password":      {password},
		"scope":         {"openid profile email"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		a.BaseURL+"/realms/"+url.PathEscape(a.Realm)+"/protocol/openid-connect/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return Login{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := a.client().Do(req)
	if err != nil {
		return Login{}, fmt.Errorf("password grant: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusBadRequest {
		return Login{}, ErrInvalidCredentials
	}
	if resp.StatusCode != http.StatusOK {
		return Login{}, fmt.Errorf("password grant: %s: %s", resp.Status, bytes.TrimSpace(raw))
	}

	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(raw, &tok); err != nil || tok.AccessToken == "" {
		return Login{}, fmt.Errorf("password grant: bad token response")
	}
	return a.userinfo(ctx, tok.AccessToken), nil
}

// Register creates a Keycloak user with a permanent password. Returns
// ErrConflict when the email is already taken.
func (a *Admin) Register(ctx context.Context, email, password, name string) error {
	if a == nil || a.BaseURL == "" {
		return fmt.Errorf("keycloak not configured")
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return fmt.Errorf("email and password required")
	}

	if id, err := a.findByEmail(ctx, email); err != nil {
		return err
	} else if id != "" {
		return ErrConflict
	}

	first, last := splitName(name)
	body, err := json.Marshal(map[string]any{
		"username": email,
		"email":    email,
		"enabled":  true,
		// Not verified: nobody has shown they own this address yet, and
		// anybody can register any address. It was true, which made every
		// registration look like the address's owner.
		"emailVerified": false,
		"firstName":     first,
		"lastName":      last,
		"credentials": []map[string]any{{
			"type":      "password",
			"value":     password,
			"temporary": false,
		}},
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
		return fmt.Errorf("register: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusConflict {
		return ErrConflict
	}
	if resp.StatusCode == http.StatusCreated {
		return nil
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("register: %s: %s", resp.Status, bytes.TrimSpace(raw))
}

// SendResetPassword emails Keycloak's UPDATE_PASSWORD action. Missing users are
// a no-op so callers can always answer 204.
func (a *Admin) SendResetPassword(ctx context.Context, email, redirectURI string) error {
	return a.emailActions(ctx, email, redirectURI, "UPDATE_PASSWORD")
}

// SendVerifyEmail emails Keycloak's VERIFY_EMAIL action: the link that proves
// the address belongs to whoever registered it.
func (a *Admin) SendVerifyEmail(ctx context.Context, email, redirectURI string) error {
	return a.emailActions(ctx, email, redirectURI, "VERIFY_EMAIL")
}

func (a *Admin) emailActions(ctx context.Context, email, redirectURI string, actions ...string) error {
	if a == nil || a.BaseURL == "" {
		return fmt.Errorf("keycloak not configured")
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil
	}

	id, err := a.findByEmail(ctx, email)
	if err != nil {
		return err
	}
	if id == "" {
		return nil
	}

	q := url.Values{}
	if a.ClientID != "" {
		q.Set("client_id", a.ClientID)
	}
	if redirectURI != "" {
		q.Set("redirect_uri", redirectURI)
	}
	endpoint := a.BaseURL + "/admin/realms/" + url.PathEscape(a.Realm) +
		"/users/" + url.PathEscape(id) + "/execute-actions-email"
	if enc := q.Encode(); enc != "" {
		endpoint += "?" + enc
	}

	body, err := json.Marshal(actions)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := a.authorize(ctx, req); err != nil {
		return err
	}

	resp, err := a.client().Do(req)
	if err != nil {
		return fmt.Errorf("%s email: %w", strings.Join(actions, ","), err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusOK {
		return nil
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("%s email: %s: %s", strings.Join(actions, ","), resp.Status, bytes.TrimSpace(raw))
}

func (a *Admin) userinfo(ctx context.Context, accessToken string) Login {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		a.BaseURL+"/realms/"+url.PathEscape(a.Realm)+"/protocol/openid-connect/userinfo", nil)
	if err != nil {
		return Login{}
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := a.client().Do(req)
	if err != nil {
		return Login{}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Login{}
	}
	var info struct {
		Name          string `json:"name"`
		GivenName     string `json:"given_name"`
		FamilyName    string `json:"family_name"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return Login{}
	}
	name := info.Name
	if name == "" {
		name = strings.TrimSpace(info.GivenName + " " + info.FamilyName)
	}
	return Login{Name: name, Verified: info.EmailVerified}
}

// SetPassword replaces the password of the user with this address. It is the
// caller's job to have checked the old one: this is the admin API, which asks
// for none.
func (a *Admin) SetPassword(ctx context.Context, email, password string) error {
	if a == nil || a.BaseURL == "" {
		return fmt.Errorf("keycloak not configured")
	}
	id, err := a.findByEmail(ctx, strings.TrimSpace(strings.ToLower(email)))
	if err != nil {
		return err
	}
	if id == "" {
		return ErrInvalidCredentials
	}
	body, err := json.Marshal(map[string]any{"type": "password", "value": password, "temporary": false})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		a.BaseURL+"/admin/realms/"+url.PathEscape(a.Realm)+"/users/"+url.PathEscape(id)+"/reset-password",
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
		return fmt.Errorf("set password: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusOK {
		return nil
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("set password: %s: %s", resp.Status, bytes.TrimSpace(raw))
}

// DeleteUser removes the user with this address from Keycloak. One that is not
// there is already deleted.
func (a *Admin) DeleteUser(ctx context.Context, email string) error {
	if a == nil || a.BaseURL == "" {
		return nil
	}
	id, err := a.findByEmail(ctx, strings.TrimSpace(strings.ToLower(email)))
	if err != nil || id == "" {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
		a.BaseURL+"/admin/realms/"+url.PathEscape(a.Realm)+"/users/"+url.PathEscape(id), nil)
	if err != nil {
		return err
	}
	if err := a.authorize(ctx, req); err != nil {
		return err
	}
	resp, err := a.client().Do(req)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusNotFound {
		return nil
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("delete user: %s: %s", resp.Status, bytes.TrimSpace(raw))
}
