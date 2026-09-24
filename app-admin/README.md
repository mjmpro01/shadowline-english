# Shadowline console

The admin side: cutting recordings into clips, and managing the library they land
in. A separate build from the learner app in `../app`, served under `/admin/` on
the same origin.

```bash
npm install
npm run dev          # http://localhost:5174/admin/
```

The API it talks to in development is `http://localhost:8080`; set
`ADMIN_API_URL` to point the dev proxy somewhere else.

## Why a second app rather than a section of the first

The studio lived in the learner app as a route behind an admin check. Moving it
out was not about bundle size — the whole studio is about 39 kB of a 470 kB
build, measured — it was about the three things that come with being in that app:

- The learner shell is a rope ladder nailed to a tree. That is right for somebody
  practising English on a phone and wrong for somebody working through four
  hundred clips at a desk.
- The learner app loads that person's takes, vocabulary and the leaderboard at
  sign-in. An admin needs none of it.
- It registers a service worker so it can be installed on a phone. A console
  that hands back yesterday's build is the last thing somebody publishing a
  library needs.

And the console has somewhere to grow: users, banners, upload history. None of
that belongs in the app a learner opens.

## Why `/admin/` and not `admin.…`

Checked in the server, not assumed:

- the session cookie is set with no `Domain` (`server/internal/auth/session.go`)
- CORS allows exactly one origin, `APP_ORIGIN` (`server/internal/api/api.go`)

So the console sharing the app's origin means signing in works with **no server
change at all**. A subdomain would need a cookie domain, `APP_ORIGIN` to become a
list, and the OAuth redirect handled for two hosts.

`src/lib/api.ts` has no setting for where the API is, for the same reason: nginx
proxies `/api` and `/auth` in production and Vite's dev proxy does the same here.

## Signing in

There is no login screen here. The learner app owns it, at the root of this
origin, and `Gate` sends the browser there when `/auth/me` says nobody is signed
in. An account the server has not marked as an admin gets told so rather than
shown an empty console — and every endpoint under `/api/admin` re-checks anyway,
so getting past `Gate` reaches nothing.

## Sections

| Path | What it is |
| --- | --- |
| `/admin/cut` | A recording in, a batch of clips out: waveform, filmstrip, the cut proposal, the lines |
| `/admin/uploads` | Every recording sent, and how far each one got |
| `/admin/clips` | The clip manager, paged and searched on the server |
| `/admin/series` | Series and their episodes: names, order, the hot badge, deletions |

## Publishing a long recording

Publishing is two things: the clip rows, then their audio. The studio says which
it is on and how far through — "Sending audio… 180 of 412" — because it used to
say "Saving…" for all of it, and a batch that had stopped looked exactly like a
batch that was working.

Three rules behind it:

- The rows go up **200 at a time**. The server refuses a JSON body over a
  megabyte, which a batch of about two thousand clips reaches; a fifty-minute
  recording proposes enough cuts to get there, and from the studio that read as
  publishing simply not working.
- The audio goes up **four at a time**. It was every clip at once: the browser
  runs six requests to a host anyway, so the rest sat in a queue nothing could
  see, and one rejection abandoned the others with the clips already published.
- A clip whose audio never arrives is **counted and reported**, not thrown. The
  clip is worth having — a take against it is kept and measured, only not scored
  — and saying nothing is how an admin finds out from a learner.

And publishing now has a catch. It did not: any failure left `busy` set, which
leaves "Saving…" on screen and the Publish button disabled for good, with no way
back but a reload. That is most of what "publishing does not work" was.

The audio used to be the expensive part: each clip went up as 16-bit WAV — 563 kB
for six seconds at 48 kHz, so **220 MB** for a batch of 400, after the recording
had already been uploaded once. It is not sent any more. When the recording is
on the server, publishing writes the clips and stops; the cutter makes each
clip's sound from the recording, the same way it makes the picture (see "Clip
video" in `server/README.md`). The browser still slices and uploads the sound
only when the recording never reached the server, so those clips are not left
silent.

## The cut survives leaving the studio

The recording being cut lives in `src/lib/studioDraft.ts`, not in the screen.
Leaving the studio unmounts it, and everything used to go with it: the decoded
file, the proposed cuts, every line typed into them, the upload already on the
server and the transcript being waited for. Opening the library for ten seconds
to check a name meant starting a fifty-minute recording again.

Nothing is persisted, and deliberately: the decoded samples are hundreds of
megabytes and the object URL belongs to the document, so neither could survive a
reload. This carries the work across a screen, not across a session.

## Upload history

"Did my film upload?" used to be answered by looking for its clips in the library,
which says nothing about a transfer that died, a transcript that never arrived, or
clips whose picture the cutter gave up on.

`/admin/uploads` is the answer. Each row carries a status — uploading, upload
failed, transcribing, no transcript, ready to cut, cutting video, some cuts
failed, done — searchable by name and filterable by that status. Expanding a row
shows the counts the status is worked out from: clips published, transcription
attempts, cuts still to do, cuts given up on, and **clips with no audio**, which
is worth its own line because a take against one of those is kept and measured but
never scored, and nothing else in the product says so.

The page refreshes itself every four seconds while any row is still moving, and
stops when they have all settled.

Two things are deliberately not stored anywhere: the status, and the filter.
`server/README.md` has the table of what each one is read from, and why reading it
beats keeping a copy in step.

Uploading is two requests here — `repository.createUpload` then
`repository.sendUpload`. The row exists before a byte moves, which is what makes a
transfer in flight visible at all. `sourceId` is only set on the screen once the
file has landed: nothing is queued until then, so a transcript poll started
earlier would find no job and no words and report that as a failure.

## What is shared with the learner app, and what is not

Shared by being copied, not imported: `styles/tokens.css` and
`styles/components.css` (the palette, the buttons, the cards, the dialog), and
`test/tone.ts`. The two apps are independent builds with their own dependency
trees; a cross-package import would resolve React twice.

Not shared at all: the API client, the response types, the store. The console
declares the handful of shapes it reads — clips, series, episodes, a profile —
rather than carrying the learner app's takes, scores, pitch contours and
vocabulary. What the two actually share is the wire, and the Go tests are what
hold the server to it.

## Tests

```bash
npm test             # the studio's own logic: cut proposal, waveform peaks, transcript
```

The browser tests are **in `../app`**, not here. There is one API, one database
and one set of workers to test either front end against, so there is one
Playwright run with two projects:

```bash
cd ../app
npx playwright test --project=console     # the console's screens
npx playwright test --project=app         # the learner app's
```

The console's specs are `../app/e2e/console/*.spec.ts`. Their `baseURL` is the
console's dev server; where one of them checks what a learner ends up seeing it
says `APP_URL`, and that crossing over is the assertion.
