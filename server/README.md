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

The cutter takes a still in the same run, a third of the way into the clip —
far enough in that the frame is the speaker rather than the tail of a shot
change. It is signed into the clip listing rather than fetched per card: the
library is a grid, and asking where twenty thumbnails live would be twenty
round trips on a screen that already has the whole list.

Where the picture ends up:

| Screen | Shows |
| --- | --- |
| Library, Dashboard | the still, or the play icon for a clip that has none |
| Practice, Analysis | the video, in place of the audio element |
| Dub Review | the video, muted, under whichever voice is playing |

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

## What an unnamed clip is called

A clip the admin did not name is "Clip 1", "Clip 2", numbered across the batch
being published and continuing from whatever the playlist already holds — so
going back to cut a few more lines into an episode does not give it a second
"Clip 1". Only names of exactly that shape are counted, so a clip somebody
named themselves does not push the sequence along.

It used to be named after its line. Transcription now fills a line into every
clip, and a library whose titles are whole sentences is a library you cannot
scan. The line is shown under the title on the cards instead, which is where it
was always more use.

"Clip" rather than "take" or "line": both already mean something here. A take
is a learner's recording, and a line is one caption inside a clip — the Practice
screen says "Line 1 of 1" within one.

## Exporting a dub

A learner who has nailed a line can take it away: `POST /api/takes/{id}/dub`
queues the take's recording to be muxed onto the clip's picture, and
`GET` the same path reads back `none`, `pending` or `ready` with a signed url.

On request, not for every take: a line gets practised a dozen times and nobody
wants a file for each attempt. Refused with 409 for a clip that has no
video — an audio clip, or one whose cut has not landed — so the worker is never
handed a job it can only fail.

ffmpeg copies the video stream and re-encodes only the audio, because the
picture is unchanged and a take arrives as whatever MediaRecorder produced,
which mp4 will not carry. `-shortest`, because a learner runs long or stops
early and the dub should end when either side runs out.

The fourth queue and the fourth worker, and the only one somebody is watching a
spinner for: a cut and a transcript happen while an admin gets on with
something else. Queueing dubs behind a batch of cuts would make a learner wait
minutes for sub-second work.

## Practice history

Every take is kept: its recording, its score, the four metrics and the pitch
contour it was measured from, against the clip it was recorded for. Nothing
prunes them. Dub Review lists a clip's takes and plays any of them against the
picture, so going back to an old attempt — or to a dub exported weeks ago — is
picking it off that row.

## Playlists

A playlist is a column on the clip, not a table: the studio names a batch and
every clip cut from that recording carries the name. The library turns those
names into filter chips, and `library/playlist/:name` opens one as a sequence —
numbered in source order, with how far through it you are and the first
unpractised clip one button away.

Source order comes from `start_seconds`, not `created_at`. A batch is inserted
one row after another so the two agree today, and would stop agreeing the first
time an admin goes back and publishes a line they cut later. The order of an
episode is a fact about the recording.

## Choosing what gets published

The studio proposes a cut at every pause, which for a fifty-minute recording is
hundreds of them — and most of a film is not dialogue worth shadowing. Each clip
carries a checkbox, and only the selected ones are published.

Everything starts selected, because a short recording is usually published
whole and that is what the studio did before. `Select none` and `Only clips
with a line` are the way into the other case: after transcription, the clips
with words in them are the ones worth keeping, and the rest are silence the
energy-based cut found anyway.

Length is checked against the selection, not the proposal: a clip being left
behind is too long for nobody.

## Transcripts and IPA

The studio fills its own lines in. The recording is uploaded when the admin
opens it — not at publish — because transcribing it is what fills them, and that
cannot start until the server has the file:

1. `POST /api/admin/sources` stores the upload and queues a transcription in the
   same transaction.
2. The transcriber (`python -m shadowline.transcriber`) runs Whisper over the
   whole recording and stores the words with their times and their IPA.
3. The studio polls `GET /api/admin/sources/{id}/transcript` while the admin
   cuts, and writes each clip's words into its Line and IPA fields when they
   land — leaving alone anything already typed, so a correction survives.

One run per upload, not per clip: every clip reads the words falling inside its
own boundaries, so an hour is transcribed once however many lines come out of
it. A word belongs to the clip its *middle* falls in, so one straddling a cut
goes to the side holding most of it and never to both. That rule lives twice —
`words_between` in `scoring/shadowline/transcribe.py` and `wordsBetween` in
`app/src/lib/transcript.ts` — because the worker maps words once and the studio
maps them again whenever a boundary moves. Both are tested against the same
cases; they have to stay in step.

Whisper runs locally, through faster-whisper on CPU. An API would bill for
fifty minutes every time a lecture is re-cut, and these recordings are the
product's own material. `WHISPER_MODEL` picks the model and the image fetches
its weights at build time, so a fresh replica does not download hundreds of
megabytes while an admin waits.

IPA comes from CMUdict rather than a model: the same answer every run, no
download, and a word the dictionary has never heard of gets no transcription at
all. An invented pronunciation is worse than none — the field is optional, and
a learner would practise whatever is in it. The stress mark goes before the
whole syllable, consonants included (`həˈloʊ`, not `həlˈoʊ`), and only clusters
English actually opens a syllable with move in front of it, or `computer` comes
out as `kəˈmpjutɝ`.

