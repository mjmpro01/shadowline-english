package api

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// maxBannerImage caps a banner's picture. It is shown a few hundred pixels
// wide; anything bigger is a photo straight off a camera, and every learner
// would download it.
const maxBannerImage = 3 << 20

// bannerImageTypes are the pictures a browser shows without argument.
var bannerImageTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}

// handleLiveBanners is what a learner sees on one screen: the banners showing
// now, for their app language or for everybody.
func (s *Server) handleLiveBanners(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	placement := query.Get("placement")
	if placement != store.PlaceDashboard && placement != store.PlaceLibrary {
		fail(w, http.StatusBadRequest, "placement is dashboard or library")
		return
	}
	locale := query.Get("locale")
	if locale != "" && !languageTag.MatchString(locale) {
		fail(w, http.StatusBadRequest, "locale is not a language tag")
		return
	}
	banners, err := s.Store.LiveBanners(r.Context(), placement, baseLanguage(locale))
	if err != nil {
		s.failErr(w, err, "list banners")
		return
	}
	s.signBanners(r.Context(), banners)
	writeJSON(w, http.StatusOK, orNone(banners))
}

// handleAllBanners is every banner, for the console.
func (s *Server) handleAllBanners(w http.ResponseWriter, r *http.Request) {
	banners, err := s.Store.AllBanners(r.Context())
	if err != nil {
		s.failErr(w, err, "list banners")
		return
	}
	s.signBanners(r.Context(), banners)
	writeJSON(w, http.StatusOK, orNone(banners))
}

func (s *Server) handleCreateBanner(w http.ResponseWriter, r *http.Request) {
	in, ok := bannerInput(w, r)
	if !ok {
		return
	}
	banner, err := s.Store.CreateBanner(r.Context(), in)
	if err != nil {
		s.failErr(w, err, "create banner")
		return
	}
	writeJSON(w, http.StatusCreated, banner)
}

func (s *Server) handleUpdateBanner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	in, ok := bannerInput(w, r)
	if !ok {
		return
	}
	banner, err := s.Store.UpdateBanner(r.Context(), id, in)
	if err != nil {
		s.failErr(w, err, "update banner")
		return
	}
	s.signBanner(r.Context(), &banner)
	writeJSON(w, http.StatusOK, banner)
}

func (s *Server) handleDeleteBanner(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	key, err := s.Store.DeleteBanner(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "delete banner")
		return
	}
	s.dropBannerImage(r.Context(), key)
	w.WriteHeader(http.StatusNoContent)
}

// handleBannerImage stores a banner's picture, replacing any it had.
func (s *Server) handleBannerImage(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	contentType := r.Header.Get("Content-Type")
	if !bannerImageTypes[contentType] {
		fail(w, http.StatusUnsupportedMediaType, "a banner's picture is a PNG, JPEG or WebP")
		return
	}
	if _, err := s.Store.BannerByID(r.Context(), id); err != nil {
		s.failErr(w, err, "get banner")
		return
	}
	body := http.MaxBytesReader(w, r.Body, maxBannerImage)
	defer body.Close()
	key := "banner/" + id.String() + "/" + uuid.NewString() + extensionFor(contentType)
	if err := s.Storage.Put(r.Context(), storage.Clips, key, body, -1, contentType); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			fail(w, http.StatusRequestEntityTooLarge, "a banner's picture can be at most 3 MB")
			return
		}
		s.failErr(w, err, "store banner image")
		return
	}
	old, err := s.Store.SetBannerImage(r.Context(), id, &key)
	if err != nil {
		s.dropBannerImage(r.Context(), &key)
		s.failErr(w, err, "record banner image")
		return
	}
	s.dropBannerImage(r.Context(), old)
	banner, err := s.Store.BannerByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get banner")
		return
	}
	s.signBanner(r.Context(), &banner)
	writeJSON(w, http.StatusOK, banner)
}

