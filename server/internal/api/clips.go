package api

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// maxAudioBytes caps an upload. A six-second clip is well under a megabyte;
// eight leaves room for uncompressed WAV without letting the endpoint become a
// place to park files.
const maxAudioBytes = 8 << 20

// audioURLTTL is how long a signed audio URL stays good. Long enough to practise
// a clip without re-fetching, short enough that a leaked URL expires.
const audioURLTTL = time.Hour

func (s *Server) handleListClips(w http.ResponseWriter, r *http.Request) {
	clips, err := s.Store.ListClips(r.Context())
	if err != nil {
		s.failErr(w, err, "list clips")
		return
	}
	writeJSON(w, http.StatusOK, clips)
}

func (s *Server) handleGetClip(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	clip, err := s.Store.ClipByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get clip")
		return
	}
	writeJSON(w, http.StatusOK, clip)
}

// handleClipAudio answers with a signed URL rather than the bytes, so the audio
// itself never travels through this process.
func (s *Server) handleClipAudio(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	clip, err := s.Store.ClipByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get clip")
		return
	}
	if clip.AudioKey == nil {
		// Not an error: the seeded clips genuinely have no source audio, and the
		// app is built to show a take without a score in that case.
		writeJSON(w, http.StatusOK, map[string]any{"url": nil})
		return
	}
	url, err := s.Storage.SignedGetURL(r.Context(), storage.Clips, *clip.AudioKey, audioURLTTL)
	if err != nil {
		s.failErr(w, err, "sign clip audio url")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": url})
}

// handleCreateClips takes the studio's whole batch at once. The cuts of one
// recording belong together — publishing half of them would leave the library in
// a state the admin never chose.
func (s *Server) handleCreateClips(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	var body struct {
		Clips []store.NewClip `json:"clips"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Clips) == 0 {
		fail(w, http.StatusBadRequest, "no clips to publish")
		return
	}

	created := make([]store.Clip, 0, len(body.Clips))
	for _, in := range body.Clips {
		if err := validateClip(in); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		clip, err := s.Store.CreateClip(r.Context(), in, u.ID)
		if err != nil {
			s.failErr(w, err, "create clip")
			return
		}
		created = append(created, clip)
	}
	writeJSON(w, http.StatusCreated, created)
}

// MaxClipSeconds mirrors MAX_CLIP_SECONDS in app/src/data/types.ts. A clip is one
// line to shadow; the studio already refuses longer cuts, and so does this.
const MaxClipSeconds = 6

func validateClip(in store.NewClip) error {
	if in.Title == "" {
		return fmt.Errorf("every clip needs a name")
	}
	if in.DurationSeconds <= 0 {
		return fmt.Errorf("clip %q has no duration", in.Title)
	}
	// A tenth of a second of slack: the studio's boundaries are drawn from a
	// waveform, and rounding there should not be rejected here.
	if in.DurationSeconds > MaxClipSeconds+0.1 {
		return fmt.Errorf("clip %q is %.1fs — the limit is %ds", in.Title, in.DurationSeconds, MaxClipSeconds)
	}
	return nil
}

// handleUploadClipAudio stores a clip's source audio. Split from creation
// because the batch is JSON and the audio is not.
func (s *Server) handleUploadClipAudio(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if _, err := s.Store.ClipByID(r.Context(), id); err != nil {
		s.failErr(w, err, "get clip")
		return
	}

	key, err := s.putAudio(r, storage.Clips, "clip/"+id.String())
	if err != nil {
		s.failErr(w, err, "store clip audio")
		return
	}
	if err := s.Store.SetClipAudioKey(r.Context(), id, key); err != nil {
		s.failErr(w, err, "record clip audio key")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleUpdateClip(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var patch store.ClipPatch
	if err := decodeJSON(r, &patch); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	clip, err := s.Store.UpdateClip(r.Context(), id, patch)
	if err != nil {
		s.failErr(w, err, "update clip")
		return
	}
	writeJSON(w, http.StatusOK, clip)
}

// handleDeleteClip removes the objects as well as the rows. The browser version
// of this never did — blobStore.deleteBlob was written and never called — which
// is free to ignore on a laptop and a bill on S3.
func (s *Server) handleDeleteClip(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	clipKey, takeKeys, err := s.Store.DeleteClip(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "delete clip")
		return
	}
	if clipKey != nil {
		if err := s.Storage.Delete(r.Context(), storage.Clips, *clipKey); err != nil {
			// The row is already gone; losing the object is a leak to clean up
			// later, not a reason to fail the request.
			s.Log.Warn("orphaned clip audio", "key", *clipKey, "error", err)
		}
	}
	for _, k := range takeKeys {
		if err := s.Storage.Delete(r.Context(), storage.Takes, k); err != nil {
			s.Log.Warn("orphaned take audio", "key", k, "error", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// putAudio streams the request body into object storage under a unique key.
func (s *Server) putAudio(r *http.Request, bucket storage.Bucket, prefix string) (string, error) {
	body := http.MaxBytesReader(nil, r.Body, maxAudioBytes)
	defer body.Close()

	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	key := prefix + "/" + uuid.NewString() + extensionFor(contentType)

	// Size is unknown for a streamed body; -1 tells MinIO to buffer as it goes.
	if err := s.Storage.Put(r.Context(), bucket, key, body, -1, contentType); err != nil {
		return "", err
	}
	return key, nil
}

func extensionFor(contentType string) string {
	switch {
	case contentType == "audio/wav" || contentType == "audio/x-wav":
		return ".wav"
	case contentType == "audio/mpeg":
		return ".mp3"
	case contentType == "audio/ogg" || contentType == "audio/ogg; codecs=opus":
		return ".ogg"
	case contentType == "image/png":
		return ".png"
	case contentType == "image/jpeg":
		return ".jpg"
	default:
		// MediaRecorder's default in Chrome. Kept last so a type we do know
		// never falls through to it.
		return ".webm"
	}
}

func parseID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		fail(w, http.StatusNotFound, "not found")
		return uuid.Nil, false
	}
	return id, true
}

// handleFile serves disk-backed objects behind the signature that
// storage.Disk.SignedGetURL produced. With S3 configured this route is never hit.
func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")
	q := r.URL.Query()
	if !s.Signer.VerifyPath(bucket, key, q.Get("expires"), q.Get("sig")) {
		fail(w, http.StatusForbidden, "link expired")
		return
	}
	if bucket != string(storage.Clips) && bucket != string(storage.Takes) {
		fail(w, http.StatusNotFound, "not found")
		return
	}

	rc, err := s.Storage.Open(r.Context(), storage.Bucket(bucket), key)
	if err != nil {
		s.failErr(w, err, "open object")
		return
	}
	defer rc.Close()
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if _, err := io.Copy(w, rc); err != nil {
		s.Log.Warn("truncated file response", "key", key, "error", err)
	}
}
