package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// Identity is all the app wants from a provider: who this is, and what to call
// them. Nothing else from Google's profile is stored.
type Identity struct {
	Email string
	Name  string
}

// Provider is the seam a fake can sit in. The real one is Google; the fake is
// enabled by AUTH_FAKE=1 so the browser tests can sign in without credentials
// that cannot exist in CI.
type Provider interface {
	// AuthCodeURL returns where to send the browser. verifier is the PKCE
	// verifier, which the caller must hand back to Exchange.
	AuthCodeURL(state, verifier string) string
	Exchange(ctx context.Context, code, verifier string) (Identity, error)
	// Fake reports whether this provider authenticates nobody. The server logs
	// it loudly at startup so a misconfigured deployment is obvious.
	Fake() bool
}

type googleProvider struct{ cfg *oauth2.Config }

func NewGoogleProvider(clientID, clientSecret, redirectURL string) Provider {
	return &googleProvider{cfg: &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Endpoint:     google.Endpoint,
		Scopes:       []string{"openid", "email", "profile"},
	}}
}

func (g *googleProvider) Fake() bool { return false }

func (g *googleProvider) AuthCodeURL(state, verifier string) string {
	return g.cfg.AuthCodeURL(state,
		oauth2.AccessTypeOnline,
		oauth2.S256ChallengeOption(verifier))
}

func (g *googleProvider) Exchange(ctx context.Context, code, verifier string) (Identity, error) {
	token, err := g.cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Identity{}, fmt.Errorf("exchange code: %w", err)
	}

	client := g.cfg.Client(ctx, token)
	client.Timeout = 10 * time.Second
	resp, err := client.Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return Identity{}, fmt.Errorf("fetch userinfo: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Identity{}, fmt.Errorf("userinfo returned %s", resp.Status)
	}

	var info struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return Identity{}, fmt.Errorf("decode userinfo: %w", err)
	}
	if info.Email == "" {
		return Identity{}, fmt.Errorf("userinfo carried no email")
	}
	// An unverified address could belong to anyone, and ADMIN_EMAILS is matched
	// on the address — accepting one would hand out admin to whoever claims it.
	if !info.EmailVerified {
		return Identity{}, fmt.Errorf("google has not verified %s", info.Email)
	}
	return Identity{Email: info.Email, Name: info.Name}, nil
}

// fakeProvider signs in whoever asks, as whichever address the caller names. It
// exists for tests and is wired up only when AUTH_FAKE=1.
type fakeProvider struct {
	redirectURL string
	// email is set per request from ?email= on /auth/google/start, so a test can
	// sign in as an admin or as an ordinary learner.
	email string
}

func NewFakeProvider(redirectURL string) Provider { return &fakeProvider{redirectURL: redirectURL} }

// WithEmail returns a provider that will sign in as this address. Providers are
// otherwise stateless, so the copy keeps concurrent requests from colliding.
func (f *fakeProvider) WithEmail(email string) Provider {
	return &fakeProvider{redirectURL: f.redirectURL, email: email}
}

// EmailChooser is implemented by the fake provider only. The auth handler uses
// it to honour ?email=, and a real provider simply does not satisfy it.
type EmailChooser interface{ WithEmail(string) Provider }

func (f *fakeProvider) Fake() bool { return true }

// AuthCodeURL skips the provider round trip: the "code" is the email to sign in
// as, and the browser is sent straight back to the callback.
func (f *fakeProvider) AuthCodeURL(state, verifier string) string {
	email := f.email
	if email == "" {
		email = "learner@example.com"
	}
	return fmt.Sprintf("%s?state=%s&code=%s", f.redirectURL, state, url.QueryEscape(email))
}

func (f *fakeProvider) Exchange(_ context.Context, code, _ string) (Identity, error) {
	if code == "" {
		return Identity{}, fmt.Errorf("no code")
	}
	// A name per address, so a test with two learners can tell them apart on
	// screen — a leaderboard of identical names proves nothing.
	local, _, _ := strings.Cut(code, "@")
	return Identity{Email: code, Name: titleCase(local)}, nil
}

func titleCase(s string) string {
	s = strings.ReplaceAll(strings.ReplaceAll(s, ".", " "), "_", " ")
	fields := strings.Fields(s)
	for i, word := range fields {
		fields[i] = strings.ToUpper(word[:1]) + word[1:]
	}
	if len(fields) == 0 {
		return "Learner"
	}
	return strings.Join(fields, " ")
}
