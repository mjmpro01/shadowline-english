package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
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

// maxSourceBytes caps the recording a batch is cut out of. Two gigabytes covers
// an hour of 1080p; it is a different number from maxAudioBytes because it is a
// different thing — one file an admin uploads once, not a clip per learner.
const maxSourceBytes = 2 << 30

// sourceUploadTimeout replaces the server's write deadline for the one request
// that streams hundreds of megabytes. The global two minutes is right for every
// other route and would cut a large upload off mid-file.
const sourceUploadTimeout = 30 * time.Minute

// audioURLTTL is how long a signed audio URL stays good. Long enough to practise
// a clip without re-fetching, short enough that a leaked URL expires.
const audioURLTTL = time.Hour

// handleListClips answers for the clips a screen already knows it needs, and
// refuses to answer for all of them.
//
// It used to be the whole library, fetched once at sign-in. Against forty
// series that was 7.4MB and four hundred milliseconds — a fifth of it signed
// poster URLs for clips nobody was going to open, each one an HMAC and each
// one expiring in an hour. The refusal is the point: without it the habit
// comes back the next time a screen wants a list.
func (s *Server) handleListClips(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("ids"))
	if raw == "" {
		fail(w, http.StatusBadRequest, "ask for clips by id, or use one of the library endpoints")
		return
	}
	parts := strings.Split(raw, ",")
	if len(parts) > store.MaxClipIDs {
		fail(w, http.StatusBadRequest,
			fmt.Sprintf("that is %d clips — ask for at most %d at a time", len(parts), store.MaxClipIDs))
		return
	}
	ids := make([]uuid.UUID, 0, len(parts))
	for _, part := range parts {
		id, err := uuid.Parse(strings.TrimSpace(part))
		if err != nil {
			fail(w, http.StatusBadRequest, "that is not a clip id")
			return
		}
		ids = append(ids, id)
	}

	clips, err := s.Store.ClipsByIDs(r.Context(), ids)
	if err != nil {
		s.failErr(w, err, "list clips")
		return
	}
	s.signPosters(r.Context(), clips)
	writeJSON(w, http.StatusOK, clips)
}

// handleFeaturedClips is what the dashboard offers. An admin picks these, so
// there are a handful and no paging.
func (s *Server) handleFeaturedClips(w http.ResponseWriter, r *http.Request) {
	clips, err := s.Store.FeaturedClips(r.Context())
	if err != nil {
		s.failErr(w, err, "list featured clips")
		return
	}
	s.signPosters(r.Context(), clips)
	writeJSON(w, http.StatusOK, clips)
}

// handleNextUp is the clip to practise next: one this learner has never tried,
// or failing that the one they have scored worst on.
//
// A question about the whole library, which is why it is here. The browser
// worked it out, and being able to work it out is why the browser was being
// sent the whole library.
func (s *Server) handleNextUp(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	clip, err := s.Store.NextUp(r.Context(), u.ID)
	if errors.Is(err, store.ErrNotFound) {
		// An empty library is a real answer, not a failure.
		writeJSON(w, http.StatusOK, map[string]any{"clip": nil})
		return
	}
	if err != nil {
		s.failErr(w, err, "next up")
		return
	}
	clip.PosterURL = s.posterURL(r.Context(), clip)
	writeJSON(w, http.StatusOK, map[string]any{"clip": clip})
}

