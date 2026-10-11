"""Whether a take has speech in it at all, before anything is scored.

The pitch tracker calls a frame voiced when it is loud enough and periodic, and
a voice is not the only periodic sound in a room. Mains hum, a laptop fan, a
fridge: each is a steady tone in the speech range, and the tracker follows it
for the whole take. The comparison then scores that tone like a delivery —
the right length, a steady "melody" — and a learner who said nothing got 50
or 60 for it.

Two things a voice does that a steady sound does not:

- it comes and goes. Syllables, the gaps between words, a breath: the loud
  frames of a spoken line are several times the quiet ones. A tone is as loud
  at the end as at the start.
- it fills a fair part of the line. A word or two of stray sound is not an
  attempt at the sentence.

Neither test looks at how well the line was said; that is the comparison's
job. They only decide whether there is anything to compare, and a take that
fails gets the same "no speech found" a silent one always got.
"""

from __future__ import annotations

import numpy as np

from .pitch import HOP_MS, Contour

# Loudest frames over quietest (90th over 10th percentile RMS). Speech, even
# in the noisiest fixture, is above 3.5; a steady tone is 1.0. 2.0 — 6 dB — is
# well clear of both.
MIN_LOUDNESS_SPREAD = 2.0

# Voiced time the take needs, as a share of the reference's, and in seconds:
# a line spoken fast is still well above a fifth of the original, and a stray
# sound is well below it.
MIN_VOICED_SHARE = 0.2
MIN_VOICED_SECONDS = 0.3


def _voiced_seconds(contour: Contour) -> float:
    return contour.voiced_frames * HOP_MS / 1000


def missing_speech(user: Contour, reference: Contour) -> str | None:
    """Why the take has no speech to score, or None when it has some."""
    voiced = _voiced_seconds(user)
    needed = max(MIN_VOICED_SECONDS, MIN_VOICED_SHARE * _voiced_seconds(reference))
    if voiced < needed:
        return f"no speech found in the recording ({voiced:.2f}s voiced, {needed:.2f}s needed)"

    quiet = float(np.percentile(user.rms, 10))
    loud = float(np.percentile(user.rms, 90))
    if quiet > 0 and loud / quiet < MIN_LOUDNESS_SPREAD:
        return (
            "no speech found in the recording "
            f"(a steady sound: loudness varies {loud / quiet:.1f}x, speech varies more)"
        )
    return None
