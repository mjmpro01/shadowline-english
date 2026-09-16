// Package storage keeps audio out of the database and out of the API's request
// path: clients upload to and download from object storage directly, using URLs
// the server signs. The disk implementation exists so tests — and a laptop with
// no MinIO — exercise the same code path.
package storage

import (
	"context"
	"fmt"
	"io"
	"time"
)

// Bucket names the two kinds of audio the app stores. They are separate buckets
// because their lifecycles differ: a clip is curated and long-lived, a take is
// a learner's recording that they can delete.
type Bucket string

const (
	Clips Bucket = "clips"
	Takes Bucket = "takes"
)

type Storage interface {
	// Put stores the object and returns the key to record on the row.
	Put(ctx context.Context, bucket Bucket, key string, r io.Reader, size int64, contentType string) error
	// SignedGetURL returns a URL the browser can fetch the object from directly.
	SignedGetURL(ctx context.Context, bucket Bucket, key string, ttl time.Duration) (string, error)
	Delete(ctx context.Context, bucket Bucket, key string) error
	Open(ctx context.Context, bucket Bucket, key string) (io.ReadCloser, error)
}

// ErrNotFound is returned by Open for a key that is not there, so callers can
// tell a missing recording from a broken storage backend.
var ErrNotFound = fmt.Errorf("object not found")
