# Shadowline

English shadowing practice — pick a short clip from the library, read each line
back, and compare your delivery against the source.

Built from the Claude Design handoff in `../project/Shadowline.dc.html`. The
prototype's Organic design system is ported in `src/styles/`, including the dark
+ amber overrides the prototype applies on top of it.

## Running

The app needs the API in `../server` and the worker in `../scoring`. The quickest
way to get both is `docker compose up` in `../server`.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build
npm run lint
npm test          # unit tests (Vitest)
npm run test:e2e  # browser tests (Playwright)
```

`VITE_API_URL` points at the API; it defaults to `http://localhost:8080`.

## Screens

Login → Dashboard → Library → Practice → Analysis → Dub Review, plus Vocabulary
with its flashcards, Progress and Profile. Navigation is a collapsible sidebar on
desktop and a bottom tab bar on phones.

## The adventure menu

The sidebar is the Shadowline adventure menu from Figma: a lit forest, a tree
with a rope ladder nailed to it, and a plank per place you can go. Collapsed it
becomes a rail of icons whose labels swing out on a wooden sign; the plank you
are on is the one green thing in a brown menu, and says so without being
pointed at. There is no forest in the collapsed rail — a strip of green narrow
enough to fit beside a 64px plank is not a view out of the trees — so the rail
is all trunk and everything nailed to it sits on wood. The phone's tab bar carries the same wood and drops the tree, which
it has no room for.

It is drawn in CSS — the palette lives with the rest of the tokens, under
`--menu-*` — with one piece outstanding: **the forest illustration behind the
tree.** This machine's network could not reach Figma's asset host, so
`.menu-forest` layers the illustration over a gradient that stands in for it.
Export the design's `Enchanted forest` layer as a PNG to
`public/menu/forest.png` and it appears; nothing else needs changing.

The design carries a sixth plank, `Arena`, for a feature that does not exist.
It is not in the menu: the green plank and its badge are that plank's selected
state, applied to whichever place you are actually in.

Clips are curated, not collected: learners practise what is in the library and
cannot import or upload anything themselves. `/admin` holds the clip studio,
where a recording is cut into lines — see below.

The library is a tree: series (`/library`), episode (`/library/s/:slug`), and
its clips (`/library/e/:id`). One search across all three runs on the server and
matches names, spoken lines and tags, since a learner is as likely to remember a
phrase from a clip as its title. A category cuts across series, so it has no
branch of its own — tapping one is a search.

## Dashboard

Where signing in lands. Your own numbers — clips practised, takes, average score
and day streak — are computed from your takes; a streak counts days practised in
a row, and practising yesterday but not yet today still counts, since the day is
not over.

The leaderboard is ranked by the server from everyone's scored takes. There are
no filler learners: an app nobody has scored in ranks nobody, and one with a
single learner shows one row. Below it sit the clips an admin has featured.

## Memory practice

The Vocabulary screen opens a flashcard session over the words you have
collected by tapping them while practising. The deck is **what is due**, not
everything you have ever collected: a card answered today is booked in for
another day, and how far off depends on whether you recalled it.

The ladder is a day, three, a week, a fortnight, a month, two, four. Recalling
a word moves it one step up; forgetting it puts it back at the front, not one
step down — a word that has gone is gone, and walking it back through a month
would ask about it next in a fortnight. Ticking "known" in the list is not a
recall, because nothing was tested; it retires the card to the top of the
ladder, which is what "stop asking me" means. The arithmetic and the reasons
are in `server/internal/store/schedule.go`, which is where the schedule is
kept — a deck built from a device with a wrong clock would be the wrong deck.

A word you have just forgotten comes back once more before the session ends.
Once, not until you get it: twice would be a loop for anybody having a bad day
with one word.

With nothing due, the screen says so and says when the next word comes round,
and still offers to practise anyway. The schedule is advice about what is worth
reviewing, not a lock on the door.

## Installing it

`public/manifest.webmanifest` and `public/sw.js` make the app installable: a
home-screen icon and a window with no browser chrome, which is most of what
"an app" means to somebody practising on the way to work.

It is **not** an offline app, and the worker does not pretend to be one. The
clips, the takes and the scores all live on the server, and no amount of
caching makes a recording scoreable on a train. The worker is network-first
for everything it touches and never caches `/api/`, `/auth/` or `/files/` —
a cache-first worker is how an app ships an update nobody receives, and those
three carry a session, a signature and an expiry.

There are no practice reminders. A reminder that fires when the app is closed
needs web push — a push service, VAPID keys, subscriptions stored per device
and a server that sends them — which is its own piece of work and not
something a manifest buys.

The icons are the crest the login screen already wears, cropped and resized by
`scripts/icons.mjs` — which is committed rather than run once and forgotten,
because a set of PNGs nobody can rebuild is a set nobody dares change. Run
`node scripts/icons.mjs` after changing `public/login/crest.png` and the tab,
the home screen and the install prompt all follow. The browser tab gets the
helmet alone: a whole knight at 32 pixels is a smudge.

## Taking things away

Every delete removes objects as well as rows, and none of it can be put back,
so each goes through a dialog that says what is about to go rather than asking
"are you sure?" about a noun.

A learner can throw away a take. It sits in their history, on the chart and in
the average the leaderboard reads, and the server has always allowed this —
nothing in the app offered it.

An admin can delete an episode, which takes its clips, the recording they were
cut from, and every take recorded against them. An episode is the unit they
publish: two hundred clips off the wrong file is one mistake, and undoing it
clip by clip is not an undo.

