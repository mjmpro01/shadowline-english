package api

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/storage"
)

// A recording can come from a link as well as from a file. The admin pastes the
// address of a short video, the transcribing worker downloads it, and from
// there it is an upload like any other: transcribed, cut in the studio,
// published. The recording is kept as it was published, and the channel it
// came from is written on the row so every clip cut from it can say whose it
// is.

// maxLinkLength is longer than any real video page's address.
const maxLinkLength = 2048

// handleCreateLinkUpload writes the row and queues the download. The studio
// polls the upload until the worker has stored it, then opens it like a file.
func (s *Server) handleCreateLinkUpload(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	var body struct {
		URL  string `json:"url"`
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	link, err := linkToFetch(body.URL)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	// With no name given the link stands in for one, and the worker replaces
	// it with the video's own title when it has it.
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = link
	}
	source, err := s.Store.CreateLinkUpload(r.Context(), name, link, u.ID)
	if err != nil {
		s.failErr(w, err, "record a linked upload")
		return
	}
	writeJSON(w, http.StatusCreated, source)
}

// linkToFetch is the address as the worker will be given it, or why it will
// not be.
//
// The worker fetches what it is handed from inside the server's network, so
// this is also where an address that points back into that network is turned
// away: only https, only a named public host, no credentials, no odd ports.
// The worker checks again where the name resolves to before it connects —
// a name is not an address, and this cannot see what it will resolve to.
func linkToFetch(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("paste the address of the video")
	}
	if len(raw) > maxLinkLength {
		return "", errors.New("that address is too long")
	}
	link, err := url.Parse(raw)
	if err != nil || link.Host == "" {
		return "", errors.New("that is not a web address")
	}
	if link.Scheme != "https" {
		return "", errors.New("the address must start with https://")
	}
	if link.User != nil {
		return "", errors.New("an address with a user name or password in it is not fetched")
	}
	if port := link.Port(); port != "" && port != "443" {
		return "", errors.New("an address with its own port is not fetched")
	}
	host := strings.ToLower(strings.TrimSuffix(link.Hostname(), "."))
	if net.ParseIP(host) != nil {
		return "", errors.New("the address must name a website, not a numeric address")
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") ||
		strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") ||
		!strings.Contains(host, ".") {
		return "", errors.New("that address is not a public website")
	}
	link.Fragment = ""
	return link.String(), nil
}

// handleUploadMedia hands the stored recording back to the studio, which
// decodes it in the browser to draw the waveform and choose the lines — the
// same as a file the admin picked, except this one arrived from a link.
//
// Streamed through the API rather than redirected to a signed address: the
// studio reads it with fetch, and a fetch from the object store's own host
// would need that store to allow the console's origin.
func (s *Server) handleUploadMedia(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	upload, err := s.Store.UploadByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get upload")
		return
	}
	if upload.UploadState != "stored" {
		fail(w, http.StatusConflict, "the recording has not arrived yet")
		return
	}
	source, err := s.Store.SourceByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get source")
		return
	}
	if source.Key == "" {
		fail(w, http.StatusNotFound, "there is no file behind this recording")
		return
	}
	file, err := s.Storage.Open(r.Context(), storage.Clips, source.Key)
	if errors.Is(err, storage.ErrNotFound) {
		fail(w, http.StatusNotFound, "the recording is missing from the file store")
		return
	}
	if err != nil {
		s.failErr(w, err, "open source")
		return
	}
	defer file.Close()

	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(sourceUploadTimeout)); err != nil {
		s.Log.Warn("could not extend the deadline for a download", "error", err)
	}
	w.Header().Set("Content-Type", source.ContentType)
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, file); err != nil {
		s.Log.Warn("sending a recording back to the studio", "id", id, "error", err)
	}
}
