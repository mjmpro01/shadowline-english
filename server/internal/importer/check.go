package importer

import (
	"context"
	"errors"
	"path"
	"strings"

	"github.com/shadowline/server/internal/remote"
)

// Folders are where the importer reads and writes on the server.
type Folders struct {
	Inbox, Processing, Done, Failed string
	DefaultSeries                   string
}

// Step is one thing the connection test tried, and how it went. Problem is a
// remote.Problem when it failed; Detail is what the server said.
type Step struct {
	Step    string `json:"step"`
	OK      bool   `json:"ok"`
	Problem string `json:"problem,omitempty"`
	Detail  string `json:"detail,omitempty"`
}

// Found is a video waiting in the inbox.
type Found struct {
	Path   string `json:"path"`
	Series string `json:"series"`
	Bytes  int64  `json:"bytes"`
}

// Report is what the console's "Test the connection" shows.
type Report struct {
	OK    bool   `json:"ok"`
	Steps []Step `json:"steps"`
	// HostKey is an SFTP server's key fingerprint when it is not trusted yet,
	// for an admin to compare with the server's own and trust.
	HostKey string `json:"hostKey,omitempty"`
	// Videos is how many are waiting in the inbox, and Files the first few.
	Videos int     `json:"videos"`
	Files  []Found `json:"files"`
}

// The test's steps, in order.
const (
	StepConnect = "connect"
	StepHostKey = "hostKey"
	StepLogin   = "login"
	StepInbox   = "inbox"
	StepWrite   = "write"
)

// shown is how many of the inbox's files the report lists.
const shown = 5

// Check connects as the importer would, signs in, reads the inbox, and makes
// sure it can write where it moves files to — without moving any.
func Check(ctx context.Context, dial func(context.Context, remote.Config) (remote.Remote, error), c remote.Config, f Folders) Report {
	rep := Report{Files: []Found{}}
	fail := func(step string, err error) Report {
		rep.Steps = append(rep.Steps, Step{Step: step, Problem: string(remote.Classify(err)), Detail: err.Error()})
		return rep
	}
	pass := func(step, detail string) {
		rep.Steps = append(rep.Steps, Step{Step: step, OK: true, Detail: detail})
	}

	r, err := dial(ctx, c)
	if err != nil {
		var unknown *remote.UnknownHostKeyError
		switch remote.Classify(err) {
		case remote.UnknownKey:
			errors.As(err, &unknown)
			rep.HostKey = unknown.Fingerprint
			pass(StepConnect, "")
			return fail(StepHostKey, err)
		case remote.KeyMismatch:
			pass(StepConnect, "")
			return fail(StepHostKey, err)
		case remote.BadLogin:
			pass(StepConnect, "")
			if c.Protocol == remote.SFTP {
				pass(StepHostKey, c.HostKey)
			}
			return fail(StepLogin, err)
		default:
			return fail(StepConnect, err)
		}
	}
	defer r.Close()
	pass(StepConnect, "")
	if c.Protocol == remote.SFTP {
		pass(StepHostKey, c.HostKey)
	}
	pass(StepLogin, c.Username)

	entries, err := r.List(f.Inbox)
	if err != nil {
		return fail(StepInbox, err)
	}
	add := func(e remote.Entry, series string) {
		if e.Dir || strings.HasPrefix(e.Name, ".") || !IsVideo(e.Name) {
			return
		}
		rep.Videos++
		if len(rep.Files) < shown {
			rep.Files = append(rep.Files, Found{Path: e.Path, Series: series, Bytes: e.Size})
		}
	}
	for _, e := range entries {
		if !e.Dir {
			add(e, f.DefaultSeries)
			continue
		}
		if strings.HasPrefix(e.Name, ".") {
			continue
		}
		if inner, err := r.List(e.Path); err == nil {
			for _, x := range inner {
				add(x, e.Name)
			}
		}
	}
	pass(StepInbox, f.Inbox)

	for _, dir := range []string{f.Processing, f.Done, f.Failed} {
		probe := path.Join(dir, ".shadowline-test")
		if err := r.MkdirAll(dir); err != nil {
			return fail(StepWrite, wrapWrite(dir, err))
		}
		if err := r.Put(probe, strings.NewReader("shadowline connection test\n")); err != nil {
			return fail(StepWrite, wrapWrite(dir, err))
		}
		if err := r.Remove(probe); err != nil {
			return fail(StepWrite, wrapWrite(dir, err))
		}
	}
	pass(StepWrite, strings.Join([]string{f.Processing, f.Done, f.Failed}, ", "))
	rep.OK = true
	return rep
}

// writeError is a folder the importer could not write in: always a write
// problem, whatever the server called it.
type writeError struct {
	dir string
	err error
}

func (e writeError) Error() string { return "cannot write in " + e.dir + ": " + e.err.Error() }

// WriteProblem marks it for remote.Classify.
func (writeError) WriteProblem() {}

func wrapWrite(dir string, err error) error { return writeError{dir, err} }
