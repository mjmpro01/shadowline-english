// Command api serves the Shadowline backend.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/shadowline/server/internal/api"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/config"
	"github.com/shadowline/server/internal/db"
	"github.com/shadowline/server/internal/storage"
	"github.com/shadowline/server/internal/store"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if err := run(log); err != nil {
		log.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
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

	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	log.Info("database ready")

	st := store.New(pool)
	signer := auth.NewSigner(cfg.SessionSecret)

	blobs, err := openStorage(ctx, cfg, signer)
	if err != nil {
		return err
	}

	provider := auth.Provider(auth.NewGoogleProvider(cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.OAuthRedirectURL))
	if cfg.AuthFake {
		provider = auth.NewFakeProvider(cfg.OAuthRedirectURL)
		log.Warn("AUTH_FAKE=1 — anyone can sign in as any address. Never set this in production.")
	}

	srv := &api.Server{
		Cfg:      cfg,
		Store:    st,
		Storage:  blobs,
		Sessions: &auth.Manager{Store: st, Secure: strings.HasPrefix(cfg.AppOrigin, "https://")},
		Signer:   signer,
		Provider: provider,
		Log:      log,
	}

	go sweepSessions(ctx, st, log)

	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		// Generous because take uploads stream through this server when object
		// storage is disk-backed.
		WriteTimeout: 2 * time.Minute,
		IdleTimeout:  2 * time.Minute,
	}

	errs := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr, "app_origin", cfg.AppOrigin)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errs <- err
		}
	}()

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}

	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return httpSrv.Shutdown(shutdownCtx)
}

// openStorage picks S3 when an endpoint is configured and the local disk
// otherwise, so a laptop with no MinIO still runs the real code path.
func openStorage(ctx context.Context, cfg config.Config, signer *auth.Signer) (storage.Storage, error) {
	if cfg.S3Endpoint != "" {
		return storage.NewS3(ctx, storage.S3Options{
			Endpoint:    cfg.S3Endpoint,
			AccessKey:   cfg.S3AccessKey,
			SecretKey:   cfg.S3SecretKey,
			UseSSL:      cfg.S3UseSSL,
			Region:      cfg.S3Region,
			ClipsBucket: cfg.ClipsBucket,
			TakesBucket: cfg.TakesBucket,
		})
	}
	base := publicBase(cfg)
	return storage.NewDisk(cfg.DiskRoot, base+"/files", func(b storage.Bucket, key string, exp time.Time) string {
		return signer.SignPath(string(b), key, exp)
	})
}

// publicBase derives where this server is reachable from the OAuth redirect URL,
// which already has to be a public address for Google to send the browser back.
func publicBase(cfg config.Config) string {
	if i := strings.Index(cfg.OAuthRedirectURL, "/auth/"); i > 0 {
		return cfg.OAuthRedirectURL[:i]
	}
	return "http://localhost" + cfg.Addr
}

// sweepSessions deletes expired rows hourly. Without it the table only grows,
// and nothing else ever removes a session that simply timed out.
func sweepSessions(ctx context.Context, st *store.Store, log *slog.Logger) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n, err := st.DeleteExpiredSessions(ctx)
			if err != nil {
				log.Warn("session sweep failed", "error", err)
			} else if n > 0 {
				log.Info("swept expired sessions", "count", n)
			}
		}
	}
}
