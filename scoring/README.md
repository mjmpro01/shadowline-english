# Shadowline scoring worker

Scores recorded takes against the clip they shadow. Claims jobs from the
Postgres table the Go API writes them to, reads both recordings from object
storage, and writes the score and contour back.

```bash
pip install -r requirements-dev.txt
DATABASE_URL=postgres://... DISK_ROOT=/var/lib/shadowline/blobs python -m shadowline.worker
```

Needs `ffmpeg` on the path. `docker compose up` in `../server` runs it alongside
the API.

## Tests

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres pytest
```

The scoring tests run without a database; the worker tests create one of their
own and apply the Go server's migration file directly, rather than keeping a
copy of the schema that would drift.

## Parity with the browser

This worker replaces `app/src/lib/dsp/`, which scored takes in the browser. The
risk in that swap is silence: a take scored 82 there and 74 here would leave a
learner's practice history incomparable, and nothing on screen would say the
measuring stick had moved.

So the algorithm is **ported, not replaced**. Praat (via parselmouth) is a
better pitch tracker than the YIN implementation here, and switching to it would
have changed every score in every history. What is here is the same YIN, the same
semitone normalisation, the same banded DTW and the same four formulas.

`tests/fixtures/` holds synthesised tones with known melodies and the scores the
TypeScript produced for them, written by `app/test/fixtures.gen.test.ts`.
`tests/test_parity.py` asserts this worker reproduces all of them — currently
every metric of every case, exactly, not within a tolerance.

Parity alone would pass if both implementations were wrong in the same way, so
`tests/test_properties.py` separately asserts what the scores are supposed to
mean: an identical delivery is 100, the same melody an octave down is still 100,
a monotone reading of a melodic line is marked down, a slow take keeps its
intonation and loses rhythm.

## What the scores measure

- **Intonation** — mean semitone distance between the contours on a shared time
  axis. Measured on shape rather than on the warped alignment, so a monotone
  reading cannot hide behind time warping.
- **Rhythm** — how far the alignment wandered from the diagonal, plus how closely
  the two utterances match in length.
- **Stress** — correlation of the two loudness envelopes at the aligned points.
- **Variation** — the ratio of the two pitch ranges (10th–90th percentile).

Both contours are in semitones around each speaker's own median, so a low voice
shadowing a high one is judged on delivery, not register.

## A limitation worth stating

The pitch tracker degrades sharply with background noise: at around 35% noise it
loses a quarter of its voiced frames and Intonation collapses. A learner
recording in a loud room is marked down for a recording the app genuinely cannot
measure. `test_heavy_noise_degrades_the_measurement_rather_than_faking_one` pins
this so it is a known limit rather than a surprise.

## Failure, and what the learner sees

A take that cannot be scored is not given a score. `queue.fail` retries three
times — enough to cover a worker crashing mid-job — and then marks the take
`failed` with the reason, which the Practice and Analysis screens show. The
alternative, leaving it `pending`, is a screen that says "Measuring your pitch…"
forever.

A recording with no speech in it, and a clip whose source audio has gone missing,
both land here. Neither is a bad delivery, and neither gets a number.

If the database goes away the worker waits and reconnects rather than exiting:
stopping would leave every take recorded in the meantime sitting pending until
something restarted it.

## Scaling

One replica scores roughly one take a second — a six-second clip measures in
about 200ms — so worker CPU, not message throughput, is the limit worth
watching. Add replicas until `select count(*) from scoring_jobs where state =
'queued'` stops growing. See `../server/README.md` for why the queue is a table
and not Kafka.

## Layout

```
shadowline/pitch.py     YIN pitch tracking, ported from the browser
shadowline/compare.py   DTW and the four metrics
shadowline/audio.py     ffmpeg: whatever the browser recorded -> mono 8kHz
shadowline/queue.py     claim / complete / fail, against the Postgres table
shadowline/storage.py   reading audio from S3/MinIO or from a directory
shadowline/worker.py    the loop
reference/              the archived TypeScript scorer, for the fixtures
```
