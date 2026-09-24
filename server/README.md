# Shadowline API

Go service behind the React app in `../app`. Scoring is not done here — takes are
queued for the Python worker in `../scoring`.

## Running

```bash
cp .env.example .env     # then fill it in; see the OAuth note below
docker compose up
```

That brings up Postgres, MinIO, Keycloak, Mailhog, the API and the scoring
worker, and publishes a starter library once. The React app is separate —
`npm run dev` in `../app`.

Email/password register, sign-in and forgot-password stay on the app's own
login screen; the API talks to Keycloak behind the scenes. Google still
redirects to Google.

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
| `ADMIN_EMAILS` | the owners: always admins, checked at sign-in. Others are made admins in the console |

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

Only `cancelled` and `failed` involve the provider at all. A `redirect_uri_mismatch`
never reaches here — Google shows its own screen before redirecting, which means
step 6 above does not match `OAUTH_REDIRECT_URL`.

## Keycloak (email / password)

Google stays as above. Keycloak runs in Compose as the store for email/password
accounts and reset mail. The React login screen keeps its own forms; the API
calls Keycloak (`POST /auth/login`, `/auth/register`, `/auth/forgot`) and then
issues the Shadowline session cookie. Google logins still sync the address into
Keycloak via the Admin API so reset mail can reach them later.

| Service | URL |
| --- | --- |
| Keycloak Admin console | http://localhost:8081 (admin / `KEYCLOAK_ADMIN_PASSWORD`) |
| Mailhog (reset mail) | http://localhost:8025 |

Realm `shadowline` and client `shadowline-api` are imported from
`keycloak/shadowline-realm.json` on first start. Defaults in `.env.example`
match that file (`KEYCLOAK_CLIENT_SECRET=shadowline-dev-secret`). The client
has Direct Access Grants enabled for the in-app password login.

### Checking it works

1. Fill the Keycloak block in `.env` (copy from `.env.example`).
2. `docker compose up -d` — wait until `keycloak` is healthy.
3. In the app login screen, create an account with email/password.
4. You land on the dashboard with a Shadowline session cookie.
5. **Forgot password?** → check Mailhog (`http://localhost:8025`) for the reset link.
6. Sign in once with Google: the same email appears under Keycloak → Users.

Leave `KEYCLOAK_URL` empty to disable email/password and Admin sync; Google
still works, but Compose still starts Keycloak (remove the service if you do
not want it).

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

Every admin route re-checks admin rights server-side; the app's `RequireAdmin`
route only hides the screen.

**Who is an admin.** `ADMIN_EMAILS` are the owners: admins at every sign-in,
whatever else happens, so a deployment cannot lock itself out. Anybody else is
made an admin, or stops being one, on the console's **Users** page, and that is
written down (`users.admin_granted`) — sign-ins used to recompute `is_admin`
from `ADMIN_EMAILS` alone and so took such rights back. `is_admin` is still the
column requests read, kept equal to "an owner, or granted", and a change takes
effect on the session the person already has.

The console refuses two changes: your own access (the one mistake nobody could
then undo from the console) and an owner's (change `ADMIN_EMAILS`).

**Suspending** an account deletes its sessions and stops `UserBySession` finding
it, so the person is signed out at once; signing in again ends at
`/login?error=suspended`. Nothing is deleted, and restoring it is one click.

## A learner's own account

The Profile screen's **Your data** card:

- **Download my data** — `GET /api/account/export`, one JSON file: the profile,
  every take with the line it was of, its scores and links to the recording and
  dub (signed for 24 hours — the file says so), the vocabulary, and when the
  tutor was asked (its questions were never stored).
- **Change password** — `POST /api/account/password`, only where Keycloak is set
  up (the profile's `passwords` says so). The current password is checked with
  the same grant that signs in, so a session left open on a shared computer is
  not enough to lock the owner out; a Google-only account is told to set one
  with "forgot password".
- **Delete my account** — `DELETE /api/account` with the account's own address
  typed to confirm. Rows go first in one transaction (takes, words, sessions,
  questions all cascade from the user), then the avatar, every recording and
  dub, and the Keycloak user; a failure after the rows are gone is logged, not
  reported, since the account is deleted either way. Signing in again later
  starts a new, empty account.

## Banners

Announcements an admin writes on the console's **Banners** page and a learner
sees at the top of the dashboard or the library (`GET /api/banners?placement=…
&locale=…`). One is shown while it is on and inside its window — both ends
optional, judged by the database's clock so every instance agrees — and when it
is for the learner's app language or for every language (`vi-VN` counts as
`vi`). Lower `position` first.

