// Package importer makes clips of videos nobody uploads by hand: it watches an
// inbox on a file server (SFTP or FTPS, set up in the console), takes each
// video dropped there, has it transcribed like any upload, cuts it into a
// line per clip from its transcript, and publishes them.
//
// On the server, a file goes through three folders:
//
//	inbox/<series>/<episode>.mp4       dropped here; a file straight in the inbox
//	                                   goes to the default series
//	processing/<series>/<episode>.mp4  taken, while it is transcribed and cut
//	done/<series>/<episode>.mp4        published
//	failed/<series>/<episode>.mp4      gave up, with <episode>.mp4.txt saying why
//
// so whoever drops files can see what became of them without the console.
package importer

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/autocut"
	"github.com/shadowline/server/internal/remote"
	"github.com/shadowline/server/internal/secretbox"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

// Service is the name the importer beats under, for the console's System page.
const Service = "importer"

// MaxBytes is the largest file taken: an upload's limit in the console.
const MaxBytes = 2 << 30

// SecretPurpose is what the file server's password is sealed for.
const SecretPurpose = "remote-import"

// ErrNotSetUp is an importer with no file server to read from yet.
var ErrNotSetUp = errors.New("no file server is set up for importing yet")

// Importer takes videos from the file server's inbox and makes clips of them.
type Importer struct {
	Store   *store.Store
	Storage storage.Storage
	Box     *secretbox.Box
	Log     *slog.Logger
	// Dial connects to the file server: remote.Dial, or a stand-in in tests.
	Dial func(context.Context, remote.Config) (remote.Remote, error)
	// Settle is how long a file's size has to stay the same before it is
	// taken, so one still being uploaded is left alone.
	Settle time.Duration
	// Sleep waits; replaced in tests so a settle costs nothing.
	Sleep func(context.Context, time.Duration)
}

// RemoteConfig is how to reach the file server from its settings, with the
// secret opened.
func RemoteConfig(s store.ImportSettings, box *secretbox.Box) (remote.Config, error) {
	c := remote.Config{
		Protocol: s.Protocol, Host: s.Host, Port: s.Port, Username: s.Username,
		TLSMode: s.TLSMode, TLSSkipVerify: s.TLSSkipVerify, HostKey: s.HostKey,
	}
	if len(s.Secret) > 0 {
		secret, err := box.Open(s.Secret)
		if err != nil {
			return c, err
		}
		if s.SecretKind == "key" {
			c.PrivateKey = secret
		} else {
			c.Password = secret
		}
	}
	return c, nil
}

// RunOnce is one pass: carry on with what was taken before, then take what is
// new in the inbox.
func (im *Importer) RunOnce(ctx context.Context) error {
	settings, err := im.Store.ImportSettings(ctx)
	if err != nil {
		return err
	}
	if settings == nil {
		return ErrNotSetUp
	}
	// Cutting needs only the database, so it happens before the file server is
	// reached: a server that is down holds back no clips of what is already in.
	offline := &pass{im: im, s: *settings}
	if err := offline.cutTranscribed(ctx); err != nil {
		return err
	}

	config, err := RemoteConfig(*settings, im.Box)
	if err != nil {
		return err
	}
	r, err := im.Dial(ctx, config)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", settings.Host, err)
	}
	defer r.Close()

	pass := &pass{im: im, r: r, s: *settings}
	if err := pass.carryOn(ctx); err != nil {
		return err
	}
	return pass.takeNew(ctx)
}

// pass is one connection's worth of work. r is nil in the part of a pass that
// runs before connecting, which does nothing that needs the file server.
type pass struct {
	im *Importer
	r  remote.Remote
	s  store.ImportSettings
}

// cutTranscribed makes the clips of every import whose words are in.
func (p *pass) cutTranscribed(ctx context.Context) error {
	working, err := p.im.Store.RemoteImportsWorking(ctx)
	if err != nil {
		return err
	}
	for _, imp := range working {
		if err := ctx.Err(); err != nil {
			return err
		}
		if imp.State == store.ImportTranscribing {
			p.cutWhenTranscribed(ctx, imp)
		}
	}
	return nil
}

