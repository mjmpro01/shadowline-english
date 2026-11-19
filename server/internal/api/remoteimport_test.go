package api_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/remote/remotetest"
	"github.com/shadowline/server/internal/store"
)

// The file server videos are imported from: set up in the console, its
// secret kept sealed, and tried before it is saved.

type importReportJSON struct {
	OK    bool `json:"ok"`
	Steps []struct {
		Step    string `json:"step"`
		OK      bool   `json:"ok"`
		Problem string `json:"problem"`
	} `json:"steps"`
	HostKey string `json:"hostKey"`
	Videos  int    `json:"videos"`
	Files   []struct {
		Path   string `json:"path"`
		Series string `json:"series"`
	} `json:"files"`
}

type importSettingsJSON struct {
	Protocol  string `json:"protocol"`
	Host      string `json:"host"`
	HasSecret bool   `json:"hasSecret"`
	HostKey   string `json:"hostKey"`
	Inbox     string `json:"inbox"`
	Secret    string `json:"secret"`
}

func sftpServer(t *testing.T) *remotetest.SFTPServer {
	t.Helper()
	s, err := remotetest.StartSFTP("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func importForm(s *remotetest.SFTPServer, fields map[string]any) map[string]any {
	out := map[string]any{
		"protocol": "sftp", "host": s.Host, "port": s.Port, "username": remotetest.Username,
		"secretKind": "password", "secret": remotetest.Password, "tlsMode": "explicit",
		"inbox": "/inbox", "processing": "/processing", "done": "/done", "failed": "/failed",
		"defaultSeries": "Imported", "pollSeconds": 300,
	}
	for k, v := range fields {
		out[k] = v
	}
	return out
}

func steps(r importReportJSON) string {
	var b strings.Builder
	for _, s := range r.Steps {
		b.WriteString(s.Step)
		if s.OK {
			b.WriteString("✓ ")
		} else {
			b.WriteString("✗" + s.Problem + " ")
		}
	}
	return strings.TrimSpace(b.String())
}

func TestTheFileServerIsTestedBeforeItIsTrusted(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	s := sftpServer(t)
	if err := s.Put("/inbox/Friends/Episode_01.mp4", "v"); err != nil {
		t.Fatal(err)
	}
	if err := s.Put("/inbox/loose.mov", "v"); err != nil {
		t.Fatal(err)
	}
	if err := s.Mkdir("/processing"); err != nil {
		t.Fatal(err)
	}

	// An untrusted server stops at its key, and says what it is.
	got := expect[importReportJSON](t, admin.json("POST", "/api/admin/import/test", importForm(s, nil)), http.StatusOK)
	if got.OK || got.HostKey != s.HostKey || steps(got) != "connect✓ hostKey✗host_key_unknown" {
		t.Fatalf("untrusted: %s %+v", steps(got), got)
	}
	// Saving an SFTP server needs its key trusted.
	expectCode(t, admin.json("PUT", "/api/admin/import/settings", importForm(s, nil)), http.StatusBadRequest, "import.noHostKey")

	// Trusted, everything is tried: the inbox read, the folders written.
	got = expect[importReportJSON](t, admin.json("POST", "/api/admin/import/test",
		importForm(s, map[string]any{"hostKey": s.HostKey})), http.StatusOK)
	if !got.OK || steps(got) != "connect✓ hostKey✓ login✓ inbox✓ write✓" || got.Videos != 2 {
		t.Fatalf("trusted: %s %+v", steps(got), got)
	}
	series := map[string]string{}
	for _, f := range got.Files {
		series[f.Path] = f.Series
	}
	if series["/inbox/Friends/Episode_01.mp4"] != "Friends" || series["/inbox/loose.mov"] != "Imported" {
		t.Fatalf("the files found: %+v", got.Files)
	}
	if !s.Exists("/done") || !s.Exists("/failed") || s.Exists("/processing/.shadowline-test") {
		t.Fatal("the test did not make the folders, or left its probe behind")
	}

	// A wrong password, and a missing inbox, each say so.
	got = expect[importReportJSON](t, admin.json("POST", "/api/admin/import/test",
		importForm(s, map[string]any{"hostKey": s.HostKey, "secret": "nope"})), http.StatusOK)
	if steps(got) != "connect✓ hostKey✓ login✗login" {
		t.Fatalf("wrong password: %s", steps(got))
	}
	got = expect[importReportJSON](t, admin.json("POST", "/api/admin/import/test",
		importForm(s, map[string]any{"hostKey": s.HostKey, "inbox": "/nowhere"})), http.StatusOK)
	if steps(got) != "connect✓ hostKey✓ login✓ inbox✗no_folder" {
		t.Fatalf("no inbox: %s", steps(got))
	}
}

func TestTheFileServersSecretIsKeptSealed(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	s := sftpServer(t)
	if err := s.Mkdir("/inbox"); err != nil {
		t.Fatal(err)
	}

	if got := expect[*importSettingsJSON](t, admin.json("GET", "/api/admin/import/settings", nil), http.StatusOK); got != nil {
		t.Fatalf("set up before anyone did: %+v", got)
	}
	expectStatus(t, learner.json("GET", "/api/admin/import/settings", nil), http.StatusForbidden)
	expectStatus(t, learner.json("POST", "/api/admin/import/test", importForm(s, nil)), http.StatusForbidden)

	saved := expect[importSettingsJSON](t, admin.json("PUT", "/api/admin/import/settings",
		importForm(s, map[string]any{"hostKey": s.HostKey, "host": "sftp://" + s.Host + "/"})), http.StatusOK)
	if !saved.HasSecret || saved.Secret != "" || saved.Host != s.Host || saved.HostKey != s.HostKey {
		t.Fatalf("saved: %+v", saved)
	}
	var sealed []byte
	if err := h.pool.QueryRow(context.Background(), `select secret from remote_import_settings`).Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(sealed), remotetest.Password) {
		t.Fatal("the password is stored as it was typed")
	}

	// Left empty, the saved password is used — for the same server only.
	got := expect[importReportJSON](t, admin.json("POST", "/api/admin/import/test",
		importForm(s, map[string]any{"hostKey": s.HostKey, "secret": ""})), http.StatusOK)
	if !got.OK {
		t.Fatalf("with the saved password: %s", steps(got))
	}
	expectCode(t, admin.json("POST", "/api/admin/import/test",
		importForm(s, map[string]any{"hostKey": s.HostKey, "secret": "", "host": "elsewhere.example"})),
		http.StatusBadRequest, "import.noSecret")
	expect[importSettingsJSON](t, admin.json("PUT", "/api/admin/import/settings",
		importForm(s, map[string]any{"hostKey": s.HostKey, "secret": "", "inbox": "/drop"})), http.StatusOK)
	if got := expect[importSettingsJSON](t, admin.json("GET", "/api/admin/import/settings", nil), http.StatusOK); !got.HasSecret || got.Inbox != "/drop" {
		t.Fatalf("a folder changed without the password: %+v", got)
	}

	for _, bad := range []map[string]any{
		{"protocol": "ftp"},
		{"port": 0},
		{"inbox": "/"},
		{"done": "/inbox/done"},
		{"processing": "/inbox"},
		{"pollSeconds": 10},
		{"secretKind": "key", "protocol": "ftps"},
	} {
		expectCode(t, admin.json("PUT", "/api/admin/import/settings", importForm(s, bad)), http.StatusBadRequest, "import.invalid")
	}
}