A banner is shown to everybody, so its link is checked on the way in: a path
inside the app (`/library`, not `//host`) or an `https://` address, and nothing
else — no `javascript:`, no `http:`. A picture is PNG, JPEG or WebP up to 3 MB,
stored beside the avatars and signed per request; replacing or deleting one
deletes the old object. A learner can close a banner, and that is remembered in
their browser only.

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

## The library is a tree

Three levels: a **series** (`playlists`), an **episode** (`clip_sources`), and
the clips cut out of it.

A playlist was a free-text column on every clip. That is enough to group a grid
by and nothing else: a name repeated on two hundred rows has nowhere to carry a
description, an order, or the fact that it is the one everybody is watching this
week, and none of those belong to a clip anyway. So the series is a row.

The episode is the upload — the file the cutter goes back to, in the schema
since video and until now invisible to learners. It is called an episode rather
than a video because a clip is already called a video everywhere a learner can
see one (`Take.videoId` is a clip's id), and two things under one word in one
library is a trap.

Nothing changed for the studio. An admin still publishes by typing a playlist
name; `playlistFor` finds that series or starts it, inside the same transaction
that writes the clip, and the upload the clips came from is what becomes the
episode. Clips published before uploads existed have no recording behind them,
so each series holds one episode for those, with an empty `key` because there is
no file.

Source order inside an episode comes from `start_seconds`, not `created_at`. A
batch is inserted one row after another so the two agree today, and would stop
agreeing the first time an admin goes back and publishes a line they cut later.
The order of an episode is a fact about the recording.

### Hot

`playlists.hot` is an admin's flag, not a measurement: which series to push is a
decision about the library. The count of takes against it in the last seven days
is read alongside it and shown next to the badge, so a badge nobody has earned
is visible as such.

### Search

`GET /api/library/search?q=` looks at all three levels and answers each
separately — a series and a six-second clip in one ranked list would mean
different things in the same row. It is `ilike '%fragment%'` over the trigram
indexes added with the playlists table, not full text: a learner types half a
line they half remember, and `to_tsquery` is built for whole words. Anything
under two characters answers with nothing rather than with most of the library.

## Nothing hands out the whole library

There is no endpoint that answers with every clip. `GET /api/clips` takes an
`ids=` list — at most 200 — and answers with those; asked for nothing it answers
400 rather than the library.

It used to answer with all of it, and the app fetched it once at sign-in. On a
library of 40 series, 480 episodes and 12,000 clips that is **8.5 MB**, before
the learner has chosen anything to practise. Every screen then filtered that
array in the browser: the dashboard for six cards, Practice for one clip.

So each screen asks for what it shows:

| Endpoint | Answers with |
| --- | --- |
| `GET /api/clips?ids=a,b,c` | Those clips, up to 200 at a time |
| `GET /api/clips/featured` | What the dashboard offers |
| `GET /api/clips/next-up` | One clip: never practised, else the weakest |
| `GET /api/library/summary` | Counts and the category list, not the rows |
| `GET /api/admin/clips?q=&limit=&offset=` | The studio's clip manager, paged and searched |

Measured against that same seeded library: sign-in went from ~9.2 MB to 687 kB,
of which 686 kB is the learner's own 2,400 takes — the clips are 8.5 MB to 0.
The dashboard then fetches 28 kB of featured clips and a 718-byte next-up; the
library screen fetches 16 kB of series.

Two things moved to the server with it. "Next up" was worked out in the browser
from the takes array and the clip array, and is now one query
(`store.NextUp`); the studio's "Clip 14" numbering counted titles in the array,
and is now `GET /api/admin/clips/next-number?playlist=` over
`^[Cc]lip\s+(\d+)$`. Both had to move: neither can be worked out from a list
the app no longer holds.

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

## Uploading is two requests, and the history is a read model

`POST /api/admin/uploads` writes the row; `PUT /api/admin/uploads/{id}/file`
carries the bytes.

It used to be one request that stored the file and inserted the row after it,
which meant a transfer still running had no row at all. An admin whose
two-hour film was on its way had nothing to look at, and one whose upload died
halfway had nothing left behind saying so — not even a name. Writing the row
first is the whole point: `upload_state` is `uploading`, `stored` or `failed`,
and the failure carries its reason in `error`.

Transcription is queued by the transaction that marks it `stored`, and not
before: a job pointing at an empty key would burn its attempts and be dropped
before the file it was waiting for had arrived.

**Everything else about an upload's progress is read, not stored.** Whether the
words are still coming, whether its clips still owe a picture, whether any of it
was published — all of that is already written down, and a second copy kept in
step by hand is a second copy to get wrong. `store.Uploads` reads it back:

| Status | What the database says |
| --- | --- |
| `uploading` | `upload_state = 'uploading'` |
| `upload-failed` | `upload_state = 'failed'`, with `error` |
| `transcribing` | a `transcribe_jobs` row exists |
| `transcribe-failed` | no job, no transcript, and the file did arrive |
| `ready` | stored, words settled either way, nothing published |
| `cutting` | published, and `cut_jobs` rows remain for its clips |
| `cut-failed` | published, no jobs left, and clips that should have a picture have none |
| `done` | published, and every picture the cutter was going to make is there |

That reading leans on one thing the workers do: a job row exists **only while
there is work left**. `CutQueue` and `TranscribeQueue` delete the row when they
finish and when they give up, so "a row is here" means pending, and what
distinguishes finished from abandoned is whether the result landed — a
`transcripts` row, a clip's `video_key`.

`Upload.status()` in Go is the one place that turns those counts into a word, and
`?state=` filters on it. There is no status column to filter on, deliberately, so
a filtered page reads the history in order and keeps what matches; an unfiltered
one is an ordinary `limit`/`offset` page. `POST /api/admin/uploads/{id}/retry`
puts back exactly what gave up and answers with how much, because "nothing to
retry" is a real outcome.

## The tutor

`POST /api/tutor/chat` answers a learner's question through any
OpenAI-compatible chat endpoint — 9router, in the deployment this was written
for. Set `TUTOR_API_KEY` and `TUTOR_MODEL` and it is on; leave the key blank and
`GET /api/tutor` says so and the app leaves the chat out entirely.

| Variable | What it is |
| --- | --- |
| `TUTOR_API_URL` | The endpoint's `/v1`. 9router's default is `http://localhost:20128/v1` |
| `TUTOR_API_KEY` | Sent as `Authorization: Bearer …`. 9router shows one on its dashboard |
| `TUTOR_MODEL` | A 9router model id (`cc/claude-haiku-4-5-20251001`, below) or a combo name |

**The key never leaves the server.** The browser sends the conversation — the
learner's turns and the tutor's, nothing else — which clip is on screen, and
the app's language as a tag (`vi`, `pt-BR`; anything else is a 400, because it
goes into the prompt).
The system prompt is added here, and a `system` message from the browser is
refused with a 400 rather than dropped: a request carrying one is somebody
trying something.

