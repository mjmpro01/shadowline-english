package api

import (
	"net/http"
	"net/url"
	"time"

	"github.com/shadowline/server/internal/auth"
)

// Reasons the login flow can end without a session. They travel to the app as
// ?error= on the login screen, which owns the wording — the browser is mid
// navigation when these happen, so an error body would strand the learner on
// the API's origin with raw JSON and no way back.
const (
	loginErrExpired   = "expired"   // the state was forged, or older than its ten minutes
	loginErrBrowser   = "browser"   // no PKCE cookie: the flow started somewhere else
	loginErrCancelled = "cancelled" // the provider says the learner declined
	loginErrFailed    = "failed"    // the code would not exchange
	loginErrServer    = "server"    // our fault, and already logged
)

// handleAuthStart sends the browser to the provider. The PKCE verifier goes into
// a short-lived cookie rather than into the state parameter, so the value that
// proves we started the exchange never travels through the provider.
func (s *Server) handleAuthStart(w http.ResponseWriter, r *http.Request) {
	nonce, err := auth.RandomID()
	if err != nil {
		s.failLogin(w, r, loginErrServer, err, "generate oauth nonce")
		return
	}
	verifier, err := auth.RandomID()
	if err != nil {
		s.failLogin(w, r, loginErrServer, err, "generate pkce verifier")
		return
	}

	s.Sessions.SetPKCE(w, verifier)
	state := s.Signer.SignState(nonce, time.Now().Add(10*time.Minute))

	provider := s.Provider
	// Only the fake provider implements EmailChooser, so ?email= is inert
	// against Google — there is no way to ask it to vouch for an address.
	if chooser, ok := provider.(auth.EmailChooser); ok {
		if email := r.URL.Query().Get("email"); email != "" {
			provider = chooser.WithEmail(email)
		}
	}
	http.Redirect(w, r, provider.AuthCodeURL(state, verifier), http.StatusFound)
}

func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	verifier := s.Sessions.TakePKCE(w, r)

	// Checked before the state: a learner who pressed "Cancel" at Google should
	// be told that, not handed a story about an expired link.
	if e := q.Get("error"); e != "" {
		s.Log.Info("oauth provider declined", "error", e)
		s.failLogin(w, r, loginErrCancelled, nil, "")
		return
	}
	if !s.Signer.VerifyState(q.Get("state")) {
		s.failLogin(w, r, loginErrExpired, nil, "")
		return
	}
	if verifier == "" {
		s.failLogin(w, r, loginErrBrowser, nil, "")
		return
	}

	identity, err := s.Provider.Exchange(r.Context(), q.Get("code"), verifier)
	if err != nil {
		s.Log.Warn("oauth exchange failed", "error", err)
		s.failLogin(w, r, loginErrFailed, nil, "")
		return
	}

	user, err := s.Store.UpsertUser(r.Context(), identity.Email, identity.Name, s.Cfg.IsAdmin(identity.Email))
	if err != nil {
		s.failLogin(w, r, loginErrServer, err, "upsert user")
		return
	}
	if err := s.Sessions.Issue(r.Context(), w, user.ID); err != nil {
		s.failLogin(w, r, loginErrServer, err, "issue session")
		return
	}

	http.Redirect(w, r, s.Cfg.AppOrigin+"/dashboard", http.StatusFound)
}

// failLogin sends the browser back to the app's login screen carrying a reason
// code. Both halves of the destination are ours — AppOrigin comes from the
// environment and reason is one of the constants above — so nothing the caller
// sends can steer this redirect somewhere else.
//
// err is logged and never shown: the codes are deliberately coarse, because a
// login screen that explains precisely which check failed explains it to
// whoever is probing it too.
func (s *Server) failLogin(w http.ResponseWriter, r *http.Request, reason string, err error, action string) {
	if err != nil {
		s.Log.Error(action, "error", err)
	}
	http.Redirect(w, r, s.Cfg.AppOrigin+"/login?error="+url.QueryEscape(reason), http.StatusFound)
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
