# Shadowline

English shadowing practice — import a short clip, read each line back, and compare your
delivery against the source.

Built from the Claude Design handoff in `../project/Shadowline.dc.html`. The prototype's
Organic design system is ported in `src/styles/`, including the dark + amber overrides the
prototype applies on top of it.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run lint
```

## Screens

Login → Library → Practice → Analysis → Dub Review, plus Vocabulary, Progress and Profile.
Navigation is a collapsible sidebar on desktop and a bottom tab bar on phones.

## What is real and what is not

Real: microphone capture (`MediaRecorder`), the loudness bars drawn from the live signal,
playback of your own takes, vocabulary and take history, and every number on the Progress
and Profile screens.

Stand-ins: the pronunciation **score** and the **pitch contour** are generated, seeded off
the take id so they stay stable rather than re-rolling on each render — the F0 extraction
and alignment pipeline is a later phase. Source-clip audio and video are not bundled, so
"Original" playback is disabled. Sign-in is a local flag, not real Google OAuth.

## Data

`src/repository/index.ts` is the data seam. Today `LocalRepository` keeps records in
localStorage and `src/lib/blobStore.ts` keeps recorded audio and the avatar in IndexedDB.
Pointing the app at a backend means implementing `Repository` against the API and swapping
the export at the bottom of that file; screens talk only to the store.

Seed content (clips, captions, vocabulary, practice suggestions) is in `src/data/seed.ts`.
