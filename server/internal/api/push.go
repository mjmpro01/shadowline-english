package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/notify"
	"github.com/shadowline/server/internal/store"
)

// Study reminders by Web Push: the browser subscribes with the server's public
// key, the learner says when to be reminded, and the notifier does the rest.
// Without VAPID keys every route here answers 404 and the app does not offer
// reminders at all.

// notifier is the sender as the API uses it: for the test reminder.
func (s *Server) notifier() *notify.Notifier {
	send := s.PushSend
	if send == nil && s.Cfg.PushConfigured() {
		send = notify.WebPush(s.Cfg.VAPIDPublicKey, s.Cfg.VAPIDPrivateKey, s.Cfg.VAPIDSubject, nil)
	}
	return &notify.Notifier{Store: s.Store, Send: send, Log: s.Log}
}

// pushOn answers 404 and false when push is off on this server.
func (s *Server) pushOn(w http.ResponseWriter) bool {
	if !s.Cfg.PushConfigured() {
		failCode(w, http.StatusNotFound, "push.off", "reminders are not set up on this server")
		return false
	}
	return true
}

func (s *Server) handlePushKey(w http.ResponseWriter, r *http.Request) {
	if !s.pushOn(w) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"publicKey": s.Cfg.VAPIDPublicKey})
}

type subscriptionBody struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

func (s *Server) handleSubscribe(w http.ResponseWriter, r *http.Request) {
	if !s.pushOn(w) {
		return
	}
	u, _ := auth.UserFrom(r.Context())
	var body subscriptionBody
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	// A push service's address is https, and never one of ours.
	if !strings.HasPrefix(body.Endpoint, "https://") || len(body.Endpoint) > 2000 ||
		body.Keys.P256dh == "" || body.Keys.Auth == "" || len(body.Keys.P256dh) > 200 || len(body.Keys.Auth) > 100 {
		failCode(w, http.StatusBadRequest, "push.invalid", "that is not a browser's push subscription")
		return
	}
	if err := s.Store.SaveSubscription(r.Context(), u.ID, body.Endpoint, body.Keys.P256dh, body.Keys.Auth, r.UserAgent()); err != nil {
		s.failErr(w, err, "save a subscription")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body subscriptionBody
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.DeleteSubscription(r.Context(), u.ID, body.Endpoint); err != nil {
		s.failErr(w, err, "delete a subscription")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// remindersJSON is the learner's settings, and whether any browser of theirs
// is subscribed.
type remindersJSON struct {
	store.ReminderPrefs
	Subscribed bool `json:"subscribed"`
}

func (s *Server) handleReminders(w http.ResponseWriter, r *http.Request) {
	if !s.pushOn(w) {
		return
	}
	u, _ := auth.UserFrom(r.Context())
	prefs, err := s.Store.ReminderPrefs(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "reminders")
		return
	}
	subscribed, err := s.Store.Subscribed(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "reminders")
		return
	}
	writeJSON(w, http.StatusOK, remindersJSON{prefs, subscribed})
}

func (s *Server) handleSaveReminders(w http.ResponseWriter, r *http.Request) {
	if !s.pushOn(w) {
		return
	}
	u, _ := auth.UserFrom(r.Context())
	var body store.ReminderPrefs
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.SaveReminderPrefs(r.Context(), u.ID, body); err != nil {
		if errors.Is(err, store.ErrBadReminder) {
			failCode(w, http.StatusBadRequest, "reminders.invalid", err.Error())
			return
		}
		s.failErr(w, err, "save reminders")
		return
	}
	s.handleReminders(w, r)
}

func (s *Server) handleDismissReminderPrompt(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	if err := s.Store.DismissReminderPrompt(r.Context(), u.ID); err != nil {
		s.failErr(w, err, "dismiss the reminder prompt")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePushTest(w http.ResponseWriter, r *http.Request) {
	if !s.pushOn(w) {
		return
	}
	u, _ := auth.UserFrom(r.Context())
	n, err := s.notifier().SendTest(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "send a test reminder")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"delivered": n})
}

func (s *Server) handlePushOpened(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		ID uuid.UUID `json:"id"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.NotificationOpened(r.Context(), u.ID, body.ID); err != nil {
		s.failErr(w, err, "a reminder opened")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
