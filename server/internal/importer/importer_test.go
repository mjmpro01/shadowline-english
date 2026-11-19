package importer

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/shadowline/server/internal/db"
	"github.com/shadowline/server/internal/remote"
	"github.com/shadowline/server/internal/remote/remotetest"
	"github.com/shadowline/server/internal/secretbox"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// memRemote is a file server in memory: paths to contents, folders implied.
type memRemote struct {
	mu    sync.Mutex
	files map[string][]byte
	dirs  map[string]bool
}

func newMem(files map[string]string) *memRemote {
	m := &memRemote{files: map[string][]byte{}, dirs: map[string]bool{"/": true}}
	for p, body := range files {
		m.files[p] = []byte(body)
		for d := path.Dir(p); d != "/"; d = path.Dir(d) {
			m.dirs[d] = true
		}
	}
	return m
}

func (m *memRemote) List(dir string) ([]remote.Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.dirs[dir] {
		return nil, fmt.Errorf("%s: file does not exist", dir)
	}
	seen := map[string]remote.Entry{}
	for p, body := range m.files {
		if path.Dir(p) == dir {
			seen[p] = remote.Entry{Path: p, Name: path.Base(p), Size: int64(len(body))}
		}
	}
	for d := range m.dirs {
		if d != dir && path.Dir(d) == dir {
			seen[d] = remote.Entry{Path: d, Name: path.Base(d), Dir: true}
		}
	}
	out := make([]remote.Entry, 0, len(seen))
	for _, e := range seen {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, nil
}

func (m *memRemote) Open(p string) (io.ReadCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	body, ok := m.files[p]
	if !ok {
		return nil, fmt.Errorf("%s: no such file", p)
	}
	return io.NopCloser(bytes.NewReader(body)), nil
}

func (m *memRemote) Put(p string, r io.Reader) error {
	body, err := io.ReadAll(r)
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.dirs[path.Dir(p)] {
		return fmt.Errorf("%s: no such folder", path.Dir(p))
	}
	m.files[p] = body
	return err
}

func (m *memRemote) Rename(from, to string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	body, ok := m.files[from]
	if !ok || !m.dirs[path.Dir(to)] {
		return fmt.Errorf("rename %s: no such file or folder", from)
	}
	delete(m.files, from)
	m.files[to] = body
	return nil
}

func (m *memRemote) Remove(p string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.files, p)
	return nil
}

func (m *memRemote) MkdirAll(dir string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for d := dir; d != "/"; d = path.Dir(d) {
		m.dirs[d] = true
	}
	return nil
}

func (m *memRemote) Close() error { return nil }

func (m *memRemote) has(p string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.files[p]
	return ok
}

func (m *memRemote) read(p string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return string(m.files[p])
}

type fixture struct {
	im   *Importer
	mem  *memRemote
	pool *pgxpool.Pool
	st   *store.Store
}

// newFixture is an importer on a fresh database, reading from mem, set up as
// an SFTP server with a password.
func newFixture(t *testing.T, mem *memRemote) *fixture {
	t.Helper()
	ctx := context.Background()
	adminURL := os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" {
		t.Skip("set TEST_DATABASE_URL to run the importer against Postgres")
	}
	name := fmt.Sprintf("shadowline_import_%d", time.Now().UnixNano())
	admin, err := db.Open(ctx, adminURL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec(ctx, "create database "+name); err != nil {
		t.Fatal(err)
	}
	admin.Close()
	u, _ := url.Parse(adminURL)
	u.Path = "/" + name
	pool, err := db.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		if a, err := db.Open(context.Background(), adminURL); err == nil {
			_, _ = a.Exec(context.Background(), "drop database if exists "+name)
			a.Close()
		}
	})
	blobs, err := storage.NewDisk(t.TempDir(), "http://x/files", func(storage.Bucket, string, time.Time) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	box, _ := secretbox.New(strings.Repeat("k", 32), SecretPurpose)
	st := store.New(pool)
	sealed, _ := box.Seal("hunter2")
	if err := st.SaveImportSettings(ctx, store.ImportSettings{
		Protocol: "sftp", Host: "files.example", Port: 22, Username: "shadow", SecretKind: "password",
		TLSMode: "explicit", HostKey: "SHA256:abc", Inbox: "/inbox", Processing: "/processing", Done: "/done",
		Failed: "/failed", DefaultSeries: "Imported", PollSeconds: 300,
	}, sealed, uuid.Nil); err != nil {
		t.Fatal(err)
	}
	f := &fixture{mem: mem, pool: pool, st: st}
	f.im = &Importer{
		Store: st, Storage: blobs, Box: box, Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Dial: func(_ context.Context, c remote.Config) (remote.Remote, error) {
			if c.Password != "hunter2" || c.HostKey != "SHA256:abc" {
				return nil, fmt.Errorf("signed in with %+v", c)
			}
			return mem, nil
		},
	}
	return f
}

