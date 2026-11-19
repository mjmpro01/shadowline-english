package notify

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/shadowline/server/internal/db"
	"github.com/shadowline/server/internal/store"
)

// The notifier against a real database, a fake sender and a fixed clock.

type sent struct {
	endpoint string
	note     store.Notification
}

type fixture struct {
	n     *Notifier
	pool  *pgxpool.Pool
	st    *store.Store
	clock time.Time
	mu    sync.Mutex
	sent  []sent
	// status is what the fake push service answers, by endpoint.
	status map[string]int
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()
	adminURL := os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" {
		t.Skip("set TEST_DATABASE_URL to run the notifier against Postgres")
	}
	name := fmt.Sprintf("shadowline_notify_%d", time.Now().UnixNano())
	admin, err := db.Open(ctx, adminURL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec(ctx, "create database "+name); err != nil {
		t.Fatal(err)
	}
	admin.Close()
	u, _ := url.Parse(adminURL)
	u.Path = "/" + name
	pool, err := db.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		if a, err := db.Open(context.Background(), adminURL); err == nil {
			_, _ = a.Exec(context.Background(), "drop database if exists "+name)
			a.Close()
		}
	})
	f := &fixture{pool: pool, st: store.New(pool), status: map[string]int{}}
	f.n = &Notifier{
		Store: f.st, Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now: func() time.Time { return f.clock },
		Send: func(_ context.Context, sub store.Subscription, payload []byte) (int, error) {
			var note store.Notification
			if err := json.Unmarshal(payload, &note); err != nil {
				return 0, err
			}
			f.mu.Lock()
			defer f.mu.Unlock()
			f.sent = append(f.sent, sent{sub.Endpoint, note})
			if s, ok := f.status[sub.Endpoint]; ok {
				return s, nil
			}
			return http.StatusCreated, nil
		},
	}
	return f
}

// learner is someone with reminders on at 20:00 Hanoi, and one browser.
func (f *fixture) learner(t *testing.T, email string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var id uuid.UUID
	if err := f.pool.QueryRow(ctx, `insert into users (email) values ($1) returning id`, email).Scan(&id); err != nil {
		t.Fatal(err)
	}
	prefs := store.DefaultReminderPrefs
	prefs.Enabled = true
	if err := f.st.SaveReminderPrefs(ctx, id, prefs); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SaveSubscription(ctx, id, "https://push.example/"+email, "key", "auth", "test"); err != nil {
		t.Fatal(err)
	}
	return id
}

func (f *fixture) run(t *testing.T, hhmm string) []sent {
	t.Helper()
	tm, _ := time.Parse("15:04", hhmm)
	f.clock = time.Date(2026, 11, 20, tm.Hour(), tm.Minute(), 0, 0, hanoi)
	f.mu.Lock()
	f.sent = nil
	f.mu.Unlock()
	if err := f.n.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	return f.sent
}

func TestAReminderGoesOutAtTheTimeChosenAndOnlyOnce(t *testing.T) {
	f := newFixture(t)
	id := f.learner(t, "a@example.com")

	if got := f.run(t, "19:59"); len(got) != 0 {
		t.Fatalf("before the time: %+v", got)
	}
	got := f.run(t, "20:00")
	if len(got) != 1 || got[0].note.Kind != string(Goal) || !strings.Contains(got[0].note.Body, "20 điểm") {
		t.Fatalf("at the time: %+v", got)
	}
	if !strings.HasPrefix(got[0].note.URL, "/dashboard?from=push&n=") {
		t.Fatalf("the link: %q", got[0].note.URL)
	}
	if again := f.run(t, "20:05"); len(again) != 0 {
		t.Fatalf("sent twice: %+v", again)
	}
	var kept int
	if err := f.pool.QueryRow(context.Background(), `select count(*) from notifications_sent where user_id = $1`, id).Scan(&kept); err != nil || kept != 1 {
		t.Fatalf("kept %d, %v", kept, err)
	}
}

func TestNoReminderOnceTheGoalIsReachedOrRemindersAreOff(t *testing.T) {
	f := newFixture(t)
	reached := f.learner(t, "done@example.com")
	off := f.learner(t, "off@example.com")
	ctx := context.Background()
	// Earlier that day in Hanoi: enough takes for the default goal.
	f.clock = time.Date(2026, 11, 20, 9, 0, 0, 0, hanoi)
	for range 10 {
		if _, err := f.st.LogActivity(ctx, reached, store.ActTake, f.clock); err != nil {
			t.Fatal(err)
		}
	}
	prefs := store.DefaultReminderPrefs
	if err := f.st.SaveReminderPrefs(ctx, off, prefs); err != nil {
		t.Fatal(err)
	}
	if got := f.run(t, "20:30"); len(got) != 0 {
		t.Fatalf("reminded anyway: %+v", got)
	}
}

