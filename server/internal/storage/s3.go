package storage

import (
	"context"
	"errors"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/cors"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3 talks to MinIO or any S3-compatible service. Buckets stay private; the
// browser reaches objects only through presigned URLs, so audio never passes
// through the API process.
type S3 struct {
	client *minio.Client
	// sign is the client whose endpoint appears in presigned URLs. Inside
	// Docker that is usually localhost:9000 (what the browser can reach), while
	// client stays on minio:9000 (what this process can reach). Presigning does
	// not dial the endpoint — it only stamps the host into the signature — so
	// sign never has to be reachable from here.
	sign    *minio.Client
	buckets map[Bucket]string
}

type S3Options struct {
	Endpoint string
	// PublicEndpoint is the host:port the browser uses to fetch objects. Empty
	// means Endpoint is already public (typical for real S3). Required for the
	// Docker Compose layout, where Endpoint is the internal service name.
	PublicEndpoint string
	AccessKey      string
	SecretKey      string
	UseSSL         bool
	Region         string
	ClipsBucket    string
	TakesBucket    string
	// CORSOrigins are the browser origins allowed to GET objects. The React
	// app's origin belongs here; without it the video element loads a URL and
	// paints nothing.
	CORSOrigins []string
}

func NewS3(ctx context.Context, o S3Options) (*S3, error) {
	client, err := minio.New(o.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(o.AccessKey, o.SecretKey, ""),
		Secure: o.UseSSL,
		Region: o.Region,
	})
	if err != nil {
		return nil, err
	}

	sign := client
	if o.PublicEndpoint != "" && o.PublicEndpoint != o.Endpoint {
		sign, err = minio.New(o.PublicEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(o.AccessKey, o.SecretKey, ""),
			Secure: o.UseSSL,
			Region: o.Region,
		})
		if err != nil {
			return nil, err
		}
	}

	s := &S3{
		client:  client,
		sign:    sign,
		buckets: map[Bucket]string{Clips: o.ClipsBucket, Takes: o.TakesBucket},
	}
	for _, name := range s.buckets {
		exists, err := client.BucketExists(ctx, name)
		if err != nil {
			return nil, err
		}
		if !exists {
			if err := client.MakeBucket(ctx, name, minio.MakeBucketOptions{Region: o.Region}); err != nil {
				return nil, err
			}
		}
		if err := allowBrowserGets(ctx, client, name, o.CORSOrigins); err != nil {
			// MinIO's CORS API varies by version; a failure here must not
			// prevent the server from starting. Compose sets
			// MINIO_API_CORS_ALLOW_ORIGIN as the reliable path for local use.
			_ = err
		}
	}
	return s, nil
}

// allowBrowserGets lets the React origin fetch presigned objects. MinIO
// defaults to denying cross-origin GETs, which leaves <video> and <audio> on a
// URL that never loads — a black player with 0:00 on the clock.
func allowBrowserGets(ctx context.Context, client *minio.Client, bucket string, origins []string) error {
	if len(origins) == 0 {
		return nil
	}
	cfg := cors.NewConfig([]cors.Rule{{
		AllowedOrigin: origins,
		AllowedMethod: []string{"GET", "HEAD"},
		AllowedHeader: []string{"*"},
		ExposeHeader:  []string{"ETag", "Content-Length", "Content-Type", "Accept-Ranges", "Content-Range"},
		MaxAgeSeconds: 3600,
	}})
	return client.SetBucketCors(ctx, bucket, cfg)
}

func (s *S3) Put(ctx context.Context, bucket Bucket, key string, r io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.buckets[bucket], key, r, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *S3) SignedGetURL(ctx context.Context, bucket Bucket, key string, ttl time.Duration) (string, error) {
	u, err := s.sign.PresignedGetObject(ctx, s.buckets[bucket], key, ttl, url.Values{})
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func (s *S3) Delete(ctx context.Context, bucket Bucket, key string) error {
	return s.client.RemoveObject(ctx, s.buckets[bucket], key, minio.RemoveObjectOptions{})
}

func (s *S3) Open(ctx context.Context, bucket Bucket, key string) (io.ReadCloser, error) {
	obj, err := s.client.GetObject(ctx, s.buckets[bucket], key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	// GetObject is lazy: a missing key only surfaces on the first read, and the
	// caller should not have to know that.
	if _, err := obj.Stat(); err != nil {
		obj.Close()
		var resp minio.ErrorResponse
		if errors.As(err, &resp) && resp.Code == "NoSuchKey" {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return obj, nil
}