// carryOn moves every import still working one step on, where it can.
func (p *pass) carryOn(ctx context.Context) error {
	working, err := p.im.Store.RemoteImportsWorking(ctx)
	if err != nil {
		return err
	}
	for _, imp := range working {
		if err := ctx.Err(); err != nil {
			return err
		}
		switch imp.State {
		case store.ImportDownloading:
			// A pass downloads what it takes before it ends, so a download
			// found here is one an importer died in the middle of: again.
			p.download(ctx, imp)
		case store.ImportTranscribing:
			p.cutWhenTranscribed(ctx, imp)
		case store.ImportCutting:
			p.finishWhenCut(ctx, imp)
		}
	}
	return nil
}

// candidate is a file to take: where it is, and the series and episode its
// place makes it.
type candidate struct {
	path    string
	series  string
	episode string
	name    string
	size    int64
	// orphan is a file found in processing with no import working on it:
	// taken by an importer that stopped before it could record it.
	orphan bool
}

// takeNew takes what has settled in the inbox, and what was left in
// processing without an import.
func (p *pass) takeNew(ctx context.Context) error {
	found, err := p.list(p.s.Inbox)
	if err != nil {
		return fmt.Errorf("list the inbox %s: %w", p.s.Inbox, err)
	}
	if len(found) > 0 && p.im.Settle > 0 {
		p.im.Sleep(ctx, p.im.Settle)
		again, err := p.list(p.s.Inbox)
		if err != nil {
			return fmt.Errorf("list the inbox %s: %w", p.s.Inbox, err)
		}
		was := map[string]int64{}
		for _, c := range found {
			was[c.path] = c.size
		}
		found = found[:0]
		for _, c := range again {
			// Taken only once it has stopped growing.
			if size, ok := was[c.path]; ok && size == c.size {
				found = append(found, c)
			}
		}
	}

	left, err := p.list(p.s.Processing)
	if err == nil {
		for _, c := range left {
			working, err := p.im.Store.ImportingAt(ctx, c.path)
			if err != nil {
				return err
			}
			if !working {
				c.orphan = true
				found = append(found, c)
			}
		}
	}

	for _, c := range found {
		if err := ctx.Err(); err != nil {
			return err
		}
		p.take(ctx, c)
	}
	return nil
}

// list is the videos in a folder and the folders one level down, each with
// the series its place makes it.
func (p *pass) list(root string) ([]candidate, error) {
	entries, err := p.r.List(root)
	if err != nil {
		return nil, err
	}
	var out []candidate
	add := func(e remote.Entry, series string) {
		if e.Dir || strings.HasPrefix(e.Name, ".") || !IsVideo(e.Name) {
			return
		}
		out = append(out, candidate{path: e.Path, series: series, episode: EpisodeTitle(e.Name), name: e.Name, size: e.Size})
	}
	for _, e := range entries {
		if !e.Dir {
			add(e, p.s.DefaultSeries)
			continue
		}
		if strings.HasPrefix(e.Name, ".") {
			continue
		}
		inner, err := p.r.List(e.Path)
		if err != nil {
			p.im.Log.Warn("cannot list a series folder", "folder", e.Path, "error", err)
			continue
		}
		for _, f := range inner {
			add(f, e.Name)
		}
	}
	return out, nil
}