// handleLibrarySummary is the counts and the tags the app used to work out by
// counting the library it had been sent.
func (s *Server) handleLibrarySummary(w http.ResponseWriter, r *http.Request) {
	summary, err := s.Store.LibrarySummary(r.Context())
	if err != nil {
		s.failErr(w, err, "library summary")
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// studioPage caps what the clip manager asks for at once. The studio is the
// one screen whose job is the whole library, and it still pages through it.
const studioPage = 50

// handleNextClipNumber is what the studio shows as the placeholder for an
// unnamed clip, before anything is published. It used to be worked out from
// the library in the browser, which is one more thing the browser needed the
// library for — and it was wrong the moment two admins published at once.
func (s *Server) handleNextClipNumber(w http.ResponseWriter, r *http.Request) {
	next, err := s.Store.NextClipNumber(r.Context(), r.URL.Query().Get("playlist"))
	if err != nil {
		s.failErr(w, err, "next clip number")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"next": next})
}

func (s *Server) handleStudioClips(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit := intParam(query.Get("limit"), studioPage, 1, 200)
	offset := intParam(query.Get("offset"), 0, 0, 1<<20)

	clips, total, err := s.Store.StudioClips(r.Context(), query.Get("q"), limit, offset)
	if err != nil {
		s.failErr(w, err, "list clips for the studio")
		return
	}
	s.signPosters(r.Context(), clips)
	writeJSON(w, http.StatusOK, map[string]any{"clips": clips, "total": total})
}

// intParam reads a bounded number from the query string, falling back to the
// default for anything it cannot read. A page size is not worth a 400.
func intParam(raw string, fallback, min, max int) int {
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func (s *Server) signPosters(ctx context.Context, clips []store.Clip) {
	for i := range clips {
		clips[i].PosterURL = s.posterURL(ctx, clips[i])
	}
}

// posterURL signs the clip's still, or returns "" for a clip that has none —
// one cut from audio, or one whose cut has not finished.
//
// Signed here rather than fetched per card. The library is a grid, and asking
// where each thumbnail lives would be one round trip per clip on a screen that
// already has the whole list.
//
// A failure to sign is not a failure to list: the card falls back to the play
// icon it showed before posters existed, which is a worse card and not a
// broken screen.
func (s *Server) posterURL(ctx context.Context, clip store.Clip) string {
	return s.signPoster(ctx, clip.PosterKey, "clip", clip.ID.String())
}

// signPoster is the same for a clip's own still, for the one standing in for
// its episode, and for the one standing in for its series — the picture is the
// same object either way, and only what to say in the log when signing fails
// differs.
func (s *Server) signPoster(ctx context.Context, key *string, kind, id string) string {
	if key == nil {
		return ""
	}
	url, err := s.Storage.SignedGetURL(ctx, storage.Clips, *key, audioURLTTL)
	if err != nil {
		s.Log.Warn("could not sign a poster", "kind", kind, "id", id, "error", err)
		return ""
	}
	return url
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
	clip.PosterURL = s.posterURL(r.Context(), clip)
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

// handleClipVideo answers with a signed URL for the clip's video, or null.
//
// Null is the ordinary answer, not a failure: a clip cut from audio never has
// one, and a clip cut from video does not have one yet while its cut is still
// queued. The app plays the audio in both cases.
func (s *Server) handleClipVideo(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	clip, err := s.Store.ClipByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get clip")
		return
	}
	if clip.VideoKey == nil {
		writeJSON(w, http.StatusOK, map[string]any{"url": nil})
		return
	}
	url, err := s.Storage.SignedGetURL(r.Context(), storage.Clips, *clip.VideoKey, audioURLTTL)
	if err != nil {
		s.failErr(w, err, "sign clip video url")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": url})
}

// Extensions browsers routinely have no media type for. Chrome and Firefox
// both hand back an empty `file.type` for these, which arrives here as
// application/octet-stream.
var videoExtensions = []string{
	".mkv", ".m4v", ".mov", ".avi", ".wmv", ".flv", ".ts", ".mts", ".m2ts",
	".mpg", ".mpeg", ".3gp", ".ogv", ".webm", ".mp4",
}

// looksLikeVideo decides whether an upload has a picture in it.
//
// The media type first, because when the browser knows one it is right. But it
// often does not: `file.type` is empty for .mkv, .m4v, .ts and half a dozen
// others, and an empty type reaches this server as application/octet-stream.
// That used to mean the upload was filed as audio, no cut was ever queued, and
// every clip published from it reached its learner with no picture — with
// nothing anywhere saying why, because as far as the app was concerned nothing
// had gone wrong.
//
// So the file name gets a say when the type has nothing to offer. It is the
// admin's own file name rather than anything a stranger controls, and being
// wrong about it is cheap in one direction only: a cut queued for an audio
// file fails once and is dropped, while a cut never queued is silent for ever.
func looksLikeVideo(contentType, name string) bool {
	if strings.HasPrefix(contentType, "video/") {
		return true
	}
	if strings.HasPrefix(contentType, "audio/") {
		return false
	}
	lower := strings.ToLower(name)
	for _, ext := range videoExtensions {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

// handleUploadSource stores the recording a batch will be cut out of, and
// answers with the id the clips then reference.
//
// The file is uploaded once for the whole batch rather than once per clip: the
// studio may be publishing hundreds of lines out of one lecture, and sending
// the lecture hundreds of times is the difference between this working and not.
func (s *Server) handleUploadSource(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())

	// A big upload takes longer than any other request this server serves, so
	// this one gets its own deadline rather than raising it for everything.
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(sourceUploadTimeout)); err != nil {
		s.Log.Warn("could not extend the deadline for a source upload", "error", err)
	}

	name := r.URL.Query().Get("name")
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	body := http.MaxBytesReader(w, r.Body, maxSourceBytes)
	defer body.Close()
	key := "source/" + uuid.NewString() + extensionFor(contentType)
	if err := s.Storage.Put(r.Context(), storage.Clips, key, body, -1, contentType); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			fail(w, http.StatusRequestEntityTooLarge, "that recording is too large to upload")
			return
		}
		s.failErr(w, err, "store source")
		return
	}

	// Whether cutting is even attempted. An audio file has no picture to cut,
	// and its clips are queued for transcription alone.
	hasVideo := looksLikeVideo(contentType, name)
	source, err := s.Store.CreateSource(r.Context(), name, key, contentType, hasVideo, u.ID)
	if err != nil {
		// The object is already stored; without a row nothing will ever point
		// at it, so take it back out rather than leaving it to pay rent.
		if err := s.Storage.Delete(r.Context(), storage.Clips, key); err != nil {
			s.Log.Warn("orphaned source object", "key", key, "error", err)
		}
		s.failErr(w, err, "record source")
		return
	}
	writeJSON(w, http.StatusCreated, source)
}

// handleSourceTranscript answers with the words Whisper found in a source, or
// says they are still coming. The studio polls this while the admin works.
func (s *Server) handleSourceTranscript(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if _, err := s.Store.SourceByID(r.Context(), id); err != nil {
		s.failErr(w, err, "get source")
		return
	}
	transcript, err := s.Store.TranscriptBySource(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get transcript")
		return
	}
	writeJSON(w, http.StatusOK, transcript)
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
	clipKeys, takeKeys, err := s.Store.DeleteClip(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "delete clip")
		return
	}
	for _, key := range clipKeys {
		if err := s.Storage.Delete(r.Context(), storage.Clips, key); err != nil {
			// The row is already gone; losing the object is a leak to clean up
			// later, not a reason to fail the request.
			s.Log.Warn("orphaned clip object", "key", key, "error", err)
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

// contentTypeFor is extensionFor in reverse, for serving an object back. The
// disk backend stores no metadata, and an <audio> element handed a response
// with no usable type refuses to play it — "The element has no supported
// sources", with nothing to say which element or why.
func contentTypeFor(key string) string {
	switch strings.ToLower(path.Ext(key)) {
	case ".wav":
		return "audio/wav"
	case ".mp3":
		return "audio/mpeg"
	case ".ogg":
		return "audio/ogg"
	case ".webm":
		return "audio/webm"
	case ".mp4":
		return "video/mp4"
	case ".m4v":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	default:
		return "application/octet-stream"
	}
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
	// Sources keep their own extension so ffmpeg can tell what it is opening,
	// and so a cut video is served back as something a <video> will play.
	case contentType == "video/mp4":
		return ".mp4"
	case contentType == "video/quicktime":
		return ".mov"
	case contentType == "video/webm":
		return ".webm"
	case contentType == "video/x-matroska":
		return ".mkv"
	case strings.HasPrefix(contentType, "video/"):
		return ".mp4"
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
	key, err := url.PathUnescape(chi.URLParam(r, "*"))
	if err != nil {
		fail(w, http.StatusNotFound, "not found")
		return
	}
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
	w.Header().Set("Content-Type", contentTypeFor(key))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if _, err := io.Copy(w, rc); err != nil {
		s.Log.Warn("truncated file response", "key", key, "error", err)
	}
}
