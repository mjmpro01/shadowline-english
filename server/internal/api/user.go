package api

import (
	"context"
	"net/http"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// Profile is what the app shows for the signed-in person. isAdmin is decided on
// the server (ADMIN_EMAILS, or the console) and is read-only here — the Profile
// screen used to let anyone switch it on.
type Profile struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	AvatarURL *string `json:"avatarUrl"`
	IsAdmin   bool    `json:"isAdmin"`
	// Passwords is whether this server keeps passwords at all (Keycloak is
	// set up), so the Profile screen offers to change one only where it can.
	Passwords bool `json:"passwords"`
}

func (s *Server) profileOf(ctx context.Context, u store.User) Profile {
	p := Profile{ID: u.ID.String(), Name: u.Name, Email: u.Email, IsAdmin: u.IsAdmin, Passwords: s.Users != nil}
	if u.AvatarKey != nil {
		// Avatars live in the clips bucket: they are small, server-written and
		// share the clips bucket's lifecycle rather than a learner's takes.
		if url, err := s.Storage.SignedGetURL(ctx, storage.Clips, *u.AvatarKey, 24*time.Hour); err == nil {
			p.AvatarURL = &url
		} else {
			s.Log.Warn("sign avatar url", "error", err)
		}
	}
	return p
}

func (s *Server) handleGetProfile(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	writeJSON(w, http.StatusOK, s.profileOf(r.Context(), u))
}

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name == "" {
		fail(w, http.StatusBadRequest, "name cannot be empty")
		return
	}

	updated, err := s.Store.UpdateProfile(r.Context(), u.ID, body.Name, u.AvatarKey)
	if err != nil {
		s.failErr(w, err, "update profile")
		return
	}
	writeJSON(w, http.StatusOK, s.profileOf(r.Context(), updated))
}

func (s *Server) handleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	key, err := s.putAudio(r, storage.Clips, "avatar/"+u.ID.String())
	if err != nil {
		s.failErr(w, err, "store avatar")
		return
	}
	updated, err := s.Store.UpdateProfile(r.Context(), u.ID, u.Name, &key)
	if err != nil {
		s.failErr(w, err, "record avatar")
		return
	}
	// Replacing an avatar leaves the old object behind unless it is removed here.
	if u.AvatarKey != nil && *u.AvatarKey != key {
		if err := s.Storage.Delete(r.Context(), storage.Clips, *u.AvatarKey); err != nil {
			s.Log.Warn("orphaned avatar", "key", *u.AvatarKey, "error", err)
		}
	}
	writeJSON(w, http.StatusOK, s.profileOf(r.Context(), updated))
}

func (s *Server) handleListVocab(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	words, err := s.Store.ListVocab(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "list vocab")
		return
	}
	writeJSON(w, http.StatusOK, words)
}

func (s *Server) handleCreateVocab(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	var in store.NewVocabWord
	if err := decodeJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if in.Word == "" {
		fail(w, http.StatusBadRequest, "word is required")
		return
	}

	word, err := s.Store.CreateVocabWord(r.Context(), u.ID, in)
	if err != nil {
		s.failErr(w, err, "create vocab word")
		return
	}
	writeJSON(w, http.StatusCreated, word)
}

func (s *Server) handleUpdateVocab(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}

	var patch store.VocabPatch
	if err := decodeJSON(r, &patch); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if patch.Status != nil && !validVocabStatus(*patch.Status) {
		fail(w, http.StatusBadRequest, "status must be new, learning or known")
		return
	}

	word, err := s.Store.UpdateVocabWord(r.Context(), u.ID, id, patch)
	if err != nil {
		s.failErr(w, err, "update vocab word")
		return
	}
	writeJSON(w, http.StatusOK, word)
}

func validVocabStatus(s string) bool {
	return s == "new" || s == "learning" || s == "known"
}

func (s *Server) handleDeleteVocab(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteVocabWord(r.Context(), u.ID, id); err != nil {
		s.failErr(w, err, "delete vocab word")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// leaderboardSize is how many rows the dashboard shows.
const leaderboardSize = 10

func (s *Server) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	rows, err := s.Store.Leaderboard(r.Context(), u.ID, leaderboardSize)
	if err != nil {
		s.failErr(w, err, "leaderboard")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}