func TestAGoneBrowserIsForgottenAndAFailingOneLeftAlone(t *testing.T) {
	f := newFixture(t)
	id := f.learner(t, "b@example.com")
	ctx := context.Background()
	if err := f.st.SaveSubscription(ctx, id, "https://push.example/flaky", "k", "a", "test"); err != nil {
		t.Fatal(err)
	}
	f.status["https://push.example/b@example.com"] = http.StatusGone
	f.status["https://push.example/flaky"] = http.StatusInternalServerError

	if got := f.run(t, "20:00"); len(got) != 2 {
		t.Fatalf("sent to %d browsers, want 2", len(got))
	}
	subs, err := f.st.Subscriptions(ctx, id)
	if err != nil || len(subs) != 1 || subs[0].Endpoint != "https://push.example/flaky" {
		t.Fatalf("after a 410: %+v %v", subs, err)
	}
	if _, err := f.pool.Exec(ctx, `update push_subscriptions set failures = $1`, store.MaxPushFailures); err != nil {
		t.Fatal(err)
	}
	if subs, _ := f.st.Subscriptions(ctx, id); len(subs) != 0 {
		t.Fatal("a browser that kept failing is still sent to")
	}
}

func TestNewEpisodesOfFollowedSeriesComeInOneReminder(t *testing.T) {
	f := newFixture(t)
	id := f.learner(t, "c@example.com")
	ctx := context.Background()
	// A later reminder time, so the evening's new episodes go first.
	prefs := store.DefaultReminderPrefs
	prefs.Enabled, prefs.RemindAt = true, "21:00"
	if err := f.st.SaveReminderPrefs(ctx, id, prefs); err != nil {
		t.Fatal(err)
	}
	var playlist uuid.UUID
	if err := f.pool.QueryRow(ctx, `insert into playlists (slug, title) values ('friends', 'Friends') returning id`).Scan(&playlist); err != nil {
		t.Fatal(err)
	}
	f.clock = time.Date(2026, 11, 20, 18, 0, 0, 0, hanoi)
	for i := range 2 {
		var source uuid.UUID
		if err := f.pool.QueryRow(ctx, `
			insert into clip_sources (playlist_id, name, title, key, content_type, published, published_at)
			values ($1, $2, $2, $2, 'video/mp4', true, $3) returning id`,
			playlist, fmt.Sprintf("e%d.mp4", i), f.clock.Add(-time.Hour)).Scan(&source); err != nil {
			t.Fatal(err)
		}
		if _, err := f.pool.Exec(ctx, `insert into clips (title, source_id, playlist_id) values ('Clip', $1, $2)`, source, playlist); err != nil {
			t.Fatal(err)
		}
	}
	// Not followed: nothing.
	if got := f.run(t, "18:05"); len(got) != 0 {
		t.Fatalf("new episodes of a series not followed: %+v", got)
	}
	if err := f.st.SetFollow(ctx, id, playlist, true); err != nil {
		t.Fatal(err)
	}
	got := f.run(t, "18:10")
	if len(got) != 1 || got[0].note.Kind != string(NewEpisode) || got[0].note.Title != "Friends có 2 tập mới" {
		t.Fatalf("one reminder for both: %+v", got)
	}
}

func TestATestReminderAlwaysGoesOut(t *testing.T) {
	f := newFixture(t)
	id := f.learner(t, "d@example.com")
	f.clock = time.Date(2026, 11, 20, 23, 0, 0, 0, hanoi)
	for range 2 {
		n, err := f.n.SendTest(context.Background(), id)
		if err != nil || n != 1 {
			t.Fatalf("test reminder: %d %v", n, err)
		}
	}
	if !strings.Contains(f.sent[0].note.Title, "Shadowline") {
		t.Fatalf("the test: %+v", f.sent[0].note)
	}
}

// The real sender, end to end: a browser's keys, an encrypted body, and the
// server's VAPID signature, to a push service that answers 201 and then 410.
func TestTheWebPushSenderSignsAndEncrypts(t *testing.T) {
	browser, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	var calls int
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		body, _ := io.ReadAll(r.Body)
		if !strings.HasPrefix(r.Header.Get("Authorization"), "vapid t=") || r.Header.Get("Content-Encoding") != "aes128gcm" ||
			len(body) == 0 || strings.Contains(string(body), "secret words") || r.Header.Get("TTL") == "" {
			t.Errorf("not a signed, encrypted push: %v %q", r.Header, body)
		}
		if calls == 1 {
			w.WriteHeader(http.StatusCreated)
			return
		}
		w.WriteHeader(http.StatusGone)
	}))
	defer service.Close()

	send := WebPush(public, private, "mailto:admin@example.com", service.Client())
	sub := store.Subscription{
		Endpoint: service.URL + "/push/abc",
		P256dh:   base64.RawURLEncoding.EncodeToString(browser.PublicKey().Bytes()),
		Auth:     base64.RawURLEncoding.EncodeToString(auth),
	}
	if status, err := send(context.Background(), sub, []byte(`{"title":"secret words"}`)); err != nil || status != http.StatusCreated {
		t.Fatalf("first: %d %v", status, err)
	}
	if status, err := send(context.Background(), sub, []byte(`{}`)); err != nil || status != http.StatusGone {
		t.Fatalf("second: %d %v", status, err)
	}
}
