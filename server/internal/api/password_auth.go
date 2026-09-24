package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/shadowline/server/internal/keycloak"
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

	name, err := s.Users.PasswordLogin(r.Context(), email, body.Password)
	if errors.Is(err, keycloak.ErrInvalidCredentials) {
		fail(w, http.StatusUnauthorized, "wrong email or password")
		return
	}
	if err != nil {
		s.failErr(w, err, "keycloak password login")
		return
	}
	s.issuePasswordSession(w, r, email, name)
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

	if err := s.Users.Register(r.Context(), email, body.Password, body.Name); errors.Is(err, keycloak.ErrConflict) {
		fail(w, http.StatusConflict, "an account with that email already exists")
		return
	} else if err != nil {
		s.failErr(w, err, "keycloak register")
		return
	}
	s.issuePasswordSession(w, r, email, body.Name)
}

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
	redirect := strings.TrimRight(s.Cfg.AppOrigin, "/") + "/login"
	if err := s.Users.SendResetPassword(r.Context(), email, redirect); err != nil {
		// Still 204: revealing Keycloak mail failures would leak that the
		// address exists, and the learner can try again.
		s.Log.Warn("keycloak reset email failed", "email", email, "error", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) issuePasswordSession(w http.ResponseWriter, r *http.Request, email, name string) {
	user, err := s.Store.UpsertUser(r.Context(), email, name, s.Cfg.IsAdmin(email))
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