// take moves a file to processing, records it, and downloads it.
func (p *pass) take(ctx context.Context, c candidate) {
	working := remote.Join(p.s.Processing, c.series, c.name)
	imp := store.RemoteImport{RemotePath: c.path, ProcessingPath: working, Series: c.series, Episode: c.episode, Bytes: c.size}
	if c.orphan {
		imp.RemotePath = remote.Join(p.s.Inbox, c.series, c.name)
	} else {
		if err := p.r.MkdirAll(remote.Join(p.s.Processing, c.series)); err != nil {
			p.im.Log.Warn("cannot make a processing folder", "series", c.series, "error", err)
			return
		}
		if err := p.r.Rename(c.path, working); err != nil {
			p.im.Log.Warn("cannot take a file from the inbox", "file", c.path, "error", err)
			return
		}
	}
	recorded, err := p.im.Store.StartRemoteImport(ctx, imp)
	if err != nil {
		p.im.Log.Warn("cannot record an import", "file", working, "error", err)
		return
	}
	p.im.Log.Info("importing", "file", imp.RemotePath, "series", imp.Series, "episode", imp.Episode)
	if c.size > MaxBytes {
		p.fail(ctx, recorded, fmt.Sprintf("the file is %d MB, more than the %d MB a recording can be", c.size>>20, MaxBytes>>20))
		return
	}
	p.download(ctx, recorded)
}

// download copies the file into storage as an upload of its own, which queues
// it to be transcribed like any other.
func (p *pass) download(ctx context.Context, imp store.RemoteImport) {
	name := path.Base(imp.ProcessingPath)
	contentType := ContentType(name)
	source, err := p.im.Store.CreateUpload(ctx, name, contentType, strings.HasPrefix(contentType, "video/"), imp.Bytes, 0, uuid.Nil)
	if err != nil {
		p.fail(ctx, imp, "could not record the recording: "+err.Error())
		return
	}
	failUpload := func(reason string) {
		_ = p.im.Store.UploadFailedWith(context.WithoutCancel(ctx), source.ID, reason)
		p.fail(ctx, imp, reason)
	}
	file, err := p.r.Open(imp.ProcessingPath)
	if err != nil {
		failUpload("could not read the file on the server: " + err.Error())
		return
	}
	key := "source/" + uuid.NewString() + strings.ToLower(path.Ext(name))
	err = p.im.Storage.Put(ctx, storage.Clips, key, file, imp.Bytes, contentType)
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		failUpload("could not download the file: " + err.Error())
		return
	}
	if err := p.im.Store.MarkImported(ctx, source.ID, imp.RemotePath, imp.Episode); err != nil {
		failUpload(err.Error())
		return
	}
	if err := p.im.Store.UploadStored(ctx, source.ID, key); err != nil {
		failUpload(err.Error())
		return
	}
	if err := p.im.Store.MoveRemoteImport(ctx, imp.ID, store.ImportTranscribing, &source.ID, 0, ""); err != nil {
		p.im.Log.Warn("cannot record a download", "file", imp.ProcessingPath, "error", err)
	}
}

// cutWhenTranscribed makes the clips once the words are in, or gives up when
// the transcriber did. Giving up moves the file, so before the file server is
// reached (p.r nil) it is left for the pass that has.
func (p *pass) cutWhenTranscribed(ctx context.Context, imp store.RemoteImport) {
	giveUp := func(reason string) {
		if p.r != nil {
			p.fail(ctx, imp, reason)
		}
	}
	if imp.SourceID == nil {
		giveUp("the recording was deleted before it was cut")
		return
	}
	upload, err := p.im.Store.UploadByID(ctx, *imp.SourceID)
	if errors.Is(err, store.ErrNotFound) {
		giveUp("the recording was deleted before it was cut")
		return
	}
	if err != nil {
		p.im.Log.Warn("cannot read an imported recording", "file", imp.ProcessingPath, "error", err)
		return
	}
	switch upload.Transcript {
	case "pending":
		return
	case "failed":
		reason := "the recording could not be transcribed"
		if upload.TranscribeError != "" {
			reason += ": " + upload.TranscribeError
		}
		giveUp(reason)
		return
	}
	// Clips already there were made by a pass that stopped before it could
	// say so: they are not made twice.
	if upload.Clips > 0 {
		_ = p.im.Store.MoveRemoteImport(ctx, imp.ID, store.ImportCutting, nil, upload.Clips, "")
		return
	}
	claimed, err := p.im.Store.ClaimImportForCutting(ctx, imp.ID)
	if err != nil || !claimed {
		// Cut from the console in the meantime, or not reachable: either
		// way, not this pass's to cut.
		return
	}
	made, err := Publish(ctx, p.im.Store, *imp.SourceID, imp.Series, path.Base(imp.ProcessingPath))
	switch {
	case errors.Is(err, ErrNoSpeech):
		_ = p.im.Store.ReleaseImportClaim(ctx, imp.ID)
		giveUp("no speech was found in the recording")
		return
	case err != nil:
		reason := fmt.Sprintf("could not publish its clips: %v", err)
		if p.r != nil {
			p.fail(ctx, imp, reason)
		} else if err := p.im.Store.MoveRemoteImport(ctx, imp.ID, store.ImportFailed, nil, made, reason); err != nil {
			p.im.Log.Warn("cannot record an import failed", "file", imp.ProcessingPath, "error", err)
		}
		return
	}
	p.im.Log.Info("published", "file", imp.RemotePath, "clips", made)
	if err := p.im.Store.MoveRemoteImport(ctx, imp.ID, store.ImportCutting, nil, made, ""); err != nil {
		p.im.Log.Warn("cannot record the clips", "file", imp.ProcessingPath, "error", err)
	}
}

