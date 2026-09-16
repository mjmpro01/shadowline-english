package storage

import (
	"context"
	"errors"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3 talks to MinIO or any S3-compatible service. Buckets stay private; the
// browser reaches objects only through presigned URLs, so audio never passes
// through the API process.
type S3 struct {
	client  *minio.Client
	buckets map[Bucket]string
}

type S3Options struct {
	Endpoint    string
	AccessKey   string
	SecretKey   string
	UseSSL      bool
	Region      string
	ClipsBucket string
	TakesBucket string
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

	s := &S3{
		client:  client,
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
	}
	return s, nil
}

func (s *S3) Put(ctx context.Context, bucket Bucket, key string, r io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.buckets[bucket], key, r, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *S3) SignedGetURL(ctx context.Context, bucket Bucket, key string, ttl time.Duration) (string, error) {
	u, err := s.client.PresignedGetObject(ctx, s.buckets[bucket], key, ttl, url.Values{})
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
