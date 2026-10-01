package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/shadowline/server/internal/keycloak"
	"github.com/shadowline/server/internal/store"
)

type passwordBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// handlePasswordLogin signs in with email/password via Keycloak, then issues
// the same session cookie Google login uses.
func (s *Server) handlePasswordLogin(w http.ResponseWriter, r *http.Request) {
	if s.Users == nil {
		fail(w, http.StatusServiceUnavailable, "email login is not configured")
		return
	}
	var body passwordBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "invalid body")
		return
	}
	email := strings.TrimSpace(strings.ToLower(body.Email))
	if email == "" || body.Password == "" {
		fail(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if !s.limits.authAttempts.allow(r.RemoteAddr) || s.limits.loginFailures.full(email) {
		tooMany(w, "too many sign-in attempts — wait a few minutes and try again")
		return
	}

	login, err := s.Users.PasswordLogin(r.Context(), email, body.Password)
	if errors.Is(err, keycloak.ErrInvalidCredentials) {
		s.limits.loginFailures.add(email)
		fail(w, http.StatusUnauthorized, "wrong email or password")
		return
	}
	if err != nil {
		s.failErr(w, err, "keycloak password login")
		return
	}
	s.issuePasswordSession(w, r, email, login.Name, login.Verified)
}

// handlePasswordRegister creates the Keycloak user and a Shadowline session.
func (s *Server) handlePasswordRegister(w http.ResponseWriter, r *http.Request) {
	if s.Users == nil {
		fail(w, http.StatusServiceUnavailable, "email registration is not configured")
		return
	}
	var body passwordBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "invalid body")
		return
	}
	email := strings.TrimSpace(strings.ToLower(body.Email))
	if email == "" || body.Password == "" {
		fail(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if len(body.Password) < 8 {
		fail(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if !s.limits.authAttempts.allow(r.RemoteAddr) || !s.limits.registrations.allow(r.RemoteAddr) {
		tooMany(w, "too many new accounts from here — try again later")
		return
	}

	// An address that already has an account is that account's, however it
	// was made: registering it again used to sign the registrant in to it. Its
	// owner adds a password with "forgot password", which mails the address.
	if _, err := s.Store.UserByEmail(r.Context(), email); err == nil {
		fail(w, http.StatusConflict, existingAccount)
		return
	} else if !errors.Is(err, store.ErrNotFound) {
		s.failErr(w, err, "check account")
		return
	}

	if err := s.Users.Register(r.Context(), email, body.Password, body.Name); errors.Is(err, keycloak.ErrConflict) {
		fail(w, http.StatusConflict, existingAccount)
		return
	} else if err != nil {
		s.failErr(w, err, "keycloak register")
		return
	}

	if s.Cfg.RequireVerifiedEmail {
		// No session until the address is confirmed: the mail is the proof.
		redirect := strings.TrimRight(s.Cfg.AppOrigin, "/") + "/login"
		s.limits.mails.add(email)
		if err := s.Users.SendVerifyEmail(r.Context(), email, redirect); err != nil {
			s.failErr(w, err, "send verification email")
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"verify": true})
		return
	}
	s.issuePasswordSession(w, r, email, body.Name, false)
}

const existingAccount = "an account with that email already exists — sign in, or use “forgot password” to set a password for it"

// handlePasswordForgot always answers 204 so the form cannot probe which
// addresses are registered.
func (s *Server) handlePasswordForgot(w http.ResponseWriter, r *http.Request) {
	if s.Users == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var body passwordBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "invalid body")
		return
	}
	email := strings.TrimSpace(strings.ToLower(body.Email))
	if !s.limits.authAttempts.allow(r.RemoteAddr) {
		tooMany(w, "too many requests — wait a few minutes and try again")
		return
	}
	// Past its allowance an address gets no more mail, and the answer is the
	// same 204: saying otherwise would say the address exists.
	if !s.limits.mails.allow(email) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	redirect := strings.TrimRight(s.Cfg.AppOrigin, "/") + "/login"
	if err := s.Users.SendResetPassword(r.Context(), email, redirect); err != nil {
		// Still 204: revealing Keycloak mail failures would leak that the
		// address exists, and the learner can try again.
		s.Log.Warn("keycloak reset email failed", "email", email, "error", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) issuePasswordSession(w http.ResponseWriter, r *http.Request, email, name string, verified bool) {
	if ok, err := s.admits(r.Context(), email, verified); err != nil {
		s.failErr(w, err, "check account")
		return
	} else if !ok {
		fail(w, http.StatusForbidden, "confirm your email address first — use “forgot password” to get a link sent to it")
		return
	}
	user, err := s.Store.UpsertUser(r.Context(), email, name, s.owner(email, verified), verified)
	if err != nil {
		s.failErr(w, err, "upsert user")
		return
	}
	if user.SuspendedAt != nil {
		fail(w, http.StatusForbidden, "this account has been suspended")
		return
	}
	if err := s.Sessions.Issue(r.Context(), w, user.ID); err != nil {
		s.failErr(w, err, "issue session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": s.profileOf(r.Context(), user)})
}
