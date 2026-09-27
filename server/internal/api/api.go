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
	"github.com/shadowline/server/internal/telemetry"
	"github.com/shadowline/server/internal/tutor"
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
	// Tutor answers the learner's chat. Nil when TUTOR_API_KEY is unset, and
	// the app then leaves the chat out.
	Tutor *tutor.Client
	// TutorLimit caps questions per learner; every one is paid for.
	TutorLimit tutor.Limit
	Log        *slog.Logger
}

// requestTimeout is how long an ordinary request may take. A handler that has
// not answered in a minute is stuck, not busy.
const requestTimeout = 60 * time.Second

// transferTimeout is for the two requests that move a whole file: a recording
// going up, an object coming back down. How long those take is the size of the
// file and the speed of the line — half an hour covers a two-gigabyte upload on
// a slow connection, which is what maxSourceBytes lets an admin send.
const transferTimeout = 30 * time.Minute

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(s.cors)
	r.Use(s.Sessions.Middleware)

	// Not a deadline on the whole router any more. It was, and it cut off every
	// upload that took longer than a minute: the handler raises the write
	// deadline for a big file, but the request context is what actually decides,
	// and that one expired on schedule with a 500 and "context deadline
	// exceeded" in the log. A file going up, or an object coming back down, is
	// slow because of its size and the line it is on. Neither is a stuck
	// handler, which is the only thing this timeout is for.
	quick := func(r chi.Router) { r.Use(middleware.Timeout(requestTimeout)) }
	transfer := func(r chi.Router) { r.Use(middleware.Timeout(transferTimeout)) }

	r.Group(func(r chi.Router) {
		quick(r)
		r.Get("/healthz", s.handleHealth)
		r.Handle("/metrics", telemetry.MetricsHandler())

		if s.Cfg.AuthFake {
			// Test-only, and absent entirely from a normal deployment.
			r.Post("/test/reset", s.handleTestReset)
			r.Post("/test/transcript", s.handleTestTranscript)
		}
	})

	r.Route("/auth", func(r chi.Router) {
		quick(r)
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
	r.Group(func(r chi.Router) {
		transfer(r)
		r.Get("/files/{bucket}/*", s.handleFile)
	})

	r.Route("/api", func(r chi.Router) {
		r.Use(s.requireUser)

		// The one request that carries a whole recording, on the long deadline.
		// Its own group, because a deadline set further down can only shorten
		// the one above it: this route cannot sit under the minute and then ask
		// for half an hour.
		r.Group(func(r chi.Router) {
			transfer(r)
			r.Use(s.requireAdmin)
			r.Put("/admin/uploads/{id}/file", s.handleUploadFile)
		})

		// The tutor's answer streams for as long as the model takes to write it.
		r.Group(func(r chi.Router) {
			r.Use(middleware.Timeout(streamTimeout))
			r.Post("/tutor/chat", s.handleTutorChat)
		})

		r.Group(func(r chi.Router) {
			quick(r)

			r.Get("/tutor", s.handleTutorStatus)
			r.Get("/banners", s.handleLiveBanners)
			r.Get("/account/export", s.handleExportAccount)
			r.Post("/account/password", s.handleChangePassword)
			r.Delete("/account", s.handleDeleteAccount)
			r.Get("/playlists", s.handleListPlaylists)
			r.Get("/playlists/{slug}", s.handleGetPlaylist)
			r.Get("/episodes/{id}", s.handleGetEpisode)
			r.Get("/library/search", s.handleSearch)

			r.Get("/library/summary", s.handleLibrarySummary)

			r.Get("/clips", s.handleListClips)
			r.Get("/clips/featured", s.handleFeaturedClips)
			r.Get("/clips/next-up", s.handleNextUp)
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
				r.Get("/admin/clips", s.handleStudioClips)
				r.Get("/admin/clips/next-number", s.handleNextClipNumber)
				r.Get("/admin/uploads", s.handleListUploads)
				r.Post("/admin/uploads", s.handleCreateUpload)
				r.Get("/admin/uploads/{id}", s.handleGetUpload)
				r.Post("/admin/uploads/{id}/retry", s.handleRetryUpload)
				r.Get("/admin/uploads/{id}/transcript", s.handleSourceTranscript)
				r.Get("/admin/tutor/usage", s.handleTutorUsage)
				r.Get("/admin/users", s.handleListAccounts)
				r.Patch("/admin/users/{id}", s.handleUpdateAccount)
				r.Get("/admin/banners", s.handleAllBanners)
				r.Post("/admin/banners", s.handleCreateBanner)
				r.Put("/admin/banners/{id}", s.handleUpdateBanner)
				r.Delete("/admin/banners/{id}", s.handleDeleteBanner)
				r.Put("/admin/banners/{id}/image", s.handleBannerImage)
				r.Delete("/admin/banners/{id}/image", s.handleRemoveBannerImage)
				r.Post("/admin/clips", s.handleCreateClips)
				r.Put("/admin/clips/{id}/audio", s.handleUploadClipAudio)
				r.Patch("/admin/clips/{id}", s.handleUpdateClip)
				r.Patch("/admin/playlists/{id}", s.handleUpdatePlaylist)
				r.Patch("/admin/episodes/{id}", s.handleUpdateEpisode)
				r.Delete("/admin/playlists/{id}", s.handleDeletePlaylist)
				r.Delete("/admin/episodes/{id}", s.handleDeleteEpisode)
				r.Delete("/admin/clips/{id}", s.handleDeleteClip)
			})
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
