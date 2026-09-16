package api_test

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/shadowline/server/internal/api"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/config"
	"github.com/shadowline/server/internal/db"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// These tests run against a real Postgres, not a stand-in: the schema uses
// arrays, jsonb, enums and `for update skip locked`, none of which an in-memory
// substitute would reproduce faithfully enough to be worth trusting.
//
// Point TEST_DATABASE_URL at a database the test may create databases in.
func testDatabaseURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run API tests against Postgres")
	}
	return url
}

type harness struct {
	t        *testing.T
	server   *httptest.Server
	store    *store.Store
	blobs    storage.Storage
	diskRoot string
}

// newHarness builds a server on its own freshly created database, so tests
// neither see each other's rows nor depend on the order they run in.
func newHarness(t *testing.T) *harness {
	t.Helper()
	ctx := context.Background()
	adminURL := testDatabaseURL(t)

	name := fmt.Sprintf("shadowline_test_%d", time.Now().UnixNano())
	admin, err := db.Open(ctx, adminURL)
	if err != nil {
		t.Fatalf("connect to %s: %v", adminURL, err)
	}
	if _, err := admin.Exec(ctx, "create database "+name); err != nil {
		admin.Close()
		t.Fatalf("create test database: %v", err)
	}
	admin.Close()

	dsn := replaceDatabase(adminURL, name)
	pool, err := db.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	st := store.New(pool)
	signer := auth.NewSigner(strings.Repeat("k", 32))
	diskRoot := t.TempDir()
	blobs, err := storage.NewDisk(diskRoot, "http://127.0.0.1/files",
		func(b storage.Bucket, key string, exp time.Time) string {
			return signer.SignPath(string(b), key, exp)
		})
	if err != nil {
		t.Fatalf("disk storage: %v", err)
	}

	cfg := config.Config{
		SessionSecret:    strings.Repeat("k", 32),
		AuthFake:         true,
		AdminEmails:      map[string]bool{"admin@example.com": true},
		OAuthRedirectURL: "http://127.0.0.1/auth/google/callback",
		AppOrigin:        "http://localhost:5173",
		DiskRoot:         "unused",
	}

	srv := &api.Server{
		Cfg:      cfg,
		Store:    st,
		Storage:  blobs,
		Sessions: &auth.Manager{Store: st},
		Signer:   signer,
		Provider: auth.NewFakeProvider(cfg.OAuthRedirectURL),
		Log:      slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(func() {
		ts.Close()
		pool.Close()
		// The database is left behind on purpose when a test fails: being able
		// to open it afterwards is worth more than a tidy server.
		if !t.Failed() {
			if a, err := db.Open(ctx, adminURL); err == nil {
				_, _ = a.Exec(ctx, "drop database "+name+" with (force)")
				a.Close()
			}
		}
	})

	return &harness{t: t, server: ts, store: st, blobs: blobs, diskRoot: diskRoot}
}

func replaceDatabase(dsn, name string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	u.Path = "/" + name
	return u.String()
}

// client is a signed-in browser: a cookie jar plus the helpers the tests use.
type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func (h *harness) anonymous() *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: h.t, base: h.server.URL, http: &http.Client{
		Jar: jar,
		// Stop at the redirect so a test can assert where it points.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

// login walks the whole OAuth round trip against the fake provider, rather than
// inserting a session row: the handler's state and PKCE checks are part of what
// these tests are for.
func (h *harness) login(email string) *client {
	h.t.Helper()
	c := h.anonymous()

	resp := c.do("GET", "/auth/google/start?email="+url.QueryEscape(email), "", nil)
	if resp.StatusCode != http.StatusFound {
		h.t.Fatalf("auth start: got %d, want 302", resp.StatusCode)
	}
	location := resp.Header.Get("Location")
	resp.Body.Close()

	u, err := url.Parse(location)
	if err != nil {
		h.t.Fatalf("parse callback url %q: %v", location, err)
	}
	resp = c.do("GET", "/auth/google/callback?"+u.RawQuery, "", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		h.t.Fatalf("auth callback: got %d, want 302", resp.StatusCode)
	}
	return c
}

func (c *client) do(method, path, contentType string, body io.Reader) *http.Response {
	c.t.Helper()
	req, err := http.NewRequest(method, c.base+path, body)
	if err != nil {
		c.t.Fatalf("build request: %v", err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	return resp
}

func (c *client) json(method, path string, body any) *http.Response {
	c.t.Helper()
	if body == nil {
		return c.do(method, path, "", nil)
	}
	raw, err := json.Marshal(body)
	if err != nil {
		c.t.Fatalf("encode body: %v", err)
	}
	return c.do(method, path, "application/json", strings.NewReader(string(raw)))
}

// expect asserts the status and decodes the body, failing with the server's own
// error message rather than a bare status code.
func expect[T any](t *testing.T, resp *http.Response, want int) T {
	t.Helper()
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		t.Fatalf("got %d, want %d: %s", resp.StatusCode, want, strings.TrimSpace(string(raw)))
	}
	var out T
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("decode %T: %v (body: %s)", out, err, raw)
		}
	}
	return out
}

func expectStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		t.Fatalf("got %d, want %d: %s", resp.StatusCode, want, strings.TrimSpace(string(raw)))
	}
}

// countObjects walks the disk-storage root. Object storage is where audio is
// meant to be deleted as well as written, and counting files is the only way to
// prove a delete actually happened.
func countObjects(t *testing.T, h *harness) int {
	t.Helper()
	n := 0
	err := filepath.WalkDir(h.diskRoot, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			n++
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk object store: %v", err)
	}
	return n
}

// silentWAV builds a 16-bit mono WAV of the given length. The contents do not
// matter to the API — only the worker looks inside — so silence keeps the tests
// fast and their intent clear.
func silentWAV(seconds float64) []byte {
	const rate = 16000
	samples := int(seconds * rate)
	dataLen := samples * 2

	var b bytes.Buffer
	b.WriteString("RIFF")
	binary.Write(&b, binary.LittleEndian, uint32(36+dataLen))
	b.WriteString("WAVEfmt ")
	binary.Write(&b, binary.LittleEndian, uint32(16))   // PCM chunk size
	binary.Write(&b, binary.LittleEndian, uint16(1))    // PCM
	binary.Write(&b, binary.LittleEndian, uint16(1))    // mono
	binary.Write(&b, binary.LittleEndian, uint32(rate)) // sample rate
	binary.Write(&b, binary.LittleEndian, uint32(rate*2))
	binary.Write(&b, binary.LittleEndian, uint16(2))  // block align
	binary.Write(&b, binary.LittleEndian, uint16(16)) // bits
	b.WriteString("data")
	binary.Write(&b, binary.LittleEndian, uint32(dataLen))
	b.Write(make([]byte, dataLen))
	return b.Bytes()
}
