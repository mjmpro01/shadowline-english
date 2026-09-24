package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/keycloak"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// exportLinkTTL is how long the recording links in an export keep working.
// Long enough to download them the same evening; the export says so.
const exportLinkTTL = 24 * time.Hour

// exportTake is a take as the learner's own copy of it has it: the line it was
// of, when, how it scored, and where to fetch the recording while the link
// lasts.
type exportTake struct {
	ClipID     string             `json:"clipId"`
	Clip       string             `json:"clip"`
	RecordedAt time.Time          `json:"recordedAt"`
	Status     store.TakeStatus   `json:"status"`
	Score      *float64           `json:"score"`
	Scores     map[string]float64 `json:"scores"`
	Recording  string             `json:"recording,omitempty"`
	Dub        string             `json:"dub,omitempty"`
}

// handleExportAccount hands a learner everything the server keeps about them,
// as one JSON file.
//
// Recordings are links rather than bytes: a learner with four hundred takes
// would otherwise be handed a file of hundreds of megabytes to get at their
// scores. The links are signed for a day, and the file says so.
func (s *Server) handleExportAccount(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	ctx := r.Context()

	takes, err := s.Store.ListTakes(ctx, u.ID)
	if err != nil {
		s.failErr(w, err, "export takes")
		return
	}
	titles, err := s.Store.ClipTitlesFor(ctx, u.ID)
	if err != nil {
		s.failErr(w, err, "export clip titles")
		return
	}
	words, err := s.Store.ListVocab(ctx, u.ID)
	if err != nil {
		s.failErr(w, err, "export vocabulary")
		return
	}
	questions, err := s.Store.QuestionsOf(ctx, u.ID)
	if err != nil {
		s.failErr(w, err, "export tutor questions")
		return
	}

	sign := func(key *string) string {
		if key == nil {
			return ""
		}
		url, err := s.Storage.SignedGetURL(ctx, storage.Takes, *key, exportLinkTTL)
		if err != nil {
			s.Log.Warn("sign an exported recording", "error", err)
			return ""
		}
		return url
	}
	out := make([]exportTake, len(takes))
	for i, t := range takes {
		out[i] = exportTake{
			ClipID: t.ClipID.String(), Clip: titles[t.ClipID], RecordedAt: t.RecordedAt,
			Status: t.Status, Score: t.Score, Scores: t.Scores,
			Recording: sign(t.AudioKey), Dub: sign(t.DubKey),
		}
	}

	now := time.Now().UTC()
	w.Header().Set("Content-Disposition",
		`attachment; filename="shadowline-`+now.Format("2006-01-02")+`.json"`)
	writeJSON(w, http.StatusOK, map[string]any{
		"exportedAt": now,
		"about": "Everything Shadowline keeps about you. Recording links work for 24 hours " +
			"from exportedAt. What you asked the tutor was never stored, only when you asked.",
		"profile": map[string]any{
			"email": u.Email, "name": u.Name, "createdAt": u.CreatedAt, "isAdmin": u.IsAdmin,
		},
		"takes":          out,
		"vocabulary":     orNone(words),
		"tutorQuestions": orNone(questions),
	})
}

// handleChangePassword sets a new password for an account that has one.
//
// The old one is checked first, through the same grant that signs in: a
// session left open on a shared computer should not be enough to lock the
// owner out. An account that only ever used Google has no password to check,
// and is told to set one through "forgot password" instead.
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if s.Users == nil {
		fail(w, http.StatusNotFound, "this server does not keep passwords")
		return
	}
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Next) < 8 {
		fail(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if _, err := s.Users.PasswordLogin(r.Context(), u.Email, body.Current); err != nil {
		if errors.Is(err, keycloak.ErrInvalidCredentials) {
			fail(w, http.StatusForbidden,
				"that is not your current password — if you have only signed in with Google, set one with “forgot password”")
			return
		}
		s.failErr(w, err, "check current password")
		return
	}
	if err := s.Users.SetPassword(r.Context(), u.Email, body.Next); err != nil {
		s.failErr(w, err, "set password")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleDeleteAccount deletes the signed-in account and everything in it.
//
// The learner types their own address to confirm: this cannot be undone, and a
// stray click is not consent to lose a year of recordings.
func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if !strings.EqualFold(strings.TrimSpace(body.Email), u.Email) {
		fail(w, http.StatusBadRequest, "type your email address to confirm")
		return
	}

	avatar, takeKeys, err := s.Store.DeleteAccount(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "delete account")
		return
	}
	// The rows are gone; what follows is tidying, and failing at it is logged
	// rather than reported — the account is deleted either way.
	ctx := r.Context()
	if avatar != nil {
		if err := s.Storage.Delete(ctx, storage.Clips, *avatar); err != nil {
			s.Log.Warn("orphaned avatar", "key", *avatar, "error", err)
		}
	}
	for _, key := range takeKeys {
		if err := s.Storage.Delete(ctx, storage.Takes, key); err != nil {
			s.Log.Warn("orphaned take recording", "key", key, "error", err)
		}
	}
	if s.Users != nil {
		if err := s.Users.DeleteUser(ctx, u.Email); err != nil {
			s.Log.Warn("keycloak user left behind", "email", u.Email, "error", err)
		}
	}
	s.Log.Info("account deleted", "email", u.Email, "recordings", len(takeKeys))
	s.Sessions.Clear(ctx, w, r)
	w.WriteHeader(http.StatusNoContent)
}
