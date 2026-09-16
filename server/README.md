# Shadowline API

Go service behind the React app in `../app`. Scoring is not done here — takes are
queued for the Python worker in `../scoring`.

## Running

```bash
cp .env.example .env     # then fill it in; see the OAuth note below
docker compose up
```

That brings up Postgres, MinIO, the API and the scoring worker, and publishes a
starter library once. The React app is separate — `npm run dev` in `../app`.

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

The flow is Authorization Code with PKCE. The verifier rides in a short-lived
cookie rather than in the state parameter, so the value proving we started the
exchange never passes through the provider.

### Getting credentials

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` come from Google. Nothing in this
project can create them for you, and they are the one part of setup that cannot
be automated.

Everything below lives under **Google Auth Platform** in the console. Older
guides — including earlier versions of this one — call it "APIs & Services →
OAuth consent screen"; Google split that one wizard into the separate
**Branding**, **Audience**, **Clients** and **Data Access** pages, so search for
the page names rather than the old path.

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and pick a
   project, or create one. The project only holds the credential; Shadowline
   calls no other Google API.
2. **Google Auth Platform → Branding.** App name, a support email and a
   developer email. This is what the consent screen shows.
3. **Google Auth Platform → Audience.** Choose **External** unless everyone
   signing in shares a Workspace domain, in which case **Internal** skips
   verification entirely.
4. While **Audience** says **Testing**, only the addresses listed there under
   **Test users** can sign in — everyone else is turned away with
   `access_denied`, which reaches the login screen as `cancelled`. Add your own
   address first. **Publish app** lifts that limit.
5. **Google Auth Platform → Data Access** is where scopes are declared, and for
   Shadowline you can skip it. The server asks for `openid`,
   `.../auth/userinfo.email` and `.../auth/userinfo.profile`; all three are
   non-sensitive, so Google grants them from the authorization request itself
   whether or not they are declared here, and an app that asks for only these
   can be published without a verification review. Declare them if you want the
   listing to be explicit — just do not add a fourth, because anything sensitive
   pulls the app into review.
6. **Google Auth Platform → Clients → Create client**, application type **Web
   application**.
7. Under **Authorised redirect URIs** add the exact value of
   `OAUTH_REDIRECT_URL` — scheme, host, port and path all have to match what the
   server sends, or Google answers `redirect_uri_mismatch` and the browser never
   comes back. For a laptop that is `http://localhost:8080/auth/google/callback`.
   Add each deployment's URL here too; the list can hold several.
8. Copy the client ID and secret into `.env`.

### Checking it works

```bash
cp .env.example .env     # fill in the two Google values, DATABASE_URL, SESSION_SECRET
docker compose up
```

Then open the app (`npm run dev` in `../app`) and press **Continue with Google**.
Three settings have to agree or the round trip breaks:

| Setting | Must be |
| --- | --- |
| `OAUTH_REDIRECT_URL` | character-for-character one of the authorised redirect URIs |
| `APP_ORIGIN` | where the React app is actually served — it is both the CORS origin and where the callback sends the browser afterwards |
| `ADMIN_EMAILS` | the addresses that get the clip studio, checked at sign-in |

When something goes wrong the callback does not answer with an error body: it is
a browser navigation, and one would leave the learner on this server's origin
looking at JSON. It redirects to `APP_ORIGIN/login?error=…` instead, and the
login screen turns the code into a sentence:

| Code | Means | Usual cause |
| --- | --- | --- |
| `expired` | the state was forged or is over ten minutes old | a stale tab, or a callback nobody started |
| `browser` | no PKCE cookie | the flow began in a different browser or profile |
| `cancelled` | the provider declined | "Cancel" at Google, or an address not on the test-user list |
| `failed` | the code would not exchange | wrong client secret, or an unverified Google address |
| `server` | our fault | see the server log, where the detail stays |

Only `cancelled` and `failed` involve Google at all. A `redirect_uri_mismatch`
never reaches here — Google shows its own screen before redirecting, which means
step 6 above does not match `OAUTH_REDIRECT_URL`.

### The fake provider

