# Shadowline API

Go service behind the React app in `../app`. Scoring is not done here — takes are
queued for the Python worker in `../scoring`.

## Running

```bash
cp .env.example .env     # then fill it in; see the OAuth note below
docker compose up
```

Without Docker, against a Postgres you already have:

```bash
DATABASE_URL=postgres://...  SESSION_SECRET=$(openssl rand -base64 32) \
AUTH_FAKE=1 DISK_ROOT=/tmp/shadowline-blobs \
go run ./cmd/api
```

Migrations are embedded and run on startup, so there is no separate migrate step.

## Tests

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres go test ./...
```

They run against a real Postgres — the schema leans on arrays, jsonb, enums and
`for update skip locked`, none of which a substitute reproduces faithfully enough
to trust. Each test creates its own database and drops it again, except when it
fails, where the database is left behind so you can open it.

## Google OAuth

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` come from the Google Cloud Console
(APIs & Services → Credentials → OAuth client ID, type "Web application", with
`OAUTH_REDIRECT_URL` as an authorised redirect URI). Nothing here can create
them. The flow is Authorization Code with PKCE; the verifier rides in a
short-lived cookie rather than in the state parameter, so the value proving we
started the exchange never passes through the provider.

`AUTH_FAKE=1` replaces Google with a stub that signs anyone in as whatever
address `?email=` names. It is how the Go and Playwright tests cover the whole
login path without credentials that cannot exist in CI, and it is refused by
nothing — so never set it in production.

Admin is decided by `ADMIN_EMAILS` at sign-in, and every admin route re-checks
it server-side. The app's `RequireAdmin` route only hides the screen.

## Why the queue is a table

One take produces one job. Ten thousand learners recording fifty takes a day is
about six jobs a second, peaking near sixty — against Kafka's design point of
hundreds of thousands. The real limit is Python CPU: a take costs roughly a
second, so sixty a second needs about sixty cores, and no broker changes that.

A table gets two things a broker cannot. The job is written in the same
transaction as the take, so there is no window where a take exists with nothing
scheduled to score it. And there is no new infrastructure to run. Workers claim
with `for update skip locked`, which is what lets many of them poll one table
without blocking each other or handing out the same job twice
(`internal/store/jobs.go`).

Kafka earns its place when several independent consumers want the same event
stream — `take.scored` feeding a leaderboard, analytics and an ML dataset at
once — or when replay matters. The enqueue path is deliberately narrow so that
swap touches one file.

## Layout

```
cmd/api            main: config, pool, migrations, HTTP server
internal/config    every environment variable, validated at startup
internal/db        pool + embedded migrations
internal/store     all SQL, by hand — five tables do not need a generator
internal/auth      OAuth providers, session cookies, HMAC signing
internal/storage   Storage interface: S3/MinIO, or a directory on disk
internal/api       routing and handlers
```
