package api

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// Reasons the login flow can end without a session. They travel to the app as
// ?error= on the login screen, which owns the wording — the browser is mid
// navigation when these happen, so an error body would strand the learner on
// the API's origin with raw JSON and no way back.
const (
	loginErrExpired    = "expired"    // the state was forged, or older than its ten minutes
	loginErrBrowser    = "browser"    // no PKCE cookie: the flow started somewhere else
	loginErrCancelled  = "cancelled"  // the provider says the learner declined
	loginErrFailed     = "failed"     // the code would not exchange
	loginErrServer     = "server"     // our fault, and already logged
	loginErrSuspended  = "suspended"  // an admin suspended the account
	loginErrUnverified = "unverified" // the address is not confirmed, and the account needs it to be
)

// Where a login can start from, and so where it goes back to. A fixed list,
// never a URL from the request: a login flow that redirects wherever it is told
// is an open redirect with a real login page in front of it.
const loginFromAdmin = "admin"

// loginPages says where each starting point lives: its login screen, and the
// page a finished login lands on.
func (s *Server) loginPages(from string) (login, home string) {
	if from == loginFromAdmin {
		return s.Cfg.AppOrigin + "/admin/login", s.Cfg.AppOrigin + "/admin/"
	}
	return s.Cfg.AppOrigin + "/login", s.Cfg.AppOrigin + "/dashboard"
}

// loginFrom is where this login says it started, if it is somewhere we know.
func loginFrom(r *http.Request) string {
	if r.URL.Query().Get("from") == loginFromAdmin {
		return loginFromAdmin
	}
	return ""
}

// handleAuthStart sends the browser to Google (or the fake provider).
func (s *Server) handleAuthStart(w http.ResponseWriter, r *http.Request) {
	s.startAuth(w, r, s.Provider)
}

// handleKeycloakStart sends the browser to Keycloak for email/password login
// or registration. Absent when Keycloak is not configured.
func (s *Server) handleKeycloakStart(w http.ResponseWriter, r *http.Request) {
	if s.Keycloak == nil {
		http.NotFound(w, r)
		return
	}
	s.startAuth(w, r, s.Keycloak)
}

// handleKeycloakForgot redirects to Keycloak's hosted reset-password form.
func (s *Server) handleKeycloakForgot(w http.ResponseWriter, r *http.Request) {
	u := s.Cfg.ForgotPasswordURL()
	if u == "" {
		http.NotFound(w, r)
		return
	}
	http.Redirect(w, r, u, http.StatusFound)
}

// handleAuthCallback finishes a Google (or fake) login.
func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	s.finishAuth(w, r, s.Provider)
}

// handleKeycloakCallback finishes an email/password login through Keycloak.
func (s *Server) handleKeycloakCallback(w http.ResponseWriter, r *http.Request) {
	if s.Keycloak == nil {
		http.NotFound(w, r)
		return
	}
	s.finishAuth(w, r, s.Keycloak)
}

// startAuth sends the browser to the provider. The PKCE verifier goes into a
// short-lived cookie rather than into the state parameter, so the value that
// proves we started the exchange never travels through the provider.
func (s *Server) startAuth(w http.ResponseWriter, r *http.Request, provider auth.Provider) {
	from := loginFrom(r)
	nonce, err := auth.RandomID()
	if err != nil {
		s.failLogin(w, r, from, loginErrServer, err, "generate oauth nonce")
		return
	}
	verifier, err := auth.RandomID()
	if err != nil {
		s.failLogin(w, r, from, loginErrServer, err, "generate pkce verifier")
		return
	}

	s.Sessions.SetPKCE(w, verifier)
	s.Sessions.SetLoginFrom(w, from)
	state := s.Signer.SignState(nonce, time.Now().Add(10*time.Minute))

	// Only the fake provider implements EmailChooser, so ?email= is inert
	// against Google or Keycloak — there is no way to ask them to vouch for an
	// address.
	if chooser, ok := provider.(auth.EmailChooser); ok {
		if email := r.URL.Query().Get("email"); email != "" {
			provider = chooser.WithEmail(email)
		}
	}
	http.Redirect(w, r, provider.AuthCodeURL(state, verifier), http.StatusFound)
}