A series is the opposite. The server refuses to delete one that still has
clips in it, and the studio's button is disabled with the reason on it rather
than hidden — the mistake a series delete recovers from is a name typed wrong,
and what a cascade would take with it is a whole season of somebody's practice.

## The clip studio is a different app

It was a screen here, behind an admin check. It is a console of its own now, in
`../app-admin`, served under `/admin/` on this origin — see that README for why,
and for what was measured before deciding.

What is left in this app is one plank on the menu and one card on the Profile
screen, both of them plain links out. Nothing here uploads a recording, proposes
a cut, or writes to `/api/admin/*` any more, and `data.videos` is a cache of the
clips screens have asked for rather than a library to manage.

## Clip length

A clip is one line to shadow, capped at `MAX_CLIP_SECONDS` (6) in
`src/data/types.ts`. Recording stops itself at the cap with a countdown on
screen. The console holds its own copy of the same number, and the server refuses
a longer clip regardless of what either of them allowed.

## Scoring

Takes are measured, not simulated — by the Python worker in `../scoring`, which
tracks fundamental frequency with YIN, expresses it in semitones around each
speaker's own median, and aligns the two contours with banded dynamic time
warping. `../scoring/README.md` has the detail, including why the scores match
the browser implementation this replaced exactly rather than approximately.

A take is uploaded, comes back `pending`, and the app polls until it settles.
Three outcomes, and the screens keep them apart: still measuring, measured and
scored, or measured and unscoreable — a recording with no speech in it, or a clip
that has no source audio to compare against. The starter clips have none, so a
take against one is kept without a score being invented for it.

## Languages

English and Vietnamese, in `src/i18n/`. Adding a third is one file and one
line: copy `vi.ts`, translate it, and add it to `LOCALES` in `index.ts`.

`en.ts` is the source of truth twice over — it is what the app falls back to,
and its keys are the type every other locale is checked against. A translation
that misses a key, misspells one, or takes different arguments **does not
compile**. That is the whole reason the messages are a typed object rather than
a bag of JSON: the alternative is finding out in front of a learner, and a
missing key in JSON is an empty space on a screen that nobody notices until
somebody who reads that language does.

A message is a string, or a function when the sentence depends on a number or a
name. The function lives in the locale rather than at the call site because the
rules are the translator's business: English needs "1 take" and "2 takes",
Vietnamese needs neither, and a call site that built the sentence itself would
be English wherever it was shown. The same goes for `scoreLabelKey` and
`needsPractice` — both hand back keys and measurements, never wording.

The language is chosen on the Profile screen and kept in `localStorage`. On a
first visit it comes from the browser's own list of preferences, in order, so
somebody whose first choice we do not speak still gets their second. Every
language is named in itself: somebody who has landed in one they cannot read
has to be able to find their own in the list.

The tests hold two lines nothing else can. `test/i18n.test.ts` checks at
runtime what the types check at build time, in case somebody silences the
compiler with a cast, and it fails on any message left identical to the English
outside a short list of words that are the same in both. The browser tests run
in English, which is the default, so they read as they always did.

## Tests

`test/` checks the library search, the flashcard deck, the streak arithmetic and
the analysis chart against known inputs.

`e2e/` drives the real browser against the real stack: Playwright starts the Go
API, the Python workers and **both** dev servers, on a database of the run's own,
with a WAV file fed in as the microphone. There is one API to test either front
end against, so there is one run with two projects:

```bash
npx playwright test                    # both
npx playwright test --project=app      # the learner app
npx playwright test --project=console  # ../app-admin, specs in e2e/console/
```

It covers record → score, the shared dub timeline, the console's cut-and-publish
flow, who can reach the console from either side, and two learners on one
leaderboard. Sign-in goes through the whole OAuth route with only the provider
faked (`AUTH_FAKE=1`), so the state parameter, the PKCE cookie and `ADMIN_EMAILS`
are all exercised.

A test that needs a library rather than a studio gets one from `e2e/seed.ts`,
through the API. Driving the console's screens to set up a learner test would
couple the two apps for nothing — and would be slower.

Set `CHROMIUM_PATH` to reuse a browser already on the machine, and
`TEST_DATABASE_URL` to point at a Postgres the run may create a database in.

The tests share one server and reset it between each other through a route that
exists only when `AUTH_FAKE=1` — see `../server/README.md`.

## Clips are fetched, not held

The store used to load every clip at sign-in and keep the array; screens
filtered it. `data.videos` is still there but it is a **cache**, empty at
sign-in and filled by `ensureClips(ids)`, which asks the server for the ids it
does not already have, 200 per request, and remembers which ids came back
missing so a screen waiting on one does not wait forever.

`useClip(id)` is the hook a screen wants: it asks for the clip, returns it when
it arrives, and says `loading` until then. Practice, Analysis and Dub all wait
on it as well as on the store's own state.

What a screen needs beyond that it asks for by name — `repository.featuredClips()`
for the dashboard, `repository.nextUp()` for the practice suggestion,
`repository.librarySummary()` for the counts on the profile,
`repository.studioClips(q, limit, offset)` for the studio's clip manager. Adding
a screen that wants "all the clips" means adding the query that answers it, not
bringing the array back.

## Data

`src/repository/index.ts` is the only module that knows the shape of the API;
screens talk to the store in `src/store/`. Writes are per record rather than per
collection — the localStorage version saved whole arrays, which two devices would
have used to overwrite each other.
