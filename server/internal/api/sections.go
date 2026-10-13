package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/shadowline/server/internal/store"
)

// The library's shelves: sections an admin makes ("For children", "Anime") and
// fills with series. The front screen shows each filled shelf as a row, and a
// row opens to the whole shelf, a page at a time.

// shelfRow is how many series a shelf shows on the front screen before "see
// all". A row scrolls sideways, so this is about the request, not the screen.
const shelfRow = 12

// sectionRow is a shelf as the front screen draws it: its heading, the first
// series on it, and how many there are in all.
type sectionRow struct {
	store.Section
	Items []store.Playlist `json:"items"`
}

// sectionPage is one page of a shelf, for its own screen.
type sectionPage struct {
	Section store.Section    `json:"section"`
	Items   []store.Playlist `json:"items"`
	Total   int              `json:"total"`
	Offset  int              `json:"offset"`
	Limit   int              `json:"limit"`
}

// adminSection is a shelf as the console edits it: the series on it, by id,
// in order.
type adminSection struct {
	store.Section
	PlaylistIDs []uuid.UUID `json:"playlistIds"`
}

// handleSections is every shelf that has something on it, each with the start
// of its row.
func (s *Server) handleSections(w http.ResponseWriter, r *http.Request) {
	sections, err := s.Store.FilledSections(r.Context())
	if err != nil {
		s.failErr(w, err, "list sections")
		return
	}
	out := make([]sectionRow, 0, len(sections))
	for _, section := range sections {
		items, _, err := s.Store.SectionPlaylists(r.Context(), section.ID, 0, shelfRow)
		if err != nil {
			s.failErr(w, err, "list section series")
			return
		}
		s.signPlaylists(r.Context(), items)
		out = append(out, sectionRow{Section: section, Items: items})
	}
	writeJSON(w, http.StatusOK, out)
}

// handleSection is one shelf, a page at a time, the way the library's list of
// every series is.
func (s *Server) handleSection(w http.ResponseWriter, r *http.Request) {
	section, err := s.Store.SectionBySlug(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		s.failErr(w, err, "get section")
		return
	}
	offset, limit, ok := pageOf(w, r)
	if !ok {
		return
	}
	items, total, err := s.Store.SectionPlaylists(r.Context(), section.ID, offset, limit)
	if err != nil {
		s.failErr(w, err, "list section series")
		return
	}
	s.signPlaylists(r.Context(), items)
	writeJSON(w, http.StatusOK, sectionPage{Section: section, Items: items, Total: total, Offset: offset, Limit: limit})
}

// pageOf reads ?offset= and ?limit=, with the same bounds the library's list
// of series has. A missing limit is a full page.
func pageOf(w http.ResponseWriter, r *http.Request) (offset, limit int, ok bool) {
	q := r.URL.Query()
	limit = maxPlaylistPage
	var err error
	if raw := q.Get("limit"); raw != "" {
		if limit, err = strconv.Atoi(raw); err != nil || limit < 1 || limit > maxPlaylistPage {
			fail(w, http.StatusBadRequest, "limit is a number from 1 to "+strconv.Itoa(maxPlaylistPage))
			return 0, 0, false
		}
	}
	if raw := q.Get("offset"); raw != "" {
		if offset, err = strconv.Atoi(raw); err != nil || offset < 0 {
			fail(w, http.StatusBadRequest, "offset is a number from 0")
			return 0, 0, false
		}
	}
	return offset, limit, true
}

// handleAdminSections is every shelf, empty ones too, with what is on each.
func (s *Server) handleAdminSections(w http.ResponseWriter, r *http.Request) {
	sections, err := s.Store.AllSections(r.Context())
	if err != nil {
		s.failErr(w, err, "list sections")
		return
	}
	out := make([]adminSection, 0, len(sections))
	for _, section := range sections {
		ids, err := s.Store.SectionPlaylistIDs(r.Context(), section.ID)
		if err != nil {
			s.failErr(w, err, "list section series")
			return
		}
		out = append(out, adminSection{Section: section, PlaylistIDs: ids})
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCreateSection(w http.ResponseWriter, r *http.Request) {
	in, ok := sectionInput(w, r, true)
	if !ok {
		return
	}
	section, err := s.Store.CreateSection(r.Context(), in)
	if err != nil {
		s.failErr(w, err, "create section")
		return
	}
	writeJSON(w, http.StatusCreated, adminSection{Section: section, PlaylistIDs: []uuid.UUID{}})
}

func (s *Server) handleUpdateSection(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	in, ok := sectionInput(w, r, false)
	if !ok {
		return
	}
	section, err := s.Store.UpdateSection(r.Context(), id, in)
	if err != nil {
		s.failErr(w, err, "update section")
		return
	}
	s.writeAdminSection(w, r, section)
}

func (s *Server) handleDeleteSection(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteSection(r.Context(), id); err != nil {
		s.failErr(w, err, "delete section")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleSetSectionSeries replaces what is on a shelf with the list sent, in
// its order.
func (s *Server) handleSetSectionSeries(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var body struct {
		PlaylistIDs []uuid.UUID `json:"playlistIds"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.PlaylistIDs) > 500 {
		fail(w, http.StatusBadRequest, "a section can hold at most 500 series")
		return
	}
	err := s.Store.SetSectionSeries(r.Context(), id, body.PlaylistIDs)
	if errors.Is(err, store.ErrUnknownSeries) {
		fail(w, http.StatusBadRequest, "one of those series does not exist")
		return
	}
	if err != nil {
		s.failErr(w, err, "set section series")
		return
	}
	section, err := s.Store.SectionByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get section")
		return
	}
	s.writeAdminSection(w, r, section)
}

func (s *Server) writeAdminSection(w http.ResponseWriter, r *http.Request, section store.Section) {
	ids, err := s.Store.SectionPlaylistIDs(r.Context(), section.ID)
	if err != nil {
		s.failErr(w, err, "list section series")
		return
	}
	writeJSON(w, http.StatusOK, adminSection{Section: section, PlaylistIDs: ids})
}

// sectionInput reads and checks what the console sent. A create needs a
// title; an update changes only what it names.
func sectionInput(w http.ResponseWriter, r *http.Request, creating bool) (store.SectionInput, bool) {
	var in store.SectionInput
	if err := decodeJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return in, false
	}
	trim := func(p *string) {
		if p != nil {
			*p = strings.TrimSpace(*p)
		}
	}
	trim(in.Title)
	trim(in.Description)
	trim(in.Icon)

	problem := ""
	switch {
	case creating && (in.Title == nil || *in.Title == ""):
		problem = "a section needs a title"
	case in.Title != nil && *in.Title == "":
		problem = "a section needs a title"
	case in.Title != nil && utf8.RuneCountInString(*in.Title) > 60:
		problem = "a title can be at most 60 characters"
	case in.Description != nil && utf8.RuneCountInString(*in.Description) > 300:
		problem = "a description can be at most 300 characters"
	// An emoji is one to a handful of code points (a flag, a skin tone).
	case in.Icon != nil && utf8.RuneCountInString(*in.Icon) > 8:
		problem = "an icon is one emoji"
	}
	if problem != "" {
		fail(w, http.StatusBadRequest, problem)
		return in, false
	}
	return in, true
}