// ErrNoSpeech is a recording whose transcript has no line to make a clip of.
var ErrNoSpeech = errors.New("no speech was found in the recording")

// Publish cuts a transcribed recording into a clip per line and publishes them
// in a series, created if there is none by that name: the importer's own cut,
// and the console's "Cut automatically". It says how many it made, which is
// some even when it fails part of the way.
func Publish(ctx context.Context, st *store.Store, source uuid.UUID, series, sourceName string) (int, error) {
	transcript, err := st.TranscriptBySource(ctx, source)
	if err != nil {
		return 0, fmt.Errorf("read the transcript: %w", err)
	}
	lines := autocut.Lines(transcript.Words, 0)
	if len(lines) == 0 {
		return 0, ErrNoSpeech
	}
	next, err := st.NextClipNumber(ctx, series)
	if err != nil {
		return 0, fmt.Errorf("number the clips: %w", err)
	}
	made := 0
	for i, line := range lines {
		_, err := st.CreateClip(ctx, store.NewClip{
			Title:           fmt.Sprintf("Clip %d", next+i),
			Source:          sourceName,
			Playlist:        series,
			TimestampLabel:  Timestamp(line.Start, line.End),
			DurationSeconds: line.Duration(),
			Captions:        []store.CaptionLine{{Text: line.Text, IPA: line.IPA}},
			SourceID:        &source,
			StartSeconds:    line.Start,
			EndSeconds:      line.End,
		}, uuid.Nil)
		if err != nil {
			return made, fmt.Errorf("clip %d of %d: %w", i+1, len(lines), err)
		}
		made++
	}
	return made, nil
}

// finishWhenCut moves the file to done once the cutter has made every clip's
// sound and picture.
func (p *pass) finishWhenCut(ctx context.Context, imp store.RemoteImport) {
	if imp.SourceID == nil {
		p.fail(ctx, imp, "the recording was deleted before it was cut")
		return
	}
	upload, err := p.im.Store.UploadByID(ctx, *imp.SourceID)
	if errors.Is(err, store.ErrNotFound) {
		p.fail(ctx, imp, "the recording was deleted before it was cut")
		return
	}
	if err != nil || upload.CutsLeft > 0 {
		return
	}
	if upload.CutsFailed > 0 {
		reason := fmt.Sprintf("%d of %d clips could not be cut", upload.CutsFailed, upload.Clips)
		if upload.CutError != "" {
			reason += ": " + upload.CutError
		}
		p.fail(ctx, imp, reason)
		return
	}
	p.moveTo(ctx, imp, p.s.Done)
	if err := p.im.Store.MoveRemoteImport(ctx, imp.ID, store.ImportDone, nil, upload.Clips, ""); err != nil {
		p.im.Log.Warn("cannot record an import done", "file", imp.ProcessingPath, "error", err)
	}
	p.im.Log.Info("imported", "file", imp.RemotePath, "clips", upload.Clips)
}