func (s *Server) finishAuth(w http.ResponseWriter, r *http.Request, provider auth.Provider) {
	q := r.URL.Query()
	verifier := s.Sessions.TakePKCE(w, r)
	from := s.Sessions.TakeLoginFrom(w, r)
	if from != loginFromAdmin {
		from = ""
	}

	// Checked before the state: a learner who pressed "Cancel" at the provider
	// should be told that, not handed a story about an expired link.
	if e := q.Get("error"); e != "" {
		s.Log.Info("oauth provider declined", "error", e)
		s.failLogin(w, r, from, loginErrCancelled, nil, "")
		return
	}
	if !s.Signer.VerifyState(q.Get("state")) {
		s.failLogin(w, r, from, loginErrExpired, nil, "")
		return
	}
	if verifier == "" {
		s.failLogin(w, r, from, loginErrBrowser, nil, "")
		return
	}

	identity, err := provider.Exchange(r.Context(), q.Get("code"), verifier)
	if err != nil {
		s.Log.Warn("oauth exchange failed", "error", err)
		s.failLogin(w, r, from, loginErrFailed, nil, "")
		return
	}

	if ok, err := s.admits(r.Context(), identity.Email, identity.Verified); err != nil {
		s.failLogin(w, r, from, loginErrServer, err, "check account")
		return
	} else if !ok {
		s.failLogin(w, r, from, loginErrUnverified, nil, "")
		return
	}
	user, err := s.Store.UpsertUser(r.Context(), identity.Email, identity.Name,
		s.owner(identity.Email, identity.Verified), identity.Verified)
	if err != nil {
		s.failLogin(w, r, from, loginErrServer, err, "upsert user")
		return
	}
	if user.SuspendedAt != nil {
		s.failLogin(w, r, from, loginErrSuspended, nil, "")
		return
	}

	// Mirror into Keycloak so forgot/reset password can reach this address
	// later. Failure must not block login — Keycloak down should not lock
	// Google out. Only for a verified address: the mirror is created verified.
	if s.Users != nil && identity.Verified {
		if err := s.Users.EnsureUser(r.Context(), identity.Email, identity.Name); err != nil {
			s.Log.Warn("keycloak sync failed", "email", identity.Email, "error", err)
		}
	}

	if err := s.Sessions.Issue(r.Context(), w, user.ID); err != nil {
		s.failLogin(w, r, from, loginErrServer, err, "issue session")
		return
	}

	_, home := s.loginPages(from)
	http.Redirect(w, r, home, http.StatusFound)
}

// admits says whether an identity may sign in to the account its address names.
//
// Accounts are matched by address, and anybody can register any address with
// Keycloak. An unverified identity used to sign straight in to whatever account
// had that address — the admin's included, with a password the registrant
// chose. Now it may only reach an account no verified identity has used: one it
// created itself, or none yet.
func (s *Server) admits(ctx context.Context, email string, verified bool) (bool, error) {
	if verified {
		return true, nil
	}
	if s.Cfg.RequireVerifiedEmail {
		return false, nil
	}
	existing, err := s.Store.UserByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if errors.Is(err, store.ErrNotFound) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return existing.EmailVerifiedAt == nil, nil
}

// owner is whether this sign-in gets admin rights from ADMIN_EMAILS: only when
// the identity proved it owns the listed address.
func (s *Server) owner(email string, verified bool) bool {
	return verified && s.Cfg.IsAdmin(email)
}

// failLogin sends the browser back to the login screen it started from,
// carrying a reason code. Every part of the destination is ours — AppOrigin
// comes from the environment, the path from loginPages and the reason is one of
// the constants above — so nothing the caller sends can steer this redirect
// somewhere else.
//
// err is logged and never shown: the codes are deliberately coarse, because a
// login screen that explains precisely which check failed explains it to
// whoever is probing it too.
func (s *Server) failLogin(w http.ResponseWriter, r *http.Request, from, reason string, err error, action string) {
	if err != nil {
		s.Log.Error(action, "error", err)
	}
	login, _ := s.loginPages(from)
	http.Redirect(w, r, login+"?error="+url.QueryEscape(reason), http.StatusFound)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFrom(r.Context())
	if !ok {
		// Not an error: the app asks this on load to find out whether to show
		// the login screen.
		writeJSON(w, http.StatusOK, map[string]any{"user": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": s.profileOf(r.Context(), u)})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.Sessions.Clear(r.Context(), w, r)
	writeJSON(w, http.StatusOK, map[string]any{"user": nil})
}
