package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/shadowline/server/internal/store"
)

const (
	SessionCookie = "shadowline_session"
	sessionTTL    = 30 * 24 * time.Hour
	// pkceCookie carries the PKCE verifier between the redirect to Google and
	// the callback. It is short-lived and dies with the exchange.
	pkceCookie = "shadowline_pkce"
	pkceTTL    = 10 * time.Minute
)

type ctxKey struct{}

// Manager issues and reads session cookies.
type Manager struct {
	Store *store.Store
	// Secure marks cookies https-only. Off for local http development,
	// which is decided from APP_ORIGIN rather than from a separate flag
	// nobody remembers to set.
	Secure bool
}

func (m *Manager) Issue(ctx context.Context, w http.ResponseWriter, userID uuid.UUID) error {
	id, err := RandomID()
	if err != nil {
		return err
	}
	expires := time.Now().Add(sessionTTL)
	if err := m.Store.CreateSession(ctx, id, userID, expires); err != nil {
		return err
	}
	http.SetCookie(w, m.cookie(SessionCookie, id, expires))
	return nil
}

func (m *Manager) Clear(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(SessionCookie); err == nil {
		_ = m.Store.DeleteSession(ctx, c.Value)
	}
	http.SetCookie(w, m.cookie(SessionCookie, "", time.Unix(0, 0)))
}

func (m *Manager) SetPKCE(w http.ResponseWriter, verifier string) {
	http.SetCookie(w, m.cookie(pkceCookie, verifier, time.Now().Add(pkceTTL)))
}

func (m *Manager) TakePKCE(w http.ResponseWriter, r *http.Request) string {
	c, err := r.Cookie(pkceCookie)
	http.SetCookie(w, m.cookie(pkceCookie, "", time.Unix(0, 0)))
	if err != nil {
		return ""
	}
	return c.Value
}

func (m *Manager) cookie(name, value string, expires time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   m.Secure,
		// Lax rather than Strict: the OAuth callback is a cross-site
		// navigation back to us, and Strict would drop the cookie on it.
		SameSite: http.SameSiteLaxMode,
	}
}

// Middleware attaches the signed-in user to the request context when there is
// one. It does not reject anonymous requests — RequireUser does that — because
// some routes want to know who you are without insisting.
func (m *Manager) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(SessionCookie)
		if err == nil && c.Value != "" {
			if u, err := m.Store.UserBySession(r.Context(), c.Value); err == nil {
				r = r.WithContext(context.WithValue(r.Context(), ctxKey{}, u))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// UserFrom returns the signed-in user, if any.
func UserFrom(ctx context.Context) (store.User, bool) {
	u, ok := ctx.Value(ctxKey{}).(store.User)
	return u, ok
}
