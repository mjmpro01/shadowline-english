// Package config reads every knob the server has from the environment, so a
// deployment differs from a laptop only by its .env file.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Addr        string
	DatabaseURL string

	// Auth
	GoogleClientID     string
	GoogleClientSecret string
	OAuthRedirectURL   string
	SessionSecret      string
	// AuthFake replaces Google with a local stub. Tests only — Load refuses it
	// on an https deployment, which is the closest thing to "in production" the
	// server can tell from its own environment.
	AuthFake    bool
	AdminEmails map[string]bool
	// RequireVerifiedEmail turns away any identity whose address is not
	// confirmed, and has a password registration send the confirmation mail
	// instead of signing in. Off by default because it needs Keycloak to have a
	// real SMTP server; with it off, an unverified identity still cannot reach
	// an account a verified one has used, nor get admin from ADMIN_EMAILS.
	RequireVerifiedEmail bool

	// Keycloak: email/password login and Admin API user sync. Empty URL means
	// the feature is off — Google still works, and EnsureUser is a no-op.
	KeycloakURL          string
	KeycloakPublicURL    string
	KeycloakRealm        string
	KeycloakClientID     string
	KeycloakClientSecret string
	KeycloakRedirectURL  string
	KeycloakAdmin        string
	KeycloakAdminPass    string

	// Storage: S3/MinIO when Endpoint is set, otherwise a directory on disk.
	S3Endpoint string
	// S3PublicEndpoint is the host:port stamped into presigned URLs. Inside
	// Docker, S3_ENDPOINT is the internal name (minio:9000) and this is
	// localhost:9000 so the browser can actually fetch the object.
	S3PublicEndpoint string
	S3AccessKey      string
	S3SecretKey      string
	S3UseSSL         bool
	S3Region         string
	ClipsBucket      string
	TakesBucket      string
	DiskRoot         string

	// Where the browser app is served from, for CORS and post-login redirects.
	AppOrigin string

	// The tutor: any OpenAI-compatible chat endpoint — 9router, in the setup
	// this was written for. Empty key means the feature is off, and the app
	// hides the chat rather than offering one that cannot answer.
	TutorAPIURL string
	TutorAPIKey string
	TutorModel  string
	// TutorDailyPerLearner and TutorDailyTotal cap questions in any 24 hours,
	// per learner and from everybody: every one is paid for, and accounts are
	// free. Zero turns a cap off.
	TutorDailyPerLearner int
	TutorDailyTotal      int
}

