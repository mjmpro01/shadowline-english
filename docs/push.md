# Study reminders (Web Push)

Learners can ask to be reminded to practise. The **notifier** (`server/cmd/notifier`,
the `notifier` service in compose) looks once a minute and sends, by Web Push, at
most two reminders a day to each learner who turned them on, and none between
22:00 and 07:00 in their own time zone:

| Reminder | When | Example |
|---|---|---|
| Daily goal | at the time the learner chose, if today's goal is not reached | "Hôm nay bạn chưa luyện đủ 🎧 — Còn 12 điểm nữa là đạt mục tiêu" |
| Streak | from 21:30, if a streak of 2 days or more has nothing today | "🔥 Chuỗi 5 ngày sắp mất!" |
| New episodes | from 18:00, if a series they follow has new episodes in the last 24 hours | "Friends có 2 tập mới" |

The words follow the app's language (Vietnamese or English). Tapping a reminder
opens the app where it points, and is counted on the console's Growth page.

Push is free and needs no outside service: browsers deliver it through their own
push services (Google's, Mozilla's, Apple's). It needs a key pair, made once.

## Setting it up

1. Make a key pair, **on the server** — the private key stays in `server/.env` and
   nowhere else:

   ```sh
   cd /opt/shadowline/server
   docker compose run --rm --entrypoint vapid api
   # or, with Go installed: go run ./cmd/vapid
   ```

   It prints three lines. Put them in `server/.env`, with your own address in
   `VAPID_SUBJECT` (push services write to it if something is wrong):

   ```sh
   VAPID_PUBLIC_KEY=…
   VAPID_PRIVATE_KEY=…
   VAPID_SUBJECT=mailto:you@your-domain
   ```

   Keep the pair: a new one makes every learner's subscription useless, and each
   would have to turn reminders on again.

2. Restart the API and start the notifier:

   ```sh
   docker compose up -d api notifier
   docker compose logs -f notifier
   ```

   Without the keys the notifier says "push is not configured", sends nothing, and
   the app does not offer reminders. The console's **System** page shows it either
   way.

## What the learner sees

In **Profile → Study reminders**: a switch, the time, and whether to be told
about a streak about to end and new episodes. Turning it on asks the browser for
permission — only then, never by itself. "Send a test" sends one straight away.
The dashboard also offers to turn reminders on, once, after the first day the
goal is reached.

- **Android, Windows, macOS, Linux:** Chrome, Edge and Firefox, in the browser or
  as the installed app.
- **iPhone and iPad:** iOS/iPadOS 16.4 or later, and only from the app added to the
  Home Screen (Share → Add to Home Screen). The app says so.

A browser whose push service says it is gone (404/410) is forgotten; one that
fails five times in a row is left alone until the learner turns reminders on
again.

## Code

- `server/internal/notify`: `rules.go` (what to send when), `messages.go` (the
  words), `notifier.go` (the pass), `webpush.go` (the sender).
- `server/internal/store/push.go`; tables in migration `00038_push.sql`.
- API: `/api/push/key`, `/api/push/subscribe`, `/api/push/test`,
  `/api/push/opened`, `/api/reminders`.
- App: `app/public/sw.js` (shows a reminder and opens it), `app/src/lib/push.ts`,
  `app/src/components/RemindersCard.tsx`.
