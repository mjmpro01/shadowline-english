package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// NewKeycloakProvider signs learners in through a Keycloak realm over OIDC.
// publicBase is what the browser reaches (e.g. http://localhost:8081); apiBase
// is what this server uses to exchange the code (e.g. http://keycloak:8080).
// They differ under Docker Compose; both must point at the same realm.
func NewKeycloakProvider(apiBase, publicBase, realm, clientID, clientSecret, redirectURL string) Provider {
	apiBase = strings.TrimRight(apiBase, "/")
	publicBase = strings.TrimRight(publicBase, "/")
	if publicBase == "" {
		publicBase = apiBase
	}
	return &keycloakProvider{
		cfg: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  publicBase + "/realms/" + realm + "/protocol/openid-connect/auth",
				TokenURL: apiBase + "/realms/" + realm + "/protocol/openid-connect/token",
			},
		},
		userinfoURL: apiBase + "/realms/" + realm + "/protocol/openid-connect/userinfo",
	}
}

type keycloakProvider struct {
	cfg         *oauth2.Config
	userinfoURL string
}

func (k *keycloakProvider) Fake() bool { return false }

func (k *keycloakProvider) AuthCodeURL(state, verifier string) string {
	return k.cfg.AuthCodeURL(state,
		oauth2.AccessTypeOnline,
		oauth2.S256ChallengeOption(verifier))
}

func (k *keycloakProvider) Exchange(ctx context.Context, code, verifier string) (Identity, error) {
	token, err := k.cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Identity{}, fmt.Errorf("exchange code: %w", err)
	}

	client := k.cfg.Client(ctx, token)
	client.Timeout = 10 * time.Second
	resp, err := client.Get(k.userinfoURL)
	if err != nil {
		return Identity{}, fmt.Errorf("fetch userinfo: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Identity{}, fmt.Errorf("userinfo returned %s", resp.Status)
	}

	var info struct {
		Email             string `json:"email"`
		EmailVerified     bool   `json:"email_verified"`
		Name              string `json:"name"`
		PreferredUsername string `json:"preferred_username"`
		GivenName         string `json:"given_name"`
		FamilyName        string `json:"family_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return Identity{}, fmt.Errorf("decode userinfo: %w", err)
	}
	email := info.Email
	if email == "" {
		email = info.PreferredUsername
	}
	if email == "" {
		return Identity{}, fmt.Errorf("userinfo carried no email")
	}
	// Registration with email-as-username may leave email_verified false in
	// local/dev (verifyEmail off). Still accept: the address is the username
	// Keycloak already owns, and ADMIN_EMAILS is an allow-list we control.
	name := info.Name
	if name == "" {
		name = strings.TrimSpace(info.GivenName + " " + info.FamilyName)
	}
	if name == "" {
		local, _, _ := strings.Cut(email, "@")
		name = titleCase(local)
	}
	return Identity{Email: email, Name: name}, nil
}