Transcription is a third queue and a third worker for the same reason cutting is
a second one: a learner waits on a score in seconds, nobody waits on a cut, and
an admin watches a transcript arrive over minutes. Three pressures, scaled
apart.

If transcription fails, the studio says so and the admin types the lines, which
is what they did before any of this existed. Nothing else about the upload is
affected.

## Looking words up

Tapping a word in a caption used to be answered from a fifteen-word table
compiled into the bundle. Every other word came back with the literal string
"Auto-translated definition" and a pronunciation that was just its own spelling
between slashes — a made-up transcription shown to somebody learning to
pronounce things.

Now the tap goes to the server:

1. `POST /api/words/{word}` answers with the gloss if anybody has ever tapped
   that word, and queues a lookup if not.
2. The glosser (`python -m shadowline.glosser`) claims the job, reads CMUdict
   for the pronunciation, and asks for the meaning — Merriam-Webster's
   Learner's Dictionary first, the Claude API for what it does not have.
3. `GET /api/words/{word}` is what the popup polls while it waits. It reports
   `ready`, `pending`, or `none` — and `none`, which covers both "never asked
   for" and "gave up", shows the word without a meaning rather than a spinner
   that never resolves.

The gloss is keyed by the word alone and kept for ever, which is the whole
design. One learner's first tap pays for the lookup; everybody else's is a
single indexed read. A word collected before its lookup finished picks the
meaning up afterwards, because `vocab_words` reads its pronunciation and
meaning from `glosses` and falls back to its own columns
(`internal/store/vocab.go`) — the gloss belongs to the word, not to anybody's
copy of it.

### Why these two sources, in this order

Oxford was the obvious first thought and does not work: there is no free plan
any more. A sandbox account gives 500 calls to evaluate with, v2 returns 403 on
a free account, and real use starts at £50 a month billed annually.

The offline route was measured and rejected before either of these. The English
dictionaries bundled on PyPI are Webster derivatives: seven of fifteen ordinary
conversational words, missing `brilliant`, `gonna`, `okay`, `kidding` and `guys`
outright, and defining what they did have in words harder than the word being
defined.

The keyless `dictionaryapi.dev` is genuinely free and genuinely unreliable — its
own status page reports 93.8% uptime over thirty days and a seven-day mean
response of twenty-one seconds, and a learner is watching the popup.

**Merriam-Webster's Learner's Dictionary** is first because it is the one
dictionary written for people learning English rather than for people who
already have it, and because it is free: 1,000 lookups a day per key, which the
cache makes plenty. Two conditions come with that and neither is optional — the
Merriam-Webster logo has to appear wherever their definitions do, and an app
that makes money needs a licence. The popup credits the source under every
definition; **the logo itself still has to be added** before this goes anywhere
public.

**The Claude API** is second because it answers what no dictionary can. Two
things: words no dictionary has an entry for — `gonna`, a name, something coined
last year — and the sentence. `really` in "Are you really going?" is not
`really` in "I really like it", and the caption is right there. A dictionary
cannot use it; that is the cost of asking one first, and it is why the model
sits behind the dictionary rather than instead of it.

Both keys are optional and the worker says at startup which it has. With
neither, a tapped word still comes back with its pronunciation — a smaller
answer rather than a broken one, and how the browser tests run.

### Seeding the cache

An empty cache means the first learner to tap each word waits for it.
`scoring/shadowline/data/common_words.txt` holds the 12,000 commonest English
words in frequency order, and `python -m shadowline.seedwords` fills them in
ahead of anybody.

The two halves cost very different things, so they are separate. Pronunciations
are CMUdict: 12,000 of them land in under a second with no key of any kind.
Meanings are opt-in behind `--meanings`, and the command prints what it is
about to commit to before it does it.

Meanings only have to be produced once, by anybody. `--export` writes every
finished gloss to a tab-separated file and `--import` loads one, so the
generated definitions get committed and every deployment afterwards starts with
them and asks nobody for anything. Definitions do not change; paying for the
same 12,000 twice buys nothing.

Seeding gives up one thing: the sentence. A word glossed before anybody has met
it has no caption behind it, so it gets the ordinary sense rather than the one
a particular line uses. Words tapped outside the 12,000 still get the sentence,
which is where it matters most — an unusual word in an unusual place.

### A caveat on the Merriam-Webster parsing

The network this was written on blocks `dictionaryapi.com`, so
`scoring/shadowline/dictionary.py` follows Merriam-Webster's published JSON
shape rather than a response anybody here had seen. Everything about it is
built so that being wrong costs a fall-through to the model and nothing else:
an unrecognised shape, a missing field, a `null`, a body that is not JSON and a
network error all return "no definition from here" rather than raising.

`python -m shadowline.dictionary <word>` prints what came back beside what was
made of it, so one command against a real key settles whether the parsing is
right. `scoring/tests/test_dictionary.py` pins the rest, including the case
that matters most: an entry belonging to a neighbouring headword must not be
shown, because a definition for the wrong word looks exactly like a right one.

Lookups are a fifth queue and a fifth worker. Same reason as the others, with
one difference: what a lookup costs is an allowance or a fraction of a cent
rather than CPU, so the thing worth scaling is not the worker count but the
number of words that ever reach it — which is what the cache is.

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