// fail gives up on a file: it goes to the failed folder with a note saying
// why, and the import records the same.
func (p *pass) fail(ctx context.Context, imp store.RemoteImport, reason string) {
	p.im.Log.Warn("import failed", "file", imp.RemotePath, "reason", reason)
	if to := p.moveTo(ctx, imp, p.s.Failed); to != "" {
		note := fmt.Sprintf("%s\n\n%s\nImported from %s on %s\n", reason, path.Base(imp.ProcessingPath),
			imp.RemotePath, time.Now().UTC().Format(time.RFC3339))
		if err := p.r.Put(to+".txt", strings.NewReader(note)); err != nil {
			p.im.Log.Warn("cannot write why an import failed", "file", to, "error", err)
		}
	}
	if err := p.im.Store.MoveRemoteImport(context.WithoutCancel(ctx), imp.ID, store.ImportFailed, nil, 0, reason); err != nil {
		p.im.Log.Warn("cannot record an import failed", "file", imp.ProcessingPath, "error", err)
	}
}

// moveTo moves the file from processing into a folder's series folder, and
// says where it went; empty when it could not be moved.
func (p *pass) moveTo(ctx context.Context, imp store.RemoteImport, folder string) string {
	dir := remote.Join(folder, imp.Series)
	to := remote.Join(dir, path.Base(imp.ProcessingPath))
	if err := p.r.MkdirAll(dir); err != nil {
		p.im.Log.Warn("cannot make a folder", "folder", dir, "error", err)
		return ""
	}
	if err := p.r.Rename(imp.ProcessingPath, to); err != nil {
		p.im.Log.Warn("cannot move a file", "from", imp.ProcessingPath, "to", to, "error", err)
		return ""
	}
	return to
}

// Run imports every poll interval until the context ends, beating for the
// console as it goes. A pass that fails is logged and the next one tries
// again: a server down for an hour is not a reason to stop.
func (im *Importer) Run(ctx context.Context, beat func(busy bool)) {
	for {
		beat(true)
		wait := 5 * time.Minute
		if s, err := im.Store.ImportSettings(ctx); err == nil && s != nil {
			wait = time.Duration(s.PollSeconds) * time.Second
		}
		switch err := im.RunOnce(ctx); {
		case errors.Is(err, ErrNotSetUp):
			im.Log.Info("waiting for a file server to be set up in the console")
			wait = time.Minute
		case err != nil && ctx.Err() == nil:
			im.Log.Warn("import pass failed", "error", err)
		}
		beat(false)
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// IsVideo is whether a file is a recording the importer takes.
func IsVideo(name string) bool {
	return ContentType(name) != ""
}

// ContentType is a recording's type from its extension, or empty for
// anything else.
func ContentType(name string) string {
	switch strings.ToLower(path.Ext(name)) {
	case ".mp4", ".m4v":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".webm":
		return "video/webm"
	case ".mkv":
		return "video/x-matroska"
	case ".mp3":
		return "audio/mpeg"
	case ".m4a":
		return "audio/mp4"
	case ".wav":
		return "audio/wav"
	}
	return ""
}

// EpisodeTitle is a file's name as an episode's: no extension, and the
// underscores and dashes people use for spaces read as spaces.
func EpisodeTitle(name string) string {
	title := strings.TrimSuffix(name, path.Ext(name))
	title = strings.NewReplacer("_", " ", " - ", " – ").Replace(title)
	return strings.Join(strings.Fields(title), " ")
}

// Timestamp is where a clip runs, as the studio writes it: "1:05–1:12".
func Timestamp(start, end float64) string {
	clock := func(s float64) string {
		total := int(s)
		return fmt.Sprintf("%d:%02d", total/60, total%60)
	}
	return clock(start) + "–" + clock(end)
}