**It is told the truth about the take.** With a `clipId`, the prompt carries the
line, its IPA, and this learner's own measurements on it — best score, the four
metrics of the latest take, the words the transcriber did not hear. That is what
lets the tutor say "your stress was 44" instead of "stress is important", and the
prompt tells it not to invent a number it was not given. Only this learner's
takes are read; `internal/api/tutor_test.go` has a second learner's 97 sitting
beside the first's 58 to hold that.

**It costs money per message, so it is bounded.** The last 20 turns go to the
model and no more; a question can be 2,000 characters; an answer is capped at 700
tokens; and a learner gets 30 questions per 10 minutes, after which the answer is
a 429 with `Retry-After` and the router is not called at all.

**Every question is written down, and the limit is counted from that.** A row in
`tutor_questions` per question — who, when, which model, which clip, how it
ended, and the tokens the router reported on the stream's last chunk (it does
when asked with `stream_options.include_usage`). The question's text is not
kept. The limit counts those rows under a lock on the learner's own row, so a
restart does not reset it and every replica sees the same count; it used to live
in the API's memory. The console's **Tutor usage** page
(`GET /api/admin/tutor/usage?days=30`) reads the same rows back by day and by
learner. An answer the learner stopped never reaches the chunk with the counts,
so it is a question with no tokens.

**It streams.** Server-sent events: `{"delta": "…"}` per piece, `{"done": true}`
at the end, `{"error": "…"}` if the model fails part-way. Headers are held back
until the first piece arrives, so a router that refuses outright still gets an
ordinary 502 with a status code. `X-Accel-Buffering: no` is set because nginx
buffers proxied responses by default and would otherwise deliver the whole answer
at once. The route has its own three-minute deadline, like the upload has its own
half hour: a model that is thinking is not a stuck handler.

