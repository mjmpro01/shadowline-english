package api

import (
	"net/http"
	"time"

	"github.com/shadowline/server/internal/auth"
)

// handleAuthStart sends the browser to the provider. The PKCE verifier goes into
// a short-lived cookie rather than into the state parameter, so the value that
// proves we started the exchange never travels through the provider.
func (s *Server) handleAuthStart(w http.ResponseWriter, r *http.Request) {
	nonce, err := auth.RandomID()
	if err != nil {
		s.failErr(w, err, "generate oauth nonce")
		return
	}
	verifier, err := auth.RandomID()
	if err != nil {
		s.failErr(w, err, "generate pkce verifier")
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

	if !s.Signer.VerifyState(q.Get("state")) {
		fail(w, http.StatusBadRequest, "login link expired — try signing in again")
		return
	}
	if verifier == "" {
		fail(w, http.StatusBadRequest, "login started in another browser — try again")
		return
	}
	if e := q.Get("error"); e != "" {
		fail(w, http.StatusBadRequest, "sign-in was cancelled")
		return
	}

	identity, err := s.Provider.Exchange(r.Context(), q.Get("code"), verifier)
	if err != nil {
		s.Log.Warn("oauth exchange failed", "error", err)
		fail(w, http.StatusBadRequest, "could not complete sign-in")
		return
	}

	user, err := s.Store.UpsertUser(r.Context(), identity.Email, identity.Name, s.Cfg.IsAdmin(identity.Email))
	if err != nil {
		s.failErr(w, err, "upsert user")
		return
	}
	if err := s.Sessions.Issue(r.Context(), w, user.ID); err != nil {
		s.failErr(w, err, "issue session")
		return
	}

	http.Redirect(w, r, s.Cfg.AppOrigin+"/dashboard", http.StatusFound)
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
