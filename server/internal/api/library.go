package api

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/shadowline/server/internal/store"
)

// The library is a tree: a series, its episodes, and the clips cut out of each.
//
// It used to be one flat list of every clip, filtered in the browser. That is
// the right shape for forty clips and the wrong one for a series: two hundred
// cards off one season say nothing about which episode they came from or where
// anybody left off, and the whole list has to reach the browser before the
// first card can be drawn.

func (s *Server) handleListPlaylists(w http.ResponseWriter, r *http.Request) {
	playlists, err := s.Store.ListPlaylists(r.Context())
	if err != nil {
		s.failErr(w, err, "list playlists")
		return
	}
	s.signPlaylists(r.Context(), playlists)
	writeJSON(w, http.StatusOK, playlists)
}

func (s *Server) signPlaylists(ctx context.Context, playlists []store.Playlist) {
	for i := range playlists {
		playlists[i].CoverURL = s.signPoster(ctx, playlists[i].CoverKey, "playlist", playlists[i].Slug)
	}
}

func (s *Server) signEpisodes(ctx context.Context, episodes []store.Episode) {
	for i := range episodes {
		episodes[i].PosterURL = s.signPoster(ctx, episodes[i].PosterKey, "episode", episodes[i].ID.String())
	}
}

// handleGetPlaylist answers with the series and its episodes together.
//
// Together rather than in two requests: a screen that shows a series shows its
// episodes, and there is no moment worth rendering where it has the heading and
// not the list.
func (s *Server) handleGetPlaylist(w http.ResponseWriter, r *http.Request) {
	playlist, err := s.Store.PlaylistBySlug(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		s.failErr(w, err, "get playlist")
		return
	}
	episodes, err := s.Store.ListEpisodes(r.Context(), playlist.ID)
	if err != nil {
		s.failErr(w, err, "list episodes")
		return
	}
	playlist.CoverURL = s.signPoster(r.Context(), playlist.CoverKey, "playlist", playlist.Slug)
	s.signEpisodes(r.Context(), episodes)
	writeJSON(w, http.StatusOK, map[string]any{"playlist": playlist, "episodes": episodes})
}

// handleGetEpisode answers with the episode, the series it is in, and its clips.
//
// The series comes too so the screen can offer the way back up by name. Asking
// for it separately would be a second round trip to render a breadcrumb.
func (s *Server) handleGetEpisode(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	episode, err := s.Store.EpisodeByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get episode")
		return
	}
	clips, err := s.Store.ClipsByEpisode(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "list clips of episode")
		return
	}
	for i := range clips {
		clips[i].PosterURL = s.posterURL(r.Context(), clips[i])
	}
	episode.PosterURL = s.signPoster(r.Context(), episode.PosterKey, "episode", episode.ID.String())

	// A playlist of null is not an error: an episode an admin has moved out of
	// every series still has its clips, and the screen drops the breadcrumb.
	var playlist any
	if episode.PlaylistID != nil {
		p, err := s.Store.PlaylistByID(r.Context(), *episode.PlaylistID)
		if err != nil {
			s.failErr(w, err, "get playlist of episode")
			return
		}
		p.CoverURL = s.signPoster(r.Context(), p.CoverKey, "playlist", p.Slug)
		playlist = p
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"episode": episode, "playlist": playlist, "clips": clips,
	})
}

// handleSearch looks for a fragment at all three levels at once.
//
// A query shorter than two characters answers with nothing rather than with
// most of the library: it is somebody who has started typing, not somebody who
// has asked a question.
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	results, err := s.Store.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		s.failErr(w, err, "search the library")
		return
	}
	s.signPlaylists(r.Context(), results.Playlists)
	s.signEpisodes(r.Context(), results.Episodes)
	for i := range results.Clips {
		results.Clips[i].PosterURL = s.posterURL(r.Context(), results.Clips[i])
	}
	writeJSON(w, http.StatusOK, results)
}

// ---------------------------------------------------------------- the studio

func (s *Server) handleUpdatePlaylist(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var patch store.PlaylistPatch
	if err := decodeJSON(r, &patch); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if patch.Title != nil && *patch.Title == "" {
		fail(w, http.StatusBadRequest, "a playlist needs a name")
		return
	}
	playlist, err := s.Store.UpdatePlaylist(r.Context(), id, patch)
	if err != nil {
		s.failErr(w, err, "update playlist")
		return
	}
	playlist.CoverURL = s.signPoster(r.Context(), playlist.CoverKey, "playlist", playlist.Slug)
	writeJSON(w, http.StatusOK, playlist)
}

func (s *Server) handleUpdateEpisode(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var patch store.EpisodePatch
	if err := decodeJSON(r, &patch); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if patch.PlaylistID != nil && *patch.PlaylistID == uuid.Nil {
		fail(w, http.StatusBadRequest, "that is not a playlist")
		return
	}
	episode, err := s.Store.UpdateEpisode(r.Context(), id, patch)
	if err != nil {
		s.failErr(w, err, "update episode")
		return
	}
	episode.PosterURL = s.signPoster(r.Context(), episode.PosterKey, "episode", episode.ID.String())
	writeJSON(w, http.StatusOK, episode)
}
