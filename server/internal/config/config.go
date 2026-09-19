// Package config reads every knob the server has from the environment, so a
// deployment differs from a laptop only by its .env file.
package config

import (
	"fmt"
	"os"
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
}

func Load() (Config, error) {
	c := Config{
		Addr:               env("ADDR", ":8080"),
		DatabaseURL:        env("DATABASE_URL", ""),
		GoogleClientID:     env("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: env("GOOGLE_CLIENT_SECRET", ""),
		OAuthRedirectURL:   env("OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback"),
		SessionSecret:      env("SESSION_SECRET", ""),
		AuthFake:           env("AUTH_FAKE", "") == "1",
		AdminEmails:        emailSet(env("ADMIN_EMAILS", "")),
		S3Endpoint:       env("S3_ENDPOINT", ""),
		S3PublicEndpoint: env("S3_PUBLIC_ENDPOINT", ""),
		S3AccessKey:      env("S3_ACCESS_KEY", ""),
		S3SecretKey:      env("S3_SECRET_KEY", ""),
		S3UseSSL:         env("S3_USE_SSL", "") == "1",
		S3Region:         env("S3_REGION", "us-east-1"),
		ClipsBucket:      env("S3_CLIPS_BUCKET", "clips"),
		TakesBucket:      env("S3_TAKES_BUCKET", "takes"),
		DiskRoot:         env("DISK_ROOT", ""),
		AppOrigin:        env("APP_ORIGIN", "http://localhost:5173"),
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
	if c.S3Endpoint == "" && c.DiskRoot == "" {
		return c, fmt.Errorf("set S3_ENDPOINT for object storage, or DISK_ROOT to keep audio on local disk")
	}
	return c, nil
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
