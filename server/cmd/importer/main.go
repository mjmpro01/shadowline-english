// Command importer takes videos from the file server set up in the console —
// SFTP or FTPS — and makes published clips of them: see internal/importer.
//
// It runs beside the API, from the same image and the same environment, every
// poll interval the console sets. `importer --once` runs a single pass and
// exits, for a timer on the host or for trying it by hand.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/shadowline/server/internal/config"
	"github.com/shadowline/server/internal/db"
	"github.com/shadowline/server/internal/importer"
	"github.com/shadowline/server/internal/remote"
	"github.com/shadowline/server/internal/secretbox"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
	"github.com/shadowline/server/internal/telemetry"
	"github.com/shadowline/server/internal/version"
)

func main() {
	once := flag.Bool("once", false, "run one pass and exit")
	flag.Parse()
	log := telemetry.NewLogger()
	if err := run(log, *once); err != nil {
		log.Error("importer stopped", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger, once bool) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	// The API migrates; the importer only waits until it has, so the two can
	// start in any order.
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	st := store.New(pool)
	blobs, err := openStorage(ctx, cfg)
	if err != nil {
		return err
	}
	box, err := secretbox.New(cfg.SessionSecret, importer.SecretPurpose)
	if err != nil {
		return err
	}
	im := &importer.Importer{
		Store: st, Storage: blobs, Box: box, Log: log,
		Dial:   remote.Dial,
		Settle: time.Minute,
		Sleep: func(ctx context.Context, d time.Duration) {
			select {
			case <-ctx.Done():
			case <-time.After(d):
			}
		},
	}

	if once {
		err := im.RunOnce(ctx)
		if errors.Is(err, importer.ErrNotSetUp) {
			log.Info(err.Error())
			return nil
		}
		return err
	}

	// A beat every ten seconds, as the workers beat, carrying whether a pass
	// is under way.
	var busy atomic.Bool
	beat := func() {
		if err := st.Beat(ctx, importer.Service, busy.Load(), version.Current(), version.Started); err != nil && ctx.Err() == nil {
			log.Warn("heartbeat failed", "error", err)
		}
	}
	go func() {
		tick := time.NewTicker(10 * time.Second)
		defer tick.Stop()
		for {
			beat()
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
			}
		}
	}()
	log.Info("importer started")
	im.Run(ctx, func(working bool) {
		busy.Store(working)
		beat()
	})
	return nil
}

// openStorage is where uploads go, as the API opens it. The importer only
// writes, so a disk store's links are never signed here.
func openStorage(ctx context.Context, cfg config.Config) (storage.Storage, error) {
	if cfg.S3Endpoint != "" {
		return storage.NewS3(ctx, storage.S3Options{
			Endpoint:       cfg.S3Endpoint,
			PublicEndpoint: cfg.S3PublicEndpoint,
			AccessKey:      cfg.S3AccessKey,
			SecretKey:      cfg.S3SecretKey,
			UseSSL:         cfg.S3UseSSL,
			Region:         cfg.S3Region,
			ClipsBucket:    cfg.ClipsBucket,
			TakesBucket:    cfg.TakesBucket,
		})
	}
	return storage.NewDisk(cfg.DiskRoot, "http://unused/files", func(storage.Bucket, string, time.Time) string { return "" })
}
