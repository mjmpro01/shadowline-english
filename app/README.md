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

Login → Library → Practice → Analysis → Dub Review, plus Vocabulary, Progress and Profile.
Navigation is a collapsible sidebar on desktop and a bottom tab bar on phones.

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

Scoring needs the clip's original audio to compare against, and this repo ships no media.
Attach a file on the Practice screen ("Attach source audio") and takes are scored against
it; without one, a take is still measured and its contour drawn, but no match score is
invented — the Analysis screen offers to score it once a source exists.

## What is still a stand-in

Sign-in is a local flag rather than real Google OAuth, clip import records the URL without
fetching anything from it, and the seeded practice history keeps illustrative scores and
curves (marked `sample` on the Analysis chart, against `measured` for real takes).

## Tests

`test/` checks the signal processing against synthesised tones whose melody is
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
