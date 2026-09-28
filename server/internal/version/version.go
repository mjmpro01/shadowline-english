// Package version says which code this process is running.
//
// Shown in the console beside the workers' and the console's own, so a part
// left running from before a pull is visible rather than a mystery. The same
// rule as the workers (scoring/shadowline/version.py) and the console
// (app-admin/vite.config.ts), so the three compare:
//
//  1. SHADOWLINE_VERSION, when the deployment sets it (the Docker images do);
//  2. Commit, when the build stamped it with -ldflags;
//  3. the commit Go recorded at build time, for a `go build` in a checkout;
//  4. the checkout's commit from git, for `go run`, which records none;
//  5. "unknown".
//
// A commit is seven characters, with "-dirty" when tracked files had changes.
package version

import (
	"context"
	"os"
	"os/exec"
	"runtime/debug"
	"strings"
	"sync"
	"time"
)

// Commit can be stamped at build time:
// -ldflags "-X github.com/shadowline/server/internal/version.Commit=abc1234".
var Commit = ""

// Started is when this process started, near enough: when this package was
// loaded.
var Started = time.Now().UTC()

var (
	once    sync.Once
	current string
)

// Current is this process's version, worked out once.
func Current() string {
	once.Do(func() { current = resolve(os.Getenv, buildInfo, gitCommit) })
	return current
}

// resolve applies the rule above to its sources, which tests replace.
func resolve(getenv func(string) string, build func() string, git func() string) string {
	if pinned := strings.TrimSpace(getenv("SHADOWLINE_VERSION")); pinned != "" {
		return pinned
	}
	if Commit != "" {
		return Commit
	}
	if v := build(); v != "" {
		return v
	}
	if v := git(); v != "" {
		return v
	}
	return "unknown"
}

// buildInfo is the commit `go build` records when it builds in a checkout.
func buildInfo() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	var revision string
	var modified bool
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			revision = s.Value
		case "vcs.modified":
			modified = s.Value == "true"
		}
	}
	return short(revision, modified)
}

// gitCommit asks git, from wherever the process was started.
func gitCommit() string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "rev-parse", "HEAD").Output()
	if err != nil {
		return ""
	}
	status, err := exec.CommandContext(ctx, "git", "status", "--porcelain", "--untracked-files=no").Output()
	if err != nil {
		return ""
	}
	return short(strings.TrimSpace(string(out)), strings.TrimSpace(string(status)) != "")
}

func short(revision string, dirty bool) string {
	if len(revision) < 7 {
		return ""
	}
	v := revision[:7]
	if dirty {
		v += "-dirty"
	}
	return v
}
