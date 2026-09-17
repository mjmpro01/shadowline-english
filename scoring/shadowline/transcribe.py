"""Turning a recording into words with times, using Whisper locally.

Local rather than an API: a fifty-minute lecture is fifty minutes of billing
every time somebody re-cuts it, and the recordings are the product's own
material. faster-whisper runs the same models on CPU through CTranslate2, which
is what makes "local" mean minutes rather than hours.

The model is loaded once per process and kept. Loading is the expensive part —
seconds, and hundreds of megabytes — so a worker that reloaded it per job would
spend more time loading than transcribing.

`Transcriber` is a protocol so the queue, the word-to-clip mapping and the
worker can all be tested without a model on disk. Everything below it is the
one place that knows Whisper exists.
"""

from __future__ import annotations

import functools
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

log = logging.getLogger("shadowline.transcribe")


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class Transcription:
    language: str
    words: list[Word]


class TranscribeFailed(RuntimeError):
    """The recording cannot be transcribed, and retrying will not change that."""


class Transcriber(Protocol):
    def transcribe(self, path: Path) -> Transcription: ...


# tiny is too loose for a learner to trust, and anything above small costs more
# CPU than the accuracy buys on clean speech. Override with WHISPER_MODEL.
DEFAULT_MODEL = "small.en"


class WhisperTranscriber:
    def __init__(self, model: str | None = None, compute_type: str | None = None) -> None:
        self.model_name = model or os.environ.get("WHISPER_MODEL", DEFAULT_MODEL)
        # int8 is roughly four times faster than float32 on CPU and the
        # difference is inaudible in the transcript.
        self.compute_type = compute_type or os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

    @functools.cached_property
    def _model(self):
        from faster_whisper import WhisperModel

        log.info("loading whisper model %s (%s)", self.model_name, self.compute_type)
        return WhisperModel(self.model_name, device="cpu", compute_type=self.compute_type)

    def transcribe(self, path: Path) -> Transcription:
        try:
            segments, info = self._model.transcribe(
                str(path),
                word_timestamps=True,
                # Whisper will happily write words over silence. This drops the
                # silence before it gets the chance, which matters here because
                # the words are matched back to clip boundaries by time.
                vad_filter=True,
            )
            words: list[Word] = []
            for segment in segments:
                for word in segment.words or []:
                    text = word.word.strip()
                    if text:
                        words.append(Word(start=word.start, end=word.end, text=text))
            return Transcription(language=info.language or "", words=words)
        except Exception as err:  # noqa: BLE001 — every failure here is the same failure
            raise TranscribeFailed(str(err)) from err


def words_between(words: list[Word], start: float, end: float) -> list[Word]:
    """The words of a clip: those whose middle falls inside its boundaries.

    The middle rather than the start or the end, so a word straddling a cut goes
    to the side that holds most of it. Using the start would give the next clip
    a word it barely contains; using overlap at all would put the same word in
    both, and a learner would shadow it twice.
    """
    return [word for word in words if start <= (word.start + word.end) / 2 < end]


def line_of(words: list[Word]) -> str:
    """The words as a line to read.

    Whisper attaches punctuation to the word it follows, so joining on spaces is
    all that is needed — no detokenising, and no guessing where a comma went.
    """
    return " ".join(word.text for word in words).strip()
