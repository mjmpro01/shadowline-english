package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Disk keeps objects in a directory and serves them back through the API rather
// than through signed object-storage URLs. Used by tests and by a local run with
// no MinIO; the signature it produces is checked by the handler in internal/api.
type Disk struct {
	Root string
	// BaseURL is what SignedGetURL prefixes, e.g. http://localhost:8080/files
	BaseURL string
	// Sign turns a path into a tamper-proof query string. Injected so the
	// package does not have to know how sessions are signed.
	Sign func(bucket Bucket, key string, expires time.Time) string
}

func NewDisk(root, baseURL string, sign func(Bucket, string, time.Time) string) (*Disk, error) {
	for _, b := range []Bucket{Clips, Takes} {
		if err := os.MkdirAll(filepath.Join(root, string(b)), 0o755); err != nil {
			return nil, err
		}
	}
	return &Disk{Root: root, BaseURL: strings.TrimSuffix(baseURL, "/"), Sign: sign}, nil
}

// path refuses any key that would escape its bucket directory. Keys are
// server-generated today, but a traversal bug here would be a file-system read
// primitive, so it is checked rather than assumed.
func (d *Disk) path(bucket Bucket, key string) (string, error) {
	if key == "" || strings.Contains(key, "..") || strings.ContainsAny(key, `\:`) || filepath.IsAbs(key) {
		return "", fmt.Errorf("invalid object key %q", key)
	}
	dir := filepath.Join(d.Root, string(bucket))
	full := filepath.Join(dir, filepath.Clean("/"+key))
	if !strings.HasPrefix(full, dir+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid object key %q", key)
	}
	return full, nil
}

func (d *Disk) Put(ctx context.Context, bucket Bucket, key string, r io.Reader, size int64, contentType string) error {
	full, err := d.path(bucket, key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	f, err := os.Create(full)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := io.Copy(f, r); err != nil {
		return err
	}
	return f.Sync()
}

func (d *Disk) SignedGetURL(ctx context.Context, bucket Bucket, key string, ttl time.Duration) (string, error) {
	if _, err := d.path(bucket, key); err != nil {
		return "", err
	}
	expires := time.Now().Add(ttl)
	return fmt.Sprintf("%s/%s/%s?%s", d.BaseURL, bucket, url.PathEscape(key), d.Sign(bucket, key, expires)), nil
}

func (d *Disk) Delete(ctx context.Context, bucket Bucket, key string) error {
	full, err := d.path(bucket, key)
	if err != nil {
		return err
	}
	if err := os.Remove(full); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

func (d *Disk) Open(ctx context.Context, bucket Bucket, key string) (io.ReadCloser, error) {
	full, err := d.path(bucket, key)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(full)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotFound
	}
	return f, err
}