**Tried against a real 9router**, and it found two things the fake did not.
The client built its own `http.Transport{}`, which has no proxy function and so
ignored `HTTPS_PROXY`: on a network where traffic only leaves through a proxy the
tutor never answered while `curl` from the same machine worked. It clones the
default transport now. And 9router's Claude Code route puts `<think></think>`
ahead of every answer; `internal/tutor/think.go` drops those blocks as they
stream, including when a tag arrives split across two pieces.

And one that was not this server's: the answer arrived in a few large bursts
instead of as it was written. It was the nginx in front of 9router, buffering
proxied responses as nginx does by default — a long answer came through in four
bursts, sized by its buffers. On that nginx, the location proxying to 9router
needs:

```nginx
proxy_buffering off;
proxy_cache off;
gzip off;
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_read_timeout 300s;
```

With that in place the first piece reached a learner after two seconds instead
of ten, and the rest followed as it was written.
`TestEachPieceReachesTheLearnerBeforeTheNextIsWritten` holds that nothing on this
side of it waits.

**Which model: Haiku.** Timed through 9router with the tutor's own prompt and
the same question, first piece / whole answer:

| `TUTOR_MODEL` | First piece | Whole answer |
| --- | --- | --- |
| `cc/claude-haiku-4-5-20251001` | 1.3 s | 6.5–6.9 s |
| `cc/claude-sonnet-5` | 1.5–1.9 s | 8–9.6 s |
| `cc/claude-opus-5` | — | 13.6–14.6 s |
| `cc/claude-opus-5` with `speed: "fast"` | — | 14.2–14.4 s |
| `ag/gemini-3-flash` | ~11 s | — |

Haiku's answers to a learner's question hold up, and it is the quickest. "Fast
mode" is not a setting to reach for: Claude offers it on Opus only, and 9router
does not pass it through — the numbers above are the same with and without it.