// importedRecording is a video the importer has taken and stored, waiting on
// its transcript, as the importer leaves it.
func (h *harness) importedRecording(t *testing.T, series, name string) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	src, err := h.store.CreateUpload(ctx, name, "video/mp4", true, 10, 0, uuid.Nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.store.MarkImported(ctx, src.ID, "/inbox/"+series+"/"+name, strings.TrimSuffix(name, ".mp4")); err != nil {
		t.Fatal(err)
	}
	if err := h.store.UploadStored(ctx, src.ID, "source/"+src.ID.String()+".mp4"); err != nil {
		t.Fatal(err)
	}
	imp, err := h.store.StartRemoteImport(ctx, store.RemoteImport{
		RemotePath: "/inbox/" + series + "/" + name, ProcessingPath: "/processing/" + series + "/" + name,
		Series: series, Episode: strings.TrimSuffix(name, ".mp4"), Bytes: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.store.MoveRemoteImport(ctx, imp.ID, store.ImportTranscribing, &src.ID, 0, ""); err != nil {
		t.Fatal(err)
	}
	return src.ID, imp.ID
}

func (h *harness) importState(t *testing.T, id uuid.UUID) (string, int) {
	t.Helper()
	var state string
	var clips int
	if err := h.pool.QueryRow(context.Background(), `select state, clips from remote_imports where id = $1`, id).Scan(&state, &clips); err != nil {
		t.Fatal(err)
	}
	return state, clips
}

func TestAnImportedRecordingIsCutFromTheConsole(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	src, imp := h.importedRecording(t, "Friends", "Blues.mp4")
	url := "/api/admin/uploads/" + src.String() + "/autocut"

	// Not before its words are in.
	expectCode(t, admin.json("POST", url, nil), http.StatusConflict, "upload.notTranscribed")
	expectStatus(t, learner.json("POST", url, nil), http.StatusForbidden)

	h.storeTranscript(t, src.String())
	got := expect[struct {
		Clips int `json:"clips"`
	}](t, admin.json("POST", url, nil), http.StatusOK)
	if got.Clips != 1 {
		t.Fatalf("%d clips", got.Clips)
	}
	var series, caption string
	var published bool
	if err := h.pool.QueryRow(context.Background(), `select c.playlist, c.captions->0->>'text', s.published
		from clips c join clip_sources s on s.id = c.source_id where c.source_id = $1`, src).Scan(&series, &caption, &published); err != nil {
		t.Fatal(err)
	}
	if series != "Friends" || caption != "One step" || !published {
		t.Fatalf("the clip: %q %q %v", series, caption, published)
	}
	if state, clips := h.importState(t, imp); state != store.ImportCutting || clips != 1 {
		t.Fatalf("the import: %s %d", state, clips)
	}
	if h.cutQueueDepth(t) != 1 {
		t.Fatal("the clip was not queued to be cut")
	}

	// Once is enough.
	expectCode(t, admin.json("POST", url, nil), http.StatusConflict, "upload.hasClips")
}

func TestOnlyAnImportedRecordingWithWordsIsCutFromTheConsole(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	// A recording from the studio is cut there.
	own := uploadSource(t, admin, "studio.mp4")
	h.storeTranscript(t, own.ID)
	expectCode(t, admin.json("POST", "/api/admin/uploads/"+own.ID+"/autocut", nil), http.StatusConflict, "upload.notImported")
	expectStatus(t, admin.json("POST", "/api/admin/uploads/"+uuid.NewString()+"/autocut", nil), http.StatusNotFound)

	// No line to cut: refused, and left for the importer to fail with a note.
	src, imp := h.importedRecording(t, "Music", "hum.mp4")
	if _, err := h.pool.Exec(context.Background(), `
		insert into transcripts (source_id, words, language) values ($1, '[]', 'en')`, src); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(context.Background(), `delete from transcribe_jobs where source_id = $1`, src); err != nil {
		t.Fatal(err)
	}
	expectCode(t, admin.json("POST", "/api/admin/uploads/"+src.String()+"/autocut", nil), http.StatusUnprocessableEntity, "upload.noSpeech")
	if state, _ := h.importState(t, imp); state != store.ImportTranscribing {
		t.Fatalf("the import: %s", state)
	}

	// An import the importer has already given up on is not cut.
	src2, imp2 := h.importedRecording(t, "Music", "gone.mp4")
	h.storeTranscript(t, src2.String())
	if err := h.store.MoveRemoteImport(context.Background(), imp2, store.ImportFailed, nil, 0, "moved away"); err != nil {
		t.Fatal(err)
	}
	expectCode(t, admin.json("POST", "/api/admin/uploads/"+src2.String()+"/autocut", nil), http.StatusConflict, "upload.cutting")
}
