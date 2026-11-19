package notify

import (
	"context"
	"io"
	"net/http"
	"strings"

	"github.com/SherClockHolmes/webpush-go"

	"github.com/shadowline/server/internal/store"
)

// TTL is how long a push service holds a reminder for a browser that is off:
// a reminder about today is no use tomorrow.
const TTL = 12 * 60 * 60

// SendFunc delivers a payload to one browser and answers with the push
// service's status.
type SendFunc func(ctx context.Context, sub store.Subscription, payload []byte) (int, error)

// WebPush is the real sender, signing with the server's VAPID keys. subject is
// a mailto: address or an https: URL the push services can reach the sender at.
func WebPush(publicKey, privateKey, subject string, client *http.Client) SendFunc {
	// The library adds "mailto:" itself, so one written in .env would come out
	// twice.
	subject = strings.TrimPrefix(subject, "mailto:")
	return func(ctx context.Context, sub store.Subscription, payload []byte) (int, error) {
		opts := &webpush.Options{
			Subscriber:      subject,
			VAPIDPublicKey:  publicKey,
			VAPIDPrivateKey: privateKey,
			TTL:             TTL,
			Urgency:         webpush.UrgencyNormal,
		}
		if client != nil {
			opts.HTTPClient = client
		}
		resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, opts)
		if err != nil {
			return 0, err
		}
		defer resp.Body.Close()
		_, _ = io.Copy(io.Discard, resp.Body)
		return resp.StatusCode, nil
	}
}
