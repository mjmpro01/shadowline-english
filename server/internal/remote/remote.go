// Package remote is a file server the importer reads videos from: SFTP (over
// SSH) or FTPS (FTP over TLS), behind one small interface, so the importer and
// the console's connection test do not care which.
package remote

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"path"
	"strings"
	"time"
)

// Protocols.
const (
	SFTP = "sftp"
	FTPS = "ftps"
)

// FTPS modes: STARTTLS on the ordinary port, or TLS from the first byte.
const (
	Explicit = "explicit"
	Implicit = "implicit"
)

// Config is how to reach and sign in to a server.
type Config struct {
	Protocol string
	Host     string
	Port     int
	Username string
	// Password signs in; for SFTP, PrivateKey can instead (PEM or OpenSSH).
	Password   string
	PrivateKey string
	// FTPS only.
	TLSMode       string
	TLSSkipVerify bool
	// SFTP only: the fingerprint of the server's host key ("SHA256:…") that
	// has been trusted. Empty, and the connection stops at the host key with
	// an UnknownHostKeyError saying what the server's is.
	HostKey string
	// Timeout for connecting, and for each command after.
	Timeout time.Duration
}

func (c Config) addr() string {
	return net.JoinHostPort(c.Host, fmt.Sprint(c.Port))
}

func (c Config) timeout() time.Duration {
	if c.Timeout > 0 {
		return c.Timeout
	}
	return 30 * time.Second
}

// Entry is a file or folder on the server.
type Entry struct {
	Path string
	Name string
	Size int64
	Dir  bool
}

// Remote is a connected file server.
type Remote interface {
	// List is a folder's entries, without "." and "..".
	List(dir string) ([]Entry, error)
	// Open reads a file; it must be closed before the next command.
	Open(file string) (io.ReadCloser, error)
	Put(file string, r io.Reader) error
	Rename(from, to string) error
	Remove(file string) error
	MkdirAll(dir string) error
	Close() error
}

// Dial connects and signs in.
func Dial(ctx context.Context, c Config) (Remote, error) {
	switch c.Protocol {
	case SFTP:
		return dialSFTP(ctx, c)
	case FTPS:
		return dialFTPS(ctx, c)
	default:
		return nil, fmt.Errorf("unknown protocol %q", c.Protocol)
	}
}

// UnknownHostKeyError is an SFTP server whose host key nobody has trusted yet:
// Fingerprint is the key it showed, for an admin to compare and trust.
type UnknownHostKeyError struct{ Fingerprint string }

func (e *UnknownHostKeyError) Error() string {
	return "the server's host key is not trusted yet: " + e.Fingerprint
}

// HostKeyMismatchError is an SFTP server showing a different host key from the
// one trusted: another machine, or someone in the way.
type HostKeyMismatchError struct{ Seen, Trusted string }

func (e *HostKeyMismatchError) Error() string {
	return fmt.Sprintf("the server's host key %s is not the trusted %s", e.Seen, e.Trusted)
}

// Problem names what went wrong in words an admin can act on, for the
// console's connection test.
type Problem string

const (
	Unreachable  Problem = "unreachable"
	BadLogin     Problem = "login"
	BadTLS       Problem = "tls"
	UnknownKey   Problem = "host_key_unknown"
	KeyMismatch  Problem = "host_key_mismatch"
	NoSuchFolder Problem = "no_folder"
	NoWrite      Problem = "no_write"
	Other        Problem = "other"
)

// Classify is what kind of failure an error is.
func Classify(err error) Problem {
	var unknown *UnknownHostKeyError
	var mismatch *HostKeyMismatchError
	var netErr net.Error
	var opErr *net.OpError
	var write interface{ WriteProblem() }
	msg := strings.ToLower(err.Error())
	switch {
	case errors.As(err, &write):
		return NoWrite
	case errors.As(err, &unknown):
		return UnknownKey
	case errors.As(err, &mismatch):
		return KeyMismatch
	case strings.Contains(msg, "unable to authenticate"), strings.Contains(msg, "530"),
		strings.Contains(msg, "login incorrect"), strings.Contains(msg, "authentication failed"),
		strings.Contains(msg, "permission denied (password"), strings.Contains(msg, "no supported methods"):
		return BadLogin
	case strings.Contains(msg, "x509"), strings.Contains(msg, "tls:"), strings.Contains(msg, "certificate"):
		return BadTLS
	case errors.As(err, &opErr), errors.As(err, &netErr), errors.Is(err, context.DeadlineExceeded),
		strings.Contains(msg, "no such host"), strings.Contains(msg, "connection refused"):
		return Unreachable
	case strings.Contains(msg, "not exist"), strings.Contains(msg, "no such file"), strings.Contains(msg, "550"):
		return NoSuchFolder
	}
	return Other
}

// Join is a path on the server: always forward slashes.
func Join(parts ...string) string { return path.Join(parts...) }
