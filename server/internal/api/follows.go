package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/shadowline/server/internal/auth"
)

// Where a learner left off, what is new to them, and the series they follow.

func (s *Server) handleContinue(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	cont, err := s.Store.ContinueFor(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "continue")
		return
	}
	if cont != nil {
		cont.Next.PosterURL = s.posterURL(r.Context(), cont.Next)
		cont.Episode.PosterURL = s.signPoster(r.Context(), cont.Episode.PosterKey, "episode", cont.Episode.ID.String())
		if cont.Playlist != nil {
			cont.Playlist.CoverURL = s.signPoster(r.Context(), cont.Playlist.CoverKey, "playlist", cont.Playlist.Slug)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"continue": cont})
}

func (s *Server) handleNewEpisodes(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	fresh, err := s.Store.NewFor(r.Context(), u.ID, time.Now())
	if err != nil {
		s.failErr(w, err, "new episodes")
		return
	}
	for i := range fresh.Episodes {
		e := &fresh.Episodes[i]
		e.PosterURL = s.signPoster(r.Context(), e.PosterKey, "episode", e.ID.String())
	}
	writeJSON(w, http.StatusOK, fresh)
}

func (s *Server) handleEpisodeSeen(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.MarkEpisodeSeen(r.Context(), u.ID, id); err != nil {
		s.failErr(w, err, "mark an episode seen")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFollow(following bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		playlist, err := s.Store.PlaylistBySlug(r.Context(), chi.URLParam(r, "slug"))
		if err != nil {
			s.failErr(w, err, "find a series")
			return
		}
		if err := s.Store.SetFollow(r.Context(), u.ID, playlist.ID, following); err != nil {
			s.failErr(w, err, "follow a series")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"following": following})
	}
}
