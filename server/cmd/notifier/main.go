// Command notifier sends study reminders by Web Push: see internal/notify.
//
// It runs beside the API, from the same image and the same environment, and
// looks once a minute. Without VAPID keys in the environment push is off: it
// says so, keeps beating so the console shows it is there, and sends nothing.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
	// Time zones, for learners outside Vietnam, in an image with no tzdata.
	_ "time/tzdata"

	"github.com/shadowline/server/internal/config"
	"github.com/shadowline/server/internal/db"
	"github.com/shadowline/server/internal/notify"
	"github.com/shadowline/server/internal/store"
	"github.com/shadowline/server/internal/telemetry"
	"github.com/shadowline/server/internal/version"
)

func main() {
	log := telemetry.NewLogger()
	if err := run(log); err != nil {
		log.Error("notifier stopped", "error", err)
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
	// The API migrates; the notifier only waits until it has.
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	st := store.New(pool)
	n := &notify.Notifier{Store: st, Log: log}
	if cfg.PushConfigured() {
		n.Send = notify.WebPush(cfg.VAPIDPublicKey, cfg.VAPIDPrivateKey, cfg.VAPIDSubject, nil)
	} else {
		log.Info("push is not configured: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (docs/push.md)")
	}

	var busy atomic.Bool
	beat := func() {
		if err := st.Beat(ctx, notify.Service, busy.Load(), version.Current(), version.Started); err != nil && ctx.Err() == nil {
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
	log.Info("notifier started")
	n.Run(ctx, func(working bool) {
		busy.Store(working)
		beat()
	})
	return nil
}