`AUTH_FAKE=1` replaces Google with a stub that signs anyone in as whatever
address `?email=` names. It is how the Go and Playwright tests cover the whole
login path — state, PKCE, session cookie and `ADMIN_EMAILS` — without
credentials that cannot exist in CI.

A deployment that reaches it has no authentication at all, so the server refuses
to start when `AUTH_FAKE=1` and either `APP_ORIGIN` or `OAUTH_REDIRECT_URL` is
`https://`. TLS is the signal: a laptop and a CI runner both speak http, and
anything a real browser reaches over https is somewhere a stranger can reach
too. It is a guard, not a guarantee — an http deployment can still be public, so
never set the flag outside tests.

Admin is decided by `ADMIN_EMAILS` at sign-in, and every admin route re-checks
it server-side. The app's `RequireAdmin` route only hides the screen.

## Clip video

A clip published from a video keeps its picture. The browser cannot cut video
the way it slices a wav, so the cut happens here:

1. The studio uploads the recording **once** for the whole batch
   (`POST /api/admin/sources`) and gets back a source id. Once, not once per
   clip — a lecture becoming three hundred lines would otherwise be uploaded
   three hundred times.
2. Each clip is created with that source id and its start and end, and a row in
   `cut_jobs` is written in the same transaction as the clip. There is no moment
   where a clip promises a picture with nothing scheduled to produce one.
3. The cutter (`python -m shadowline.cutter`) claims a job, runs ffmpeg, stores
   the mp4 and records `clips.video_key`.
4. `GET /api/clips/{id}/video` answers with a signed URL, or null.

Null is the ordinary answer, not a failure: a clip cut from audio never has a
video, and one cut from video does not have it yet while the cut is queued. The
app plays the audio in both cases, so publishing is never blocked on cutting and
a clip whose cut fails is still a usable clip.

The audio is unchanged: the browser still slices each clip's wav and uploads it
with the clip, which is what the scoring worker compares takes against. Video is
an extra asset, not a replacement.

Cutting is a separate queue and a separate worker from scoring on purpose. A
learner watches the Practice screen waiting for a score; nobody waits on a cut,
and one cut holds a CPU for seconds. Sharing a queue would put a batch of cuts
in front of the score somebody is watching for. Scale them independently —
`CutQueueDepth` is what to watch when video stops appearing.

ffmpeg re-encodes rather than stream-copies. A copy can only cut on a keyframe,
and a keyframe is typically seconds from where a line starts — which, for a clip
a few seconds long, means cutting the wrong thing. Output is h264/aac mp4,
because that is what plays everywhere, Safari included.

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

## Serving audio

With `S3_ENDPOINT` set, the browser fetches audio straight from MinIO through a
presigned URL and the bytes never pass through this process. With `DISK_ROOT`
instead, `GET /files/{bucket}/*` serves them behind an HMAC signature that
`internal/auth/sign.go` produces and checks.

Two things about that route are easy to get wrong and were: the path is a
wildcard rather than `{key}`, because object keys contain slashes and a single
segment never matches one; and the response sets `Content-Type` from the key's
extension, because disk storage keeps no metadata and an `<audio>` element given
a response it cannot type refuses to play it — reporting only "The element has no
supported sources", which names neither the element nor the reason. Both are
covered by tests in `internal/api/clips_test.go`.

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

## The test-only reset route

`POST /test/reset` empties every table and republishes the starter library. It is
registered **only when `AUTH_FAKE=1`** — a deployment that has not set that flag
does not have the route at all, which is a stronger guarantee than a check inside
the handler. `TestTheResetRouteIsAbsentWithoutTheFakeProvider` asserts it.

The browser tests need it because they share one server: without a reset between
them they would see each other's clips, takes and vocabulary.

## Seeding

`go run ./cmd/seed` publishes a small starter library so a fresh install is not
an empty screen. Those clips carry lines and IPA but no source audio — there is
no recording to ship with the code — so a take against one is kept and its
contour drawn, without a score being invented for it. Upload audio in the clip
studio to make them scoreable. Running the seeder twice does nothing the second
time.
