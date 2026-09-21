// Package api wires the HTTP surface: routing, JSON helpers and the handlers.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/config"
	"github.com/shadowline/server/internal/keycloak"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

type Server struct {
	Cfg      config.Config
	Store    *store.Store
	Storage  storage.Storage
	Sessions *auth.Manager
	Signer   *auth.Signer
	Provider auth.Provider
	// Keycloak is the email/password OIDC provider. Nil when unset.
	Keycloak auth.Provider
	// Users syncs every successful login into Keycloak's Admin API. Nil when
	// Keycloak is not configured.
	Users *keycloak.Admin
	Log   *slog.Logger
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(s.cors)
	r.Use(s.Sessions.Middleware)

	r.Get("/healthz", s.handleHealth)

	if s.Cfg.AuthFake {
		// Test-only, and absent entirely from a normal deployment.
		r.Post("/test/reset", s.handleTestReset)
		r.Post("/test/transcript", s.handleTestTranscript)
	}

	r.Route("/auth", func(r chi.Router) {
		r.Get("/google/start", s.handleAuthStart)
		r.Get("/google/callback", s.handleAuthCallback)
		r.Get("/keycloak/start", s.handleKeycloakStart)
		r.Get("/keycloak/callback", s.handleKeycloakCallback)
		r.Get("/keycloak/forgot", s.handleKeycloakForgot)
		r.Post("/login", s.handlePasswordLogin)
		r.Post("/register", s.handlePasswordRegister)
		r.Post("/forgot", s.handlePasswordForgot)
		r.Get("/me", s.handleMe)
		r.Post("/logout", s.handleLogout)
	})

	// Disk storage serves its objects here. With S3 the browser goes straight to
	// the presigned URL and never touches this route.
	// A wildcard, not `{key}`: object keys have slashes in them, and a single
	// path segment never matched one.
	r.Get("/files/{bucket}/*", s.handleFile)

	r.Route("/api", func(r chi.Router) {
		r.Use(s.requireUser)

		r.Get("/clips", s.handleListClips)
		r.Get("/clips/{id}", s.handleGetClip)
		r.Get("/clips/{id}/audio", s.handleClipAudio)
		r.Get("/clips/{id}/video", s.handleClipVideo)

		r.Get("/takes", s.handleListTakes)
		r.Post("/takes", s.handleCreateTake)
		r.Get("/takes/{id}", s.handleGetTake)
		r.Get("/takes/{id}/audio", s.handleTakeAudio)
		r.Post("/takes/{id}/dub", s.handleRequestDub)
		r.Get("/takes/{id}/dub", s.handleTakeDub)
		r.Delete("/takes/{id}", s.handleDeleteTake)

		r.Post("/words/{word}", s.handleLookupWord)
		r.Get("/words/{word}", s.handleGetWord)

		r.Get("/vocab", s.handleListVocab)
		r.Post("/vocab", s.handleCreateVocab)
		r.Patch("/vocab/{id}", s.handleUpdateVocab)
		r.Delete("/vocab/{id}", s.handleDeleteVocab)

		r.Get("/profile", s.handleGetProfile)
		r.Patch("/profile", s.handleUpdateProfile)
		r.Put("/profile/avatar", s.handleUploadAvatar)

		r.Get("/leaderboard", s.handleLeaderboard)

		r.Group(func(r chi.Router) {
			r.Use(s.requireAdmin)
			r.Post("/admin/sources", s.handleUploadSource)
			r.Get("/admin/sources/{id}/transcript", s.handleSourceTranscript)
			r.Post("/admin/clips", s.handleCreateClips)
			r.Put("/admin/clips/{id}/audio", s.handleUploadClipAudio)
			r.Patch("/admin/clips/{id}", s.handleUpdateClip)
			r.Delete("/admin/clips/{id}", s.handleDeleteClip)
		})
	})

	return r
}

// cors allows exactly the app origin, with credentials, because the session is
// a cookie. A wildcard would not be allowed to carry one anyway.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin == s.Cfg.AppOrigin {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Allow-Headers", "Content-Type")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			h.Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.UserFrom(r.Context()); !ok {
			fail(w, http.StatusUnauthorized, "sign in first")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireAdmin re-checks on the server what the client's RequireAdmin route only
// hides. The client flag is a convenience; this is the rule.
func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := auth.UserFrom(r.Context())
		if !ok || !u.IsAdmin {
			fail(w, http.StatusForbidden, "admins only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.Pool().Ping(r.Context()); err != nil {
		fail(w, http.StatusServiceUnavailable, "database unreachable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// failErr maps the few error kinds handlers share; anything else is a 500 with
// the detail kept server-side.
func (s *Server) failErr(w http.ResponseWriter, err error, action string) {
	if errors.Is(err, store.ErrNotFound) || errors.Is(err, storage.ErrNotFound) {
		fail(w, http.StatusNotFound, "not found")
		return
	}
	// A cancelled context means the browser navigated away mid-request. Nothing
	// is wrong, and logging it as an error buries the ones that are — the test
	// run alone produced a screenful.
	if errors.Is(err, context.Canceled) {
		return
	}
	s.Log.Error(action, "error", err)
	fail(w, http.StatusInternalServerError, "something went wrong")
}

func decodeJSON(r *http.Request, into any) error {
	if ct := r.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "application/json") {
		return errors.New("expected application/json")
	}
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(into)
}
