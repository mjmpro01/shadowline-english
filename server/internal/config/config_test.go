package config_test

import (
	"strings"
	"testing"

	"github.com/shadowline/server/internal/config"
)

// A minimal environment that Load accepts, for tests to vary one key at a time.
func base(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://localhost/shadowline")
	t.Setenv("SESSION_SECRET", strings.Repeat("k", 32))
	t.Setenv("DISK_ROOT", "/tmp/shadowline-blobs")
	t.Setenv("GOOGLE_CLIENT_ID", "")
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	t.Setenv("AUTH_FAKE", "")
	t.Setenv("APP_ORIGIN", "")
	t.Setenv("OAUTH_REDIRECT_URL", "")
	t.Setenv("KEYCLOAK_URL", "")
	t.Setenv("KEYCLOAK_CLIENT_ID", "")
	t.Setenv("KEYCLOAK_CLIENT_SECRET", "")
	t.Setenv("KEYCLOAK_ADMIN_PASSWORD", "")
}

func TestGoogleCredentialsAreRequiredForTheRealProvider(t *testing.T) {
	base(t)

	if _, err := config.Load(); err == nil {
		t.Fatal("started with no Google credentials and no AUTH_FAKE")
	}

	t.Setenv("GOOGLE_CLIENT_ID", "id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "secret")
	if _, err := config.Load(); err != nil {
		t.Fatalf("configured credentials were refused: %v", err)
	}
}

// AUTH_FAKE signs in anyone as any address. It has to keep working on a laptop
// and in CI, which is what the browser tests run against.
func TestTheFakeProviderIsAllowedOverHTTP(t *testing.T) {
	base(t)
	t.Setenv("AUTH_FAKE", "1")
	t.Setenv("APP_ORIGIN", "http://localhost:5173")
	t.Setenv("OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("AUTH_FAKE=1 over http was refused: %v", err)
	}
	if !cfg.AuthFake {
		t.Fatal("AUTH_FAKE=1 did not enable the fake provider")
	}
}

// The other half of that bargain: anything reachable over TLS is reachable by
// strangers, so the server must refuse to start rather than authenticate nobody.
func TestTheFakeProviderIsRefusedOverHTTPS(t *testing.T) {
	for _, tc := range []struct{ name, key, value string }{
		{"app origin", "APP_ORIGIN", "https://shadowline.example.com"},
		{"redirect url", "OAUTH_REDIRECT_URL", "https://api.shadowline.example.com/auth/google/callback"},
		{"uppercase scheme", "APP_ORIGIN", "HTTPS://shadowline.example.com"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base(t)
			t.Setenv("AUTH_FAKE", "1")
			t.Setenv(tc.key, tc.value)

			_, err := config.Load()
			if err == nil {
				t.Fatalf("AUTH_FAKE=1 started with %s=%s", tc.key, tc.value)
			}
			// The message has to name the flag, or whoever hits this at deploy
			// time cannot tell what to unset.
			if !strings.Contains(err.Error(), "AUTH_FAKE") {
				t.Fatalf("refusal does not mention AUTH_FAKE: %v", err)
			}
		})
	}
}

func TestAdminIsCaseInsensitive(t *testing.T) {
	base(t)
	t.Setenv("AUTH_FAKE", "1")
	t.Setenv("ADMIN_EMAILS", " Admin@Example.com , second@example.com")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	for _, email := range []string{"admin@example.com", "ADMIN@EXAMPLE.COM", " admin@example.com "} {
		if !cfg.IsAdmin(email) {
			t.Errorf("IsAdmin(%q) = false, want true", email)
		}
	}
	if cfg.IsAdmin("learner@example.com") {
		t.Error("an address outside ADMIN_EMAILS was granted admin")
	}
}

// The example values in .env.example and the Keycloak realm are published with
// the code: over https they are refused, and over http — a laptop, CI — kept.
func TestTheRepositorysExampleSecretsAreRefusedOverHTTPS(t *testing.T) {
	base(t)
	t.Setenv("GOOGLE_CLIENT_ID", "id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "secret")
	t.Setenv("DATABASE_URL", "postgres://shadowline:change-me@postgres:5432/shadowline")
	t.Setenv("S3_SECRET_KEY", "change-me")
	t.Setenv("KEYCLOAK_URL", "http://keycloak:8080")
	t.Setenv("KEYCLOAK_CLIENT_ID", "shadowline-api")
	t.Setenv("KEYCLOAK_CLIENT_SECRET", "shadowline-dev-secret")
	t.Setenv("KEYCLOAK_ADMIN_PASSWORD", "admin")

	t.Setenv("APP_ORIGIN", "http://localhost:5173")
	if _, err := config.Load(); err != nil {
		t.Fatalf("the examples were refused on a laptop: %v", err)
	}

	t.Setenv("APP_ORIGIN", "https://shadowline.example.com")
	_, err := config.Load()
	if err == nil {
		t.Fatal("started over https with the example secrets")
	}
	for _, named := range []string{"DATABASE_URL", "S3_SECRET_KEY", "KEYCLOAK_CLIENT_SECRET", "KEYCLOAK_ADMIN_PASSWORD"} {
		if !strings.Contains(err.Error(), named) {
			t.Errorf("the refusal does not name %s: %v", named, err)
		}
	}

	t.Setenv("DATABASE_URL", "postgres://shadowline:a-real-one@postgres:5432/shadowline")
	t.Setenv("S3_SECRET_KEY", "another-real-one")
	t.Setenv("KEYCLOAK_CLIENT_SECRET", "and-another")
	t.Setenv("KEYCLOAK_ADMIN_PASSWORD", "and-one-more")
	if _, err := config.Load(); err != nil {
		t.Fatalf("real secrets over https were refused: %v", err)
	}
}
