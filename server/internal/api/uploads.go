package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// uploadPage is how many rows the history hands back at once.
const uploadPage = 25

// handleCreateUpload writes the row before a byte has been sent.
//
// Uploading used to be one request that stored the file and inserted the row
// after it, which meant a transfer still running had no row at all — nothing to
// show an admin whose two-hour film was on its way, and nothing left behind by
// one that died halfway. Two requests: this one says what is coming, the next
// carries it.
func (s *Server) handleCreateUpload(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	var body struct {
		Name        string  `json:"name"`
		ContentType string  `json:"contentType"`
		Bytes       int64   `json:"bytes"`
		Seconds     float64 `json:"seconds"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		fail(w, http.StatusBadRequest, "the recording needs a name")
		return
	}
	if body.Bytes > maxSourceBytes {
		fail(w, http.StatusRequestEntityTooLarge, "that recording is too large to upload")
		return
	}
	if body.ContentType == "" {
		body.ContentType = "application/octet-stream"
	}

	// Whether cutting is even attempted. An audio file has no picture to cut,
	// and its clips are queued for transcription alone.
	hasVideo := looksLikeVideo(body.ContentType, body.Name)
	source, err := s.Store.CreateUpload(
		r.Context(), body.Name, body.ContentType, hasVideo, body.Bytes, body.Seconds, u.ID)
	if err != nil {
		s.failErr(w, err, "record upload")
		return
	}
	writeJSON(w, http.StatusCreated, source)
}

// handleUploadFile carries the recording itself.
//
// The row already exists and says 'uploading', so a transfer that dies leaves
// something behind saying so rather than nothing at all. Transcription is queued
// by the same transaction that marks it stored: a stored recording with nothing
// reading it would leave the studio waiting for words that were never coming.
func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	upload, err := s.Store.UploadByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get upload")
		return
	}
	if upload.UploadState != "uploading" {
		fail(w, http.StatusConflict, "that recording has already been sent")
		return
	}

	// A big upload takes longer than any other request this server serves, so
	// this one gets its own deadline rather than raising it for everything.
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(sourceUploadTimeout)); err != nil {
		s.Log.Warn("could not extend the deadline for an upload", "error", err)
	}

	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	body := http.MaxBytesReader(w, r.Body, maxSourceBytes)
	defer body.Close()

	key := "source/" + uuid.NewString() + extensionFor(contentType)
	if err := s.Storage.Put(r.Context(), storage.Clips, key, body, -1, contentType); err != nil {
		// Written down rather than only logged: the history is where an admin
		// looks to find out why their film is not there.
		reason := "the upload did not finish"
		status := http.StatusInternalServerError
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			reason = "that recording is too large to upload"
			status = http.StatusRequestEntityTooLarge
		}
		// On a context of its own: the request's has usually expired by now,
		// which is most of what goes wrong here, and writing the reason down with
		// a dead context would fail too.
		note, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
		defer cancel()
		if err := s.Store.UploadFailedWith(note, id, reason); err != nil {
			s.Log.Warn("could not record a failed upload", "id", id, "error", err)
		}
		if status == http.StatusInternalServerError {
			s.failErr(w, err, "store upload")
			return
		}
		fail(w, status, reason)
		return
	}

	if err := s.Store.UploadStored(r.Context(), id, key); err != nil {
		// The object is already stored; without the row pointing at it nothing
		// will ever read it, so take it back out rather than leaving it to pay
		// rent.
		if err := s.Storage.Delete(r.Context(), storage.Clips, key); err != nil {
			s.Log.Warn("orphaned source object", "key", key, "error", err)
		}
		s.failErr(w, err, "record stored upload")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleListUploads is the history: every recording an admin has sent, newest
// first, with how far each one has got.
func (s *Server) handleListUploads(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit := intParam(query.Get("limit"), uploadPage, 1, 100)
	offset := intParam(query.Get("offset"), 0, 0, 1<<20)

	uploads, total, err := s.Store.Uploads(
		r.Context(), query.Get("q"), query.Get("state"), limit, offset)
	if err != nil {
		s.failErr(w, err, "list uploads")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"uploads": uploads, "total": total})
}

// handleGetUpload is one upload and the clips cut out of it.
func (s *Server) handleGetUpload(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	upload, err := s.Store.UploadByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get upload")
		return
	}
	clips, err := s.Store.ClipsByEpisode(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "list an upload's clips")
		return
	}
	s.signPosters(r.Context(), clips)
	writeJSON(w, http.StatusOK, map[string]any{"upload": upload, "clips": clips})
}

// handleRetryUpload puts the work that gave up back on the queue, and says how
// much it queued — "nothing to retry" is a real answer.
func (s *Server) handleRetryUpload(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	transcribe, cuts, err := s.Store.RetryUpload(r.Context(), id)
	if errors.Is(err, store.ErrNotStored) {
		fail(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		s.failErr(w, err, "retry an upload")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"transcribe": transcribe, "cuts": cuts})
}
