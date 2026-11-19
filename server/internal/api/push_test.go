package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/store"
)

// Study reminders: the browser's subscription, the learner's settings, a test
// reminder, and the console's figures.

type remindersBody struct {
	Enabled         bool   `json:"enabled"`
	RemindAt        string `json:"remindAt"`
	TZ              string `json:"tz"`
	Locale          string `json:"locale"`
	Streak          bool   `json:"streak"`
	NewEpisodes     bool   `json:"newEpisodes"`
	PromptDismissed bool   `json:"promptDismissed"`
	Subscribed      bool   `json:"subscribed"`
}

func subscription(endpoint string) map[string]any {
	return map[string]any{"endpoint": endpoint, "keys": map[string]string{"p256dh": "BKey", "auth": "auth"}}
}

// withPush turns push on for the harness, with a sender that records what it
// was given.
func (h *harness) withPush() *[]string {
	h.srv.Cfg.VAPIDPublicKey, h.srv.Cfg.VAPIDPrivateKey, h.srv.Cfg.VAPIDSubject = "pub", "priv", "mailto:a@example.com"
	var got []string
	h.srv.PushSend = func(_ context.Context, sub store.Subscription, payload []byte) (int, error) {
		var note store.Notification
		_ = json.Unmarshal(payload, &note)
		got = append(got, sub.Endpoint+" "+note.Kind)
		return http.StatusCreated, nil
	}
	return &got
}

func TestRemindersAreOffWithoutKeys(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	expectCode(t, learner.json("GET", "/api/push/key", nil), http.StatusNotFound, "push.off")
	expectCode(t, learner.json("POST", "/api/push/subscribe", subscription("https://push.example/a")), http.StatusNotFound, "push.off")
	expectCode(t, learner.json("GET", "/api/reminders", nil), http.StatusNotFound, "push.off")
}

func TestALearnerTurnsRemindersOnAndIsSentATest(t *testing.T) {
	h := newHarness(t)
	got := h.withPush()
	learner := h.login("learner@example.com")

	key := expect[map[string]string](t, learner.json("GET", "/api/push/key", nil), http.StatusOK)
	if key["publicKey"] != "pub" {
		t.Fatalf("key: %+v", key)
	}
	prefs := expect[remindersBody](t, learner.json("GET", "/api/reminders", nil), http.StatusOK)
	if prefs.Enabled || prefs.RemindAt != "20:00" || prefs.TZ != "Asia/Ho_Chi_Minh" || prefs.Subscribed {
		t.Fatalf("defaults: %+v", prefs)
	}

	expectCode(t, learner.json("POST", "/api/push/subscribe", subscription("http://push.example/a")), http.StatusBadRequest, "push.invalid")
	expectStatus(t, learner.json("POST", "/api/push/subscribe", subscription("https://push.example/a")), http.StatusNoContent)
	// The same browser again replaces itself rather than adding a second.
	expectStatus(t, learner.json("POST", "/api/push/subscribe", subscription("https://push.example/a")), http.StatusNoContent)

	for _, bad := range []map[string]any{
		{"enabled": true, "remindAt": "25:00", "tz": "Asia/Ho_Chi_Minh", "locale": "vi"},
		{"enabled": true, "remindAt": "20:00", "tz": "Mars/Base", "locale": "vi"},
		{"enabled": true, "remindAt": "20:00", "tz": "Asia/Ho_Chi_Minh", "locale": "fr"},
	} {
		expectCode(t, learner.json("PUT", "/api/reminders", bad), http.StatusBadRequest, "reminders.invalid")
	}
	prefs = expect[remindersBody](t, learner.json("PUT", "/api/reminders", map[string]any{
		"enabled": true, "remindAt": "07:30", "tz": "Europe/London", "locale": "en", "streak": false, "newEpisodes": true,
	}), http.StatusOK)
	if !prefs.Enabled || prefs.RemindAt != "07:30" || prefs.TZ != "Europe/London" || prefs.Locale != "en" || prefs.Streak || !prefs.Subscribed {
		t.Fatalf("saved: %+v", prefs)
	}

	sent := expect[map[string]int](t, learner.json("POST", "/api/push/test", nil), http.StatusOK)
	if sent["delivered"] != 1 || len(*got) != 1 || (*got)[0] != "https://push.example/a test" {
		t.Fatalf("test reminder: %+v %v", sent, *got)
	}

	// The reminder is the learner's to open, and nobody else's.
	var id uuid.UUID
	if err := h.pool.QueryRow(context.Background(), `select id from notifications_sent`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	other := h.login("other@example.com")
	expectStatus(t, other.json("POST", "/api/push/opened", map[string]any{"id": id}), http.StatusNotFound)
	expectStatus(t, learner.json("POST", "/api/push/opened", map[string]any{"id": id}), http.StatusNoContent)

	day := expect[struct {
		RemindersOn bool `json:"remindersOn"`
	}](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if !day.RemindersOn {
		t.Fatal("today does not know reminders are on")
	}

	// Unsubscribed, reminders have nowhere to go.
	expectStatus(t, learner.json("DELETE", "/api/push/subscribe", map[string]any{"endpoint": "https://push.example/a"}), http.StatusNoContent)
	if prefs := expect[remindersBody](t, learner.json("GET", "/api/reminders", nil), http.StatusOK); prefs.Subscribed {
		t.Fatal("still subscribed")
	}
}

func TestTheTurnOnPromptIsDismissedForGood(t *testing.T) {
	h := newHarness(t)
	h.withPush()
	learner := h.login("learner@example.com")
	expectStatus(t, learner.json("POST", "/api/reminders/prompt-dismissed", nil), http.StatusNoContent)
	day := expect[struct {
		Dismissed bool `json:"reminderPromptDismissed"`
	}](t, learner.json("GET", "/api/today", nil), http.StatusOK)
	if !day.Dismissed {
		t.Fatal("the prompt comes back")
	}
}

func TestTheConsoleSeesHowRemindersDo(t *testing.T) {
	h := newHarness(t)
	h.withPush()
	learner := h.login("learner@example.com")
	admin := h.login("admin@example.com")
	expectStatus(t, learner.json("POST", "/api/push/subscribe", subscription("https://push.example/a")), http.StatusNoContent)
	expectStatus(t, learner.json("PUT", "/api/reminders", map[string]any{
		"enabled": true, "remindAt": "20:00", "tz": "Asia/Ho_Chi_Minh", "locale": "vi", "streak": true, "newEpisodes": true,
	}), http.StatusOK)
	id := h.userID(t, "learner@example.com")
	if _, err := h.pool.Exec(context.Background(), `
		insert into notifications_sent (user_id, kind, day, title, body, url, opened_at)
		values ($1, 'goal', current_date, 't', 'b', '/', now()), ($1, 'streak', current_date, 't', 'b', '/', null)`, id); err != nil {
		t.Fatal(err)
	}
	got := expect[struct {
		Push struct {
			Subscribers int `json:"subscribers"`
			Kinds       []struct {
				Kind   string `json:"kind"`
				Sent   int    `json:"sent"`
				Opened int    `json:"opened"`
			} `json:"kinds"`
		} `json:"push"`
	}](t, admin.json("GET", "/api/admin/growth", nil), http.StatusOK)
	if got.Push.Subscribers != 1 || len(got.Push.Kinds) != 2 || got.Push.Kinds[0].Kind != "goal" || got.Push.Kinds[0].Opened != 1 {
		t.Fatalf("push figures: %+v", got.Push)
	}
}