func Load() (Config, error) {
	c := Config{
		Addr:                 env("ADDR", ":8080"),
		DatabaseURL:          env("DATABASE_URL", ""),
		GoogleClientID:       env("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:   env("GOOGLE_CLIENT_SECRET", ""),
		OAuthRedirectURL:     env("OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback"),
		SessionSecret:        env("SESSION_SECRET", ""),
		AuthFake:             env("AUTH_FAKE", "") == "1",
		RequireVerifiedEmail: env("REQUIRE_VERIFIED_EMAIL", "") == "1",
		AdminEmails:          emailSet(env("ADMIN_EMAILS", "")),
		KeycloakURL:          strings.TrimRight(env("KEYCLOAK_URL", ""), "/"),
		KeycloakPublicURL:    strings.TrimRight(env("KEYCLOAK_PUBLIC_URL", ""), "/"),
		KeycloakRealm:        env("KEYCLOAK_REALM", "shadowline"),
		KeycloakClientID:     env("KEYCLOAK_CLIENT_ID", ""),
		KeycloakClientSecret: env("KEYCLOAK_CLIENT_SECRET", ""),
		KeycloakRedirectURL:  env("KEYCLOAK_REDIRECT_URL", "http://localhost:8080/auth/keycloak/callback"),
		KeycloakAdmin:        env("KEYCLOAK_ADMIN", "admin"),
		KeycloakAdminPass:    env("KEYCLOAK_ADMIN_PASSWORD", ""),
		S3Endpoint:           env("S3_ENDPOINT", ""),
		S3PublicEndpoint:     env("S3_PUBLIC_ENDPOINT", ""),
		S3AccessKey:          env("S3_ACCESS_KEY", ""),
		S3SecretKey:          env("S3_SECRET_KEY", ""),
		S3UseSSL:             env("S3_USE_SSL", "") == "1",
		S3Region:             env("S3_REGION", "us-east-1"),
		ClipsBucket:          env("S3_CLIPS_BUCKET", "clips"),
		TakesBucket:          env("S3_TAKES_BUCKET", "takes"),
		DiskRoot:             env("DISK_ROOT", ""),
		AppOrigin:            env("APP_ORIGIN", "http://localhost:5173"),
		TutorAPIURL:          strings.TrimRight(env("TUTOR_API_URL", "http://localhost:20128/v1"), "/"),
		TutorAPIKey:          env("TUTOR_API_KEY", ""),
		TutorModel:           env("TUTOR_MODEL", ""),
	}
	var err error
	if c.TutorDailyPerLearner, err = envCount("TUTOR_DAILY_PER_LEARNER", 100); err != nil {
		return c, err
	}
	if c.TutorDailyTotal, err = envCount("TUTOR_DAILY_TOTAL", 2000); err != nil {
		return c, err
	}
	if c.KeycloakPublicURL == "" {
		c.KeycloakPublicURL = c.KeycloakURL
	}

	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	if c.SessionSecret == "" {
		return c, fmt.Errorf("SESSION_SECRET is required (32+ random bytes, base64 or hex)")
	}
	if len(c.SessionSecret) < 32 {
		return c, fmt.Errorf("SESSION_SECRET is too short: want at least 32 characters, got %d", len(c.SessionSecret))
	}
	if !c.AuthFake && (c.GoogleClientID == "" || c.GoogleClientSecret == "") {
		return c, fmt.Errorf("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required unless AUTH_FAKE=1")
	}
	if c.KeycloakConfigured() {
		if c.KeycloakClientID == "" || c.KeycloakClientSecret == "" {
			return c, fmt.Errorf("KEYCLOAK_CLIENT_ID and KEYCLOAK_CLIENT_SECRET are required when KEYCLOAK_URL is set")
		}
		if c.KeycloakAdminPass == "" {
			return c, fmt.Errorf("KEYCLOAK_ADMIN_PASSWORD is required when KEYCLOAK_URL is set")
		}
	}
	// The stub signs in anyone as any address, so a deployment that reaches it
	// has no authentication at all. https is the signal: a laptop and a CI
	// runner both speak http, and anything a real browser reaches over TLS is
	// somewhere a stranger can also reach. Refusing to start beats a warning in
	// a log nobody reads.
	if c.AuthFake {
		if origin := httpsOrigin(c.AppOrigin, c.OAuthRedirectURL); origin != "" {
			return c, fmt.Errorf("AUTH_FAKE=1 signs in anyone as any address, and %s is served over https — unset AUTH_FAKE and configure Google OAuth", origin)
		}
	}
	// The same reasoning for the values .env.example and the Keycloak realm ship
	// with: they are in this repository, so on a server anybody can reach they
	// are not secrets. Keycloak's admin console with admin/admin, or the client
	// secret every checkout knows, is the whole login system handed over.
	if origin := httpsOrigin(c.AppOrigin, c.OAuthRedirectURL); origin != "" {
		if shipped := c.shippedSecrets(); len(shipped) > 0 {
			return c, fmt.Errorf("%s is served over https but still uses the example values for %s — set them in .env (and in Keycloak, for its secrets) before starting",
				origin, strings.Join(shipped, ", "))
		}
	}
	// A key with no model is a tutor that would fail on its first message; say so
	// at startup rather than to the first learner who asks it something.
	if c.TutorAPIKey != "" && c.TutorModel == "" {
		return c, fmt.Errorf("TUTOR_MODEL is required when TUTOR_API_KEY is set (a 9router model id such as cc/claude-sonnet-4-5, or a combo name)")
	}
	if c.S3Endpoint == "" && c.DiskRoot == "" {
		return c, fmt.Errorf("set S3_ENDPOINT for object storage, or DISK_ROOT to keep audio on local disk")
	}
	return c, nil
}

// TutorConfigured reports whether the chat tutor has somewhere to send
// messages. Off by default: it spends money per message.
func (c Config) TutorConfigured() bool {
	return c.TutorAPIKey != ""
}

// KeycloakConfigured reports whether email/password login and Admin API sync
// are wired up. Partial env is rejected in Load; empty URL means off.
func (c Config) KeycloakConfigured() bool {
	return c.KeycloakURL != ""
}

// ForgotPasswordURL is the Keycloak-hosted reset form the login screen links to.
func (c Config) ForgotPasswordURL() string {
	if !c.KeycloakConfigured() {
		return ""
	}
	base := c.KeycloakPublicURL
	return base + "/realms/" + c.KeycloakRealm +
		"/login-actions/reset-credentials?client_id=" + url.QueryEscape(c.KeycloakClientID)
}

// httpsOrigin returns the first of these URLs served over https, or "" when
// none is. Compared case-insensitively because a scheme is not case-sensitive.
func httpsOrigin(urls ...string) string {
	for _, u := range urls {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(u)), "https://") {
			return u
		}
	}
	return ""
}

// IsAdmin decides admin rights from the configured list, not from anything the
// client can set. Compared case-insensitively because Google addresses are.
func (c Config) IsAdmin(email string) bool {
	return c.AdminEmails[strings.ToLower(strings.TrimSpace(email))]
}

func emailSet(raw string) map[string]bool {
	out := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		if e := strings.ToLower(strings.TrimSpace(part)); e != "" {
			out[e] = true
		}
	}
	return out
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// shippedSecrets names the settings still holding a value published in this
// repository: .env.example's placeholders and the Keycloak realm's defaults.
func (c Config) shippedSecrets() []string {
	var shipped []string
	if u, err := url.Parse(c.DatabaseURL); err == nil {
		if pw, ok := u.User.Password(); ok && pw == "change-me" {
			shipped = append(shipped, "the database password (DATABASE_URL)")
		}
	}
	if c.S3SecretKey == "change-me" {
		shipped = append(shipped, "S3_SECRET_KEY")
	}
	if c.KeycloakConfigured() {
		if c.KeycloakClientSecret == "shadowline-dev-secret" {
			shipped = append(shipped, "KEYCLOAK_CLIENT_SECRET")
		}
		if c.KeycloakAdminPass == "admin" {
			shipped = append(shipped, "KEYCLOAK_ADMIN_PASSWORD")
		}
	}
	return shipped
}

// envCount reads a whole number of things, zero or more.
func envCount(key string, fallback int) (int, error) {
	raw := env(key, "")
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("%s is %q: want a whole number, 0 for no limit", key, raw)
	}
	return n, nil
}