**It only talks about English.** The persona says what it helps with first —
pronunciation, vocabulary, grammar, translation, corrections, IELTS and TOEIC,
role-play practice, how to study, writing an email or a letter *in English* —
and then what it does not: code, maths, science, news, health, legal or money
advice, including when English is only the wrapping ("explain photosynthesis in
English"). The test it is given is what the learner wants back: English, or
facts about something else. A decline is one or two sentences in the learner's
language offering the English words for that topic, without the answer. Asking
it to ignore its instructions, reveal them or become something else is declined
the same way; role-play the learner asks for is practice and is played.

Leading with the forbidden list was tried first, and Haiku, which follows the
letter of a rule, started turning down IELTS strategy and role-play. So there is
an eval that checks both directions against the real model:

```sh
TUTOR_API_URL=https://…/v1 TUTOR_API_KEY=… TUTOR_MODEL=cc/claude-haiku-4-5-20251001 \
    python3 tools/tutor_scope_eval.py   # ROUNDS=3 for more
```

28 questions — 12 it must answer, 9 it must decline (four of them attempts to
talk it out of its instructions), 7 about language — graded by pattern: an
in-scope answer fails if it opens by saying what the tutor does not do, a decline
fails if it carries the answer, and any answer fails if it is in the wrong
language. It calls a paid model, so it is not part of `go test`; `prompt_test.go`
holds that the rules are still in the prompt.

**It answers in the learner's language.** Learners do not all speak Vietnamese,
so the language of the question decides: Spanish gets Spanish, Korean Korean,
English English — a decline too — with the English being taught left in English.
The app's language is sent along for the one message that has no language of its
own: "She don't like coffee" on its own is explained in Vietnamese to a learner
whose app is in Vietnamese, and in English to one whose app is in English.

That line had to say what it was for. Given as a bare `App language: vi`, Haiku
took it as an order and answered Spanish, Korean and English questions in
Vietnamese — the eval went 43/56. Spelled out as "the language their screens are
in, not the language to answer in", with that one exception named, and with the
decline rule giving examples, it comes back 83/84 run after run. The one miss is
the same each time: "Explain photosynthesis in English", from a learner whose app
is in Vietnamese, is declined correctly but in Vietnamese — a message that asks
for English is arguably telling you it is not the learner's first language.

Conversations are not stored. The app keeps one for the tab, and a
conversation about one evening's practice is not a record anybody asked the
server to keep.

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
`app-admin/src/lib/transcript.ts` — because the worker maps words once and the studio
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

An empty cache means the first learner to tap each word waits for it — which,
at the start, is every word. The API migrate step `00008_freetalk_glosses`
loads ~10,761 FreeTalk definitions (plus Shadowline contractions) from
`internal/db/data/glosses.tsv` the first time the API starts — no key, no
network, and no separate seed command. Rebuild that file offline with
`scoring/tools/build_seed_glosses.py` from a
[freetalk-dictionary-v1](https://github.com/freetalk-fun/freetalk-dictionary-v1)
checkout, then copy it to `server/internal/db/data/glosses.tsv`.

`python -m shadowline.seedwords` still loads the same TSV from the scoring
tree (and can queue the leftovers with `--meanings`); it is optional once the
API has migrated.

Most of those definitions are the FreeTalk Dictionary's. The apostrophe words
are not: it has no entry containing one, and a shadowing app cannot leave
`it's`, `don't` and `i'm` blank, so those 132 are written out in
`scoring/tools/contractions.py` and marked `source=shadowline`.

What is left afterwards is about 1,200 words, mostly proper nouns — `london`,
`june`, `david` — which a learner does not need a dictionary for. `--meanings`
queues them: free through Merriam-Webster at 1,000 a day, or roughly $2.50 in
one go through the model.

**The seeded definitions are CC BY-NC 4.0.** Free for personal and research
use; a product that makes money needs a licence from freetalk.fun. That is the
same class of condition Merriam-Webster's free tier carries, and it is a
decision to make before charging for anything, not after. The app credits the
source under every definition, because attribution is a licence condition
rather than a courtesy, and `python -m shadowline.seedwords --requeue-source
freetalk` replaces the lot through sources licensed differently — the old
meaning stays until the new one lands, so nothing goes blank in front of a
learner.

Meanings produced by the paid sources only have to be produced once, by
anybody: `--export` writes every finished gloss to a tab-separated file and
`--import` loads one, so generated definitions get committed and every
deployment afterwards starts with them.

Seeding gives up one thing: the sentence. A word glossed before anybody has met
it has no caption behind it, so it gets the ordinary sense rather than the one
a particular line uses. Words outside the 12,000 still get the sentence, which
is where it matters most — an unusual word in an unusual place.

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

Three things about that route are easy to get wrong and were.

The path is a wildcard rather than `{key}`, because object keys contain slashes
and a single segment never matches one.

The response sets `Content-Type` from the key's extension, because disk storage
keeps no metadata and an `<audio>` element given a response it cannot type
refuses to play it — reporting only "The element has no supported sources", which
names neither the element nor the reason.

And it answers **range requests**, through `http.ServeContent`. It used to be an
`io.Copy`, which serves the bytes and advertises nothing: Chromium then treats the
resource as unseekable until it holds all of it and silently clamps a
`currentTime` assigned before that to zero. The symptom was three screens away —
switching voices in Dub Review started the line again instead of keeping its
place — and the slider would have been useless on a slow connection for the same
reason. Disk storage hands back an `*os.File`, so the seek costs nothing; S3 does
not come through here at all, and answers ranges itself.

The first two are covered in `internal/api/clips_test.go`, the third in
`internal/api/deadlines_test.go`.

## Two deadlines, not one

Every route used to be under one sixty-second timeout, and that broke uploading
a film. The upload handler raises the server's *write* deadline for a big file,
which reads as though the case were covered, but the request context is what
actually decides: at sixty seconds it was cancelled, storing the object failed
with `context deadline exceeded`, and the admin got a 500 on a connection that
was working perfectly. Reproduced by sending a 4 MB file over seventy seconds.

So there are two:

- `requestTimeout`, a minute, on everything. A handler that has not answered in
  a minute is stuck, not busy.
- `transferTimeout`, half an hour, on the two routes that move a whole file:
  `POST /api/admin/sources` and `GET /files/*`. What makes those slow is the
  size of the file and the speed of the line — half an hour covers the two
  gigabytes `maxSourceBytes` allows, on a connection that is not fast.

The upload route sits in its own group rather than inside the rest of `/api`,
because a deadline set further down can only ever shorten the one above it: a
route under the minute cannot ask for half an hour. `internal/api/deadlines_test.go`
holds it there, by measuring what the handler's context has left rather than by
spending a minute proving it.

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

## CI/CD on a VPS (Jenkins)

Production deploys are driven by Jenkins on the same Docker host — not GitHub
Actions. Pipeline-as-Code lives in the repo root [`Jenkinsfile`](../Jenkinsfile);
ops notes (webhook, RAM, backup, first boot) are in
[`docs/ops-jenkins.md`](../docs/ops-jenkins.md). The SPA is the Compose service
`web` (nginx serving `app/dist`).

## Observability (Grafana)

Logs, metrics, and traces: self-hosted Grafana LGTM + Alloy. See
[`docs/ops-observability.md`](../docs/ops-observability.md). Set
`OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318` in production `.env`.
