package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/shadowline/server/internal/storage"
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

// handleDeleteEpisode removes an episode, its clips and the recording they were
// cut from — the objects as well as the rows.
func (s *Server) handleDeleteEpisode(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	clipKeys, takeKeys, err := s.Store.DeleteEpisode(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "delete episode")
		return
	}
	s.dropObjects(r.Context(), storage.Clips, clipKeys)
	s.dropObjects(r.Context(), storage.Takes, takeKeys)
	w.WriteHeader(http.StatusNoContent)
}

// handleDeletePlaylist removes an empty series, and says so when it is not one.
//
// 409 rather than deleting what is in it: a series is a shelf, and the mistake
// this recovers from is a name typed wrong. An admin who means to delete a
// season deletes its episodes, which makes them look at what they are deleting
// on the way.
func (s *Server) handleDeletePlaylist(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	keys, err := s.Store.DeletePlaylist(r.Context(), id)
	if errors.Is(err, store.ErrNotEmpty) {
		fail(w, http.StatusConflict, "this series still has clips in it — delete its episodes first")
		return
	}
	if err != nil {
		s.failErr(w, err, "delete playlist")
		return
	}
	s.dropObjects(r.Context(), storage.Clips, keys)
	w.WriteHeader(http.StatusNoContent)
}

// dropObjects removes what a deleted row owned. A failure is a leak to clean
// up later, not a reason to fail a request whose row is already gone.
func (s *Server) dropObjects(ctx context.Context, bucket storage.Bucket, keys []string) {
	for _, key := range keys {
		if err := s.Storage.Delete(ctx, bucket, key); err != nil {
			s.Log.Warn("orphaned object", "bucket", bucket, "key", key, "error", err)
		}
	}
}