func (f *fixture) run(t *testing.T) {
	t.Helper()
	if err := f.im.RunOnce(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}
}

func (f *fixture) imports(t *testing.T) []store.RemoteImport {
	t.Helper()
	rows, err := f.pool.Query(context.Background(), `select state, series, episode, clips, error, remote_path from remote_imports order by created_at`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []store.RemoteImport
	for rows.Next() {
		var r store.RemoteImport
		if err := rows.Scan(&r.State, &r.Series, &r.Episode, &r.Clips, &r.Error, &r.RemotePath); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

// transcribe does the transcriber's part for every recording waiting for it.
func (f *fixture) transcribe(t *testing.T, words string) {
	t.Helper()
	ctx := context.Background()
	if _, err := f.pool.Exec(ctx, `
		insert into transcripts (source_id, words, language)
		select source_id, $1::jsonb, 'en' from transcribe_jobs`, words); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `delete from transcribe_jobs`); err != nil {
		t.Fatal(err)
	}
}

// cut does the cutter's part: every clip gets its sound and picture.
func (f *fixture) cut(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	if _, err := f.pool.Exec(ctx, `update clips set audio_key = 'a.wav', video_key = 'v.mp4' where source_id is not null`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `delete from cut_jobs`); err != nil {
		t.Fatal(err)
	}
}

const twoSentences = `[
	{"start": 0.2, "end": 0.5, "text": "Hello", "ipa": "həˈloʊ"},
	{"start": 0.6, "end": 1.4, "text": "everyone.", "ipa": "ˈɛvriwʌn"},
	{"start": 2.5, "end": 2.8, "text": "Welcome", "ipa": "ˈwɛlkəm"},
	{"start": 2.9, "end": 3.1, "text": "to", "ipa": "tu"},
	{"start": 3.2, "end": 3.6, "text": "class.", "ipa": "klæs"}
]`

func TestAVideoDroppedInTheInboxBecomesPublishedClips(t *testing.T) {
	mem := newMem(map[string]string{
		"/inbox/Friends S1/Episode_01.mp4": "a video",
		"/inbox/loose talk.mov":            "another",
		"/inbox/notes.txt":                 "not a video",
	})
	f := newFixture(t, mem)
	ctx := context.Background()

	f.run(t)
	if !mem.has("/processing/Friends S1/Episode_01.mp4") || !mem.has("/processing/Imported/loose talk.mov") {
		t.Fatalf("not taken to processing: %v", mem.files)
	}
	if !mem.has("/inbox/notes.txt") {
		t.Fatal("a file that is not a video was taken")
	}
	got := f.imports(t)
	if len(got) != 2 || got[0].State != store.ImportTranscribing {
		t.Fatalf("imports: %+v", got)
	}
	var title, from, state string
	var published bool
	if err := f.pool.QueryRow(ctx, `select title, imported_from, upload_state, published from clip_sources
		where imported_from like '%Friends%'`).Scan(&title, &from, &state, &published); err != nil {
		t.Fatal(err)
	}
	if title != "Episode 01" || from != "/inbox/Friends S1/Episode_01.mp4" || state != "stored" || published {
		t.Fatalf("the recording: %q %q %q %v", title, from, state, published)
	}

	// Waiting on the transcriber: nothing moves.
	f.run(t)
	if f.imports(t)[0].State != store.ImportTranscribing {
		t.Fatal("moved on before the words were in")
	}

	f.transcribe(t, twoSentences)
	f.run(t)
	var clips int
	var series string
	if err := f.pool.QueryRow(ctx, `select count(*)::int, min(p.title) from clips c
		join playlists p on p.id = c.playlist_id where p.title = 'Friends S1'`).Scan(&clips, &series); err != nil {
		t.Fatal(err)
	}
	if clips != 2 || series != "Friends S1" {
		t.Fatalf("%d clips in %q", clips, series)
	}
	var caption, ts string
	if err := f.pool.QueryRow(ctx, `select captions->0->>'text', timestamp_label from clips
		where playlist = 'Friends S1' order by start_seconds limit 1`).Scan(&caption, &ts); err != nil {
		t.Fatal(err)
	}
	if caption != "Hello everyone." || ts != "0:00–0:01" {
		t.Fatalf("the first clip: %q %q", caption, ts)
	}
	if err := f.pool.QueryRow(ctx, `select published from clip_sources where imported_from like '%Friends%'`).Scan(&published); err != nil || !published {
		t.Fatal("the episode is not published")
	}
	if got := f.imports(t)[0]; got.State != store.ImportCutting || got.Clips != 2 {
		t.Fatalf("after cutting: %+v", got)
	}

	f.cut(t)
	f.run(t)
	if !mem.has("/done/Friends S1/Episode_01.mp4") || mem.has("/processing/Friends S1/Episode_01.mp4") {
		t.Fatalf("not moved to done: %v", mem.files)
	}
	if got := f.imports(t)[0]; got.State != store.ImportDone {
		t.Fatalf("done: %+v", got)
	}

	// A second pass takes nothing twice.
	f.run(t)
	if n := len(f.imports(t)); n != 2 {
		t.Fatalf("%d imports after another pass", n)
	}
}

func TestAFileThatCannotBeTranscribedGoesToFailedWithWhy(t *testing.T) {
	mem := newMem(map[string]string{"/inbox/Talks/silence.mp4": "quiet"})
	f := newFixture(t, mem)
	f.run(t)
	if _, err := f.pool.Exec(context.Background(),
		`update transcribe_jobs set state = 'failed', error = 'no speech found'`); err != nil {
		t.Fatal(err)
	}
	f.run(t)
	if !mem.has("/failed/Talks/silence.mp4") {
		t.Fatalf("not moved to failed: %v", mem.files)
	}
	if note := mem.read("/failed/Talks/silence.mp4.txt"); !strings.Contains(note, "could not be transcribed: no speech found") {
		t.Fatalf("the note: %q", note)
	}
	if got := f.imports(t)[0]; got.State != store.ImportFailed || !strings.Contains(got.Error, "no speech") {
		t.Fatalf("the import: %+v", got)
	}
}

func TestAFileStillUploadingIsLeftAlone(t *testing.T) {
	mem := newMem(map[string]string{"/inbox/Talks/big.mp4": "half"})
	f := newFixture(t, mem)
	f.im.Settle = time.Second
	f.im.Sleep = func(context.Context, time.Duration) {
		// The upload carries on while the importer waits.
		mem.mu.Lock()
		mem.files["/inbox/Talks/big.mp4"] = []byte("half and the rest")
		mem.mu.Unlock()
	}
	f.run(t)
	if !mem.has("/inbox/Talks/big.mp4") || len(f.imports(t)) != 0 {
		t.Fatal("a growing file was taken")
	}
	f.im.Sleep = func(context.Context, time.Duration) {}
	f.run(t)
	if mem.has("/inbox/Talks/big.mp4") || len(f.imports(t)) != 1 {
		t.Fatal("a settled file was not taken")
	}
}

func TestAFileLeftInProcessingIsTakenAgain(t *testing.T) {
	// An importer stopped between moving the file and recording it.
	mem := newMem(map[string]string{"/processing/Talks/stranded.mp4": "video"})
	mem.dirs["/inbox"] = true
	f := newFixture(t, mem)
	f.run(t)
	got := f.imports(t)
	if len(got) != 1 || got[0].State != store.ImportTranscribing || got[0].RemotePath != "/inbox/Talks/stranded.mp4" {
		t.Fatalf("imports: %+v", got)
	}
	f.run(t)
	if n := len(f.imports(t)); n != 1 {
		t.Fatalf("taken %d times", n)
	}
}

func TestNoServerSetUpIsNotAnError(t *testing.T) {
	f := newFixture(t, newMem(nil))
	if _, err := f.pool.Exec(context.Background(), `delete from remote_import_settings`); err != nil {
		t.Fatal(err)
	}
	if err := f.im.RunOnce(context.Background()); err != ErrNotSetUp {
		t.Fatalf("got %v", err)
	}
}

func TestNames(t *testing.T) {
	for name, want := range map[string]string{
		"Episode_01.mp4":         "Episode 01",
		"S01E02 - The Pilot.mkv": "S01E02 – The Pilot",
		"  spaced   out  .webm":  "spaced out",
		"lesson.final.v2.MP4":    "lesson.final.v2",
	} {
		if got := EpisodeTitle(name); got != want {
			t.Errorf("%q: %q, want %q", name, got, want)
		}
	}
	if !IsVideo("a.MOV") || !IsVideo("b.m4a") || IsVideo("c.txt") || IsVideo("d") {
		t.Error("which files are videos")
	}
	if got := Timestamp(65.4, 72.9); got != "1:05–1:12" {
		t.Errorf("timestamp %q", got)
	}
}

// The same import over a real SFTP connection: the renames and the notes
// travel through SSH, not a map.
func TestAnImportOverSFTP(t *testing.T) {
	server, err := remotetest.StartSFTP("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	if err := server.Put("/inbox/Talks/first.mp4", "a video"); err != nil {
		t.Fatal(err)
	}
	f := newFixture(t, newMem(nil))
	sealed, _ := f.im.Box.Seal(remotetest.Password)
	if err := f.st.SaveImportSettings(context.Background(), store.ImportSettings{
		Protocol: "sftp", Host: server.Host, Port: server.Port, Username: remotetest.Username,
		SecretKind: "password", TLSMode: "explicit", HostKey: server.HostKey, Inbox: "/inbox",
		Processing: "/processing", Done: "/done", Failed: "/failed", DefaultSeries: "Imported", PollSeconds: 300,
	}, sealed, uuid.Nil); err != nil {
		t.Fatal(err)
	}
	f.im.Dial = remote.Dial

	f.run(t)
	if !server.Exists("/processing/Talks/first.mp4") || server.Exists("/inbox/Talks/first.mp4") {
		t.Fatal("not taken over SFTP")
	}
	f.transcribe(t, twoSentences)
	f.run(t)
	f.cut(t)
	f.run(t)
	if !server.Exists("/done/Talks/first.mp4") {
		t.Fatal("not moved to done over SFTP")
	}
	if got := f.imports(t); len(got) != 1 || got[0].State != store.ImportDone || got[0].Clips != 2 {
		t.Fatalf("imports: %+v", got)
	}
}

// down makes the file server refuse every connection until up is called.
func (f *fixture) down() (up func()) {
	dial := f.im.Dial
	f.im.Dial = func(context.Context, remote.Config) (remote.Remote, error) {
		return nil, errors.New("connection refused")
	}
	return func() { f.im.Dial = dial }
}

func TestAServerThatIsDownHoldsBackNoClips(t *testing.T) {
	mem := newMem(map[string]string{"/inbox/Friends/Blues.mp4": "a video"})
	f := newFixture(t, mem)
	f.run(t)
	f.transcribe(t, twoSentences)

	up := f.down()
	if err := f.im.RunOnce(context.Background()); err == nil || !strings.Contains(err.Error(), "connection refused") {
		t.Fatalf("a pass with the server down: %v", err)
	}
	if got := f.imports(t)[0]; got.State != store.ImportCutting || got.Clips != 2 {
		t.Fatalf("not cut while the server was down: %+v", got)
	}

	// Back up, the file goes to done once the cutter has finished.
	up()
	f.cut(t)
	f.run(t)
	if !mem.has("/done/Friends/Blues.mp4") {
		t.Fatalf("not moved to done: %v", mem.files)
	}
}

func TestAFailureWaitsForTheServerToMoveTheFile(t *testing.T) {
	mem := newMem(map[string]string{"/inbox/Friends/Breaking news.mp4": "no sound"})
	f := newFixture(t, mem)
	f.run(t)
	if _, err := f.pool.Exec(context.Background(),
		`update transcribe_jobs set state = 'failed', error = 'the file has no sound track'`); err != nil {
		t.Fatal(err)
	}

	up := f.down()
	_ = f.im.RunOnce(context.Background())
	if got := f.imports(t)[0]; got.State != store.ImportTranscribing {
		t.Fatalf("gave up with nowhere to move the file: %+v", got)
	}

	up()
	f.run(t)
	if note := mem.read("/failed/Friends/Breaking news.mp4.txt"); !strings.Contains(note, "no sound track") {
		t.Fatalf("the note: %q (%v)", note, mem.files)
	}
	if got := f.imports(t)[0]; got.State != store.ImportFailed {
		t.Fatalf("the import: %+v", got)
	}
}

func TestATranscriptWithNoLinesFailsOnceTheServerIsBack(t *testing.T) {
	mem := newMem(map[string]string{"/inbox/Talks/hum.mp4": "music"})
	f := newFixture(t, mem)
	f.run(t)
	f.transcribe(t, `[]`)

	up := f.down()
	_ = f.im.RunOnce(context.Background())
	if got := f.imports(t)[0]; got.State != store.ImportTranscribing {
		t.Fatalf("offline, with no lines: %+v", got)
	}
	up()
	f.run(t)
	if got := f.imports(t)[0]; got.State != store.ImportFailed || !strings.Contains(got.Error, "no speech") {
		t.Fatalf("the import: %+v", got)
	}
	if !mem.has("/failed/Talks/hum.mp4") {
		t.Fatalf("not moved to failed: %v", mem.files)
	}
}