// handleRemoveBannerImage takes a banner's picture away and leaves the rest.
func (s *Server) handleRemoveBannerImage(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	old, err := s.Store.SetBannerImage(r.Context(), id, nil)
	if err != nil {
		s.failErr(w, err, "remove banner image")
		return
	}
	s.dropBannerImage(r.Context(), old)
	w.WriteHeader(http.StatusNoContent)
}

// bannerInput reads and checks what the console sent.
//
// The link is either a path inside the app or an https address: a banner is
// shown to every learner, and a javascript: or http: link on it would be a hole
// with the app's name on it.
func bannerInput(w http.ResponseWriter, r *http.Request) (store.BannerInput, bool) {
	var in store.BannerInput
	if err := decodeJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return in, false
	}
	in.Title = strings.TrimSpace(in.Title)
	in.Body = strings.TrimSpace(in.Body)
	in.LinkURL = strings.TrimSpace(in.LinkURL)
	in.LinkLabel = strings.TrimSpace(in.LinkLabel)

	problem := ""
	switch {
	case in.Title == "":
		problem = "a banner needs a title"
	case utf8.RuneCountInString(in.Title) > 120:
		problem = "a title can be at most 120 characters"
	case utf8.RuneCountInString(in.Body) > 400:
		problem = "the text can be at most 400 characters"
	case in.LinkURL != "" && !safeLink(in.LinkURL):
		problem = "a link is a path in the app, like /library, or an https:// address"
	case in.LinkURL != "" && in.LinkLabel == "":
		problem = "a link needs a label for its button"
	case utf8.RuneCountInString(in.LinkLabel) > 40:
		problem = "a button label can be at most 40 characters"
	case in.Placement != store.PlaceDashboard && in.Placement != store.PlaceLibrary:
		problem = "placement is dashboard or library"
	case in.Locale != "" && !languageTag.MatchString(in.Locale):
		problem = "locale is not a language tag"
	case in.StartsAt != nil && in.EndsAt != nil && !in.EndsAt.After(*in.StartsAt):
		problem = "a banner has to end after it starts"
	}
	if problem != "" {
		fail(w, http.StatusBadRequest, problem)
		return in, false
	}
	in.Locale = baseLanguage(in.Locale)
	if in.LinkURL == "" {
		in.LinkLabel = ""
	}
	return in, true
}

// safeLink is a path inside the app, or an https address.
func safeLink(link string) bool {
	if strings.HasPrefix(link, "/") {
		// "//host" is a path in form only: a browser reads it as another site.
		return !strings.HasPrefix(link, "//") && !strings.ContainsAny(link, "\\ \t\n")
	}
	return strings.HasPrefix(link, "https://") && len(link) > len("https://") &&
		!strings.ContainsAny(link, " \t\n")
}

// baseLanguage is a tag's language: "vi-VN" is "vi". Banners are written for a
// language, not for a region of it.
func baseLanguage(tag string) string {
	base, _, _ := strings.Cut(strings.ToLower(tag), "-")
	return base
}

func (s *Server) signBanners(ctx context.Context, banners []store.Banner) {
	for i := range banners {
		s.signBanner(ctx, &banners[i])
	}
}

func (s *Server) signBanner(ctx context.Context, b *store.Banner) {
	if b.ImageKey == nil {
		return
	}
	url, err := s.Storage.SignedGetURL(ctx, storage.Clips, *b.ImageKey, 24*time.Hour)
	if err != nil {
		// A banner without its picture is still a banner.
		s.Log.Warn("sign banner image", "banner", b.ID, "error", err)
		return
	}
	b.ImageURL = url
}

func (s *Server) dropBannerImage(ctx context.Context, key *string) {
	if key == nil {
		return
	}
	if err := s.Storage.Delete(ctx, storage.Clips, *key); err != nil {
		s.Log.Warn("orphaned banner image", "key", *key, "error", err)
	}
}

// orNone is a list that encodes as [] when empty, never null.
func orNone[T any](in []T) []T {
	if in == nil {
		return []T{}
	}
	return in
}
