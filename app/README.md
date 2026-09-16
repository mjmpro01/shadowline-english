# Shadowline

English shadowing practice — import a short clip, read each line back, and compare your
delivery against the source.

Built from the Claude Design handoff in `../project/Shadowline.dc.html`. The prototype's
Organic design system is ported in `src/styles/`, including the dark + amber overrides the
prototype applies on top of it.

## Running

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build
npm run lint
npm test          # unit tests (Vitest)
npm run test:e2e  # browser tests (Playwright)
```

The e2e run needs a Chromium; set `CHROMIUM_PATH` to reuse one already on the
machine instead of Playwright's own download.

## Screens

Login → Dashboard → Library → Practice → Analysis → Dub Review, plus Vocabulary,
Progress and Profile.
Navigation is a collapsible sidebar on desktop and a bottom tab bar on phones.

Clips are curated, not collected: learners practise what is in the library and
cannot import or upload anything themselves. `/admin` holds the clip studio,
where a recording is cut into lines — see below. The library is searchable by
name, line, playlist and category, since a learner is as likely to remember a
phrase from a clip as its title.

## Dashboard

Where signing in lands. Your own numbers — clips practised, takes, average score
and day streak — are computed from your takes; a streak counts days practised in
a row, and practising yesterday but not yet today still counts, since the day is
not over.

The leaderboard ranks you among sample learners, labelled as such on screen:
there is no backend and so no other learners, and inventing them silently would
read as a social feature that does not exist. Your row is the real one. Below it
sit the clips an admin has featured in the studio.

## Clip studio

Upload a recording and it is cut at the pauses between sentences rather than on
a fixed grid, because a clip cut mid-word is useless to shadow
(`src/lib/audio/segment.ts`: an RMS envelope, a noise floor taken from the
quietest tenth of the recording, and a split at the quietest moment of anything
still over the limit). The proposal is a starting point — boundaries drag,
clips merge and delete, and each one gets its line of text — and publishing
stores each cut as its own clip with its own audio.

Each cut gets a name, and the batch gets a playlist and categories, which is
what the library's search and filters run on. The studio's second tab lists
everything already published so a clip can be renamed, re-tagged, moved to
another playlist, featured on the dashboard or deleted after the fact — deleting a clip drops the practice
history that only made sense alongside it.

Fetching a YouTube URL needs a server to download and strip the audio, so that
button is there and disabled until there is a backend behind it.

## Clip length

A clip is one line to shadow, capped at `MAX_CLIP_SECONDS` (6) in
`src/data/types.ts`. Recording stops itself at the cap with a countdown on
screen, the studio never proposes a longer cut, and `addClips` refuses one
regardless of what the studio's editing allowed.

## Scoring

Takes are measured, not simulated. `src/lib/dsp/` tracks fundamental frequency with YIN
(40ms frames every 10ms), expresses it in semitones around each speaker's own median — so
a low voice shadowing a high one is judged on delivery, not register — and aligns the two
contours with banded dynamic time warping. From that:

- **Intonation** — mean semitone distance between the contours on a shared time axis.
  Measured on shape rather than on the warped alignment, so a monotone reading cannot hide
  behind time warping.
- **Rhythm** — how far the alignment had to wander from the diagonal, plus how closely the
  two utterances match in length.
- **Stress** — correlation of the two loudness envelopes at the aligned points.
- **Variation** — the ratio of the two pitch ranges (10th–90th percentile).

The arithmetic runs in a Web Worker (`src/lib/dsp/analyse.worker.ts`), which also
keeps the source clip's contour so it is tracked once per clip rather than once
per take. A minute-long take measures in well under a second without the UI
stalling; only the decode, which Web Audio can do on the main thread only, runs
outside the worker.

Scoring needs the clip's original audio to compare against. Clips published from
the studio carry theirs, so takes against them are scored. The sample clips that
ship with the app have none: a take against one is still measured and its contour
drawn, but no match score is invented for it.

## What is still a stand-in

Sign-in is a local flag rather than real Google OAuth, clip import records the URL without
fetching anything from it, and the seeded practice history keeps illustrative scores and
curves (marked `sample` on the Analysis chart, against `measured` for real takes).

## Tests

`test/` checks the cut proposal and the library search against known inputs, and
the signal processing against synthesised tones whose melody is
known in advance (`test/tone.ts`): a steady tone's fundamental is recovered, the
same melody an octave down still scores full marks, a monotone reading of a
melodic line is marked down, and a slow delivery keeps its intonation while
losing rhythm. `e2e/` drives the real browser with a WAV file fed in as the
microphone, covering record → measure → score and the shared dub timeline.

## Data

`src/repository/index.ts` is the data seam. Today `LocalRepository` keeps records in
localStorage and `src/lib/blobStore.ts` keeps recorded audio and the avatar in IndexedDB.
Pointing the app at a backend means implementing `Repository` against the API and swapping
the export at the bottom of that file; screens talk only to the store.

Seed content (clips, captions, vocabulary, practice suggestions) is in `src/data/seed.ts`.
