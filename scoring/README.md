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
shadowline/ipa.py       CMUdict -> IPA, for transcripts and word lookups
shadowline/gloss.py     what a tapped word means, and which source said so
shadowline/dictionary.py  Merriam-Webster's Learner's Dictionary
shadowline/glossqueue.py  claim / complete / fail, for lookups
shadowline/glosser.py   the lookup loop
shadowline/seedwords.py   filling the cache before anybody taps anything
shadowline/data/        the 12,000 commonest English words
reference/              the archived TypeScript scorer, for the fixtures
```

## Looking words up

`python -m shadowline.glosser` answers "what does this word mean" for words a
learner taps in a caption. The pronunciation is a CMUdict lookup — free,
offline, the same every run. The meaning is asked for in order, cheapest first:

1. **Merriam-Webster's Learner's Dictionary** (`DICTIONARY_API_KEY`). Free for
   non-commercial use at 1,000 lookups a day, and the one dictionary written
   for people learning English rather than for people who already have it.
2. **The Claude API** (`ANTHROPIC_API_KEY`, `GLOSS_MODEL`), for the words it has
   no entry for — `gonna`, names, anything coined recently — and the only source
   that reads the sentence the word was tapped in.

```bash
DATABASE_URL=postgres://... \
DICTIONARY_API_KEY=... ANTHROPIC_API_KEY=sk-ant-... \
  python -m shadowline.glosser
```

Both keys are optional and the worker says at startup which ones it has. With
neither, words get their pronunciation and no meaning, which is what the browser
tests run against. A gloss is written once and read for ever, so the model is
priced per distinct word that reaches it — about $0.002 on the default model,
a fifth of that on `claude-haiku-4-5`.

### Seeding the cache

An empty cache means the first learner to tap each word waits for it.
`shadowline/data/common_words.txt` holds the 12,000 commonest English words, in
frequency order, every one of them in CMUdict.

```bash
python -m shadowline.seedwords                # 12,000 pronunciations: free, instant, no key
python -m shadowline.seedwords --meanings     # queue the meanings; the glosser works through them
python -m shadowline.seedwords --meanings --limit 2000
```

The two halves cost very different things, so they are separate. Pronunciations
are CMUdict and land in under a second with no key of any kind. Meanings are
opt-in, and the command says what it is about to commit to before it does it.

Meanings only have to be produced once, by anybody:

```bash
python -m shadowline.seedwords --export data/glosses.tsv   # after the glosser has run
python -m shadowline.seedwords --import data/glosses.tsv   # anywhere else, instantly
```

Commit that file and every deployment afterwards starts with the definitions
and asks nobody for anything. Definitions do not change; paying for the same
12,000 twice buys nothing.

`--requeue-empty` is the one to run after turning a key on. A glosser with no
source of meanings still answers taps — it writes the pronunciation and settles
the word, because the alternative is a popup that spins for ever — so words met
during that time need asking about again.

`tools/build_wordlist.py` rebuilds the word list from `wordfreq`. It is checked
in rather than generated at runtime so that seeding needs nothing but this
repository, and so that two deployments seeded a year apart hold the same words.

`python -m shadowline.dictionary <word>` prints Merriam-Webster's raw answer
beside what the parser made of it. It exists because the network this was
written on blocks `dictionaryapi.com`: the parsing follows their published JSON
shape rather than a response anybody here had seen, and one command against a
real key settles it. Being wrong about the shape costs a fall-through to the
model and nothing else — every unexpected shape, missing field and network
error returns "no definition from here" rather than raising.

Why not Oxford: no free plan any more. A 500-call sandbox to evaluate with, 403
on v2 for free accounts, then £50 a month billed annually. Why not the keyless
`dictionaryapi.dev`: its own status page reports 93.8% uptime over thirty days
and a seven-day mean response of twenty-one seconds. The full design is in
`../server/README.md`.
