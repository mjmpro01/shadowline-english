import { useCallback, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { ClipPlayer } from '../components/ClipPlayer'
import { DubExport } from '../components/DubExport'
import { ClipFace } from '../components/ClipFace'
import { Icon } from '../components/Icon'
import { ScoreBadge } from '../components/ScoreBadge'
import { LoadFailure, Loading } from '../components/LoadState'
import { NoSuchClip } from '../components/NoSuchClip'
import { MAX_CLIP_SECONDS, type Take } from '../data/types'
import { colorFor, pointsToNextTier as nextTierIn, scoreLabelKey } from '../lib/score'
import { urlOf, useClipAudio, useClipVideo } from '../lib/useAudioUrl'
import { useDub } from '../lib/useDub'
import { SOURCE_LABEL, useGloss } from '../lib/useGloss'
import { useRecorder } from '../lib/useRecorder'
import { normalizeWord } from '../lib/text'
import { useApp } from '../store/context'

const POPUP_LABEL = {
  added: 'practice.added',
  removed: 'practice.removed',
} as const

/** The word tapped and what tapping it did. What it *means* is not in here:
 *  that is looked up separately and arrives when it arrives. */
interface Popup {
  word: string
  /** The line it was tapped in, kept so the lookup can pick the sense that
   *  sentence uses. Held here rather than read live, so moving to the next line
   *  does not re-ask for the word still on screen. */
  context: string
  statusLabel: string
}

const BAR_COUNT = 30

/** Stretches however many loudness samples we captured across the full frame. */
function waveBars(levels: number[], live: boolean) {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const level = live
      ? levels[i]
      : levels.length
        ? levels[Math.min(levels.length - 1, Math.floor((i / BAR_COUNT) * levels.length))]
        : undefined
    const height = level === undefined ? 3 : Math.max(4, 8 + level * 46)
    return {
      x: i * 10 + 1,
      y: 32 - height / 2,
      w: 7,
      h: height,
      color: level === undefined ? 'var(--color-neutral-400)' : 'var(--score-good)',
    }
  })
}

export function PracticeScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const { data, state, addTake, toggleVocabWord } = useApp()

  const [lineIndex, setLineIndex] = useState(0)
  const [take, setTake] = useState<Take | null>(null)
  const [capturedLevels, setCapturedLevels] = useState<number[]>([])
  const [popup, setPopup] = useState<Popup | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const sourcePlayer = useRef<HTMLMediaElement | null>(null)
  // Stable, so the element is not detached and reattached every render.
  const attachSource = useCallback((element: HTMLMediaElement | null) => {
    sourcePlayer.current = element
  }, [])
  // Bumped whenever the screen stops caring about the take being scored — a new
  // recording, a reset, the next line. Scoring is a poll that runs for seconds,
  // so without this the take that finishes last wins rather than the take the
  // learner is actually looking at: pressing Record mid-scoring used to put the
  // abandoned take's score on screen underneath the new recording's waveform.
  const attempt = useRef(0)

  const recorder = useRecorder({
    onComplete: async (recording, capturedLevels) => {
      // A null recording means the microphone gave us nothing; there is no take
      // to store, and sending an empty body would only queue a job that fails.
      if (!video || !recording) return
      const mine = attempt.current
      setCapturedLevels(capturedLevels)
      setAnalysing(true)
      try {
        const scored = await addTake(video.id, recording)
        // Stored either way — it is the learner's recording and it is theirs to
        // keep — but only shown while it is still the one on screen.
        if (attempt.current === mine) setTake(scored)
      } finally {
        if (attempt.current === mine) setAnalysing(false)
      }
    },
  })

  const video = data.videos.find((v) => v.id === videoId)
  const sourceAudio = useClipAudio(video?.id ?? null)
  const sourceUrl = urlOf(sourceAudio)
  const sourceVideoUrl = urlOf(useClipVideo(video?.id ?? null))
  const dubState = useDub(take?.hasAudio ? take.id : null)
  /** Either form of the clip counts as having something to play. */
  const playable = sourceVideoUrl ?? sourceUrl
  const line = video?.captions[Math.min(lineIndex, (video?.captions.length ?? 1) - 1)]

  // Before the early returns, because it is a hook. No popup means no word and
  // no lookup.
  const gloss = useGloss(popup?.word ?? null, popup?.context ?? '')

  const words =
    line?.text.split(' ').map((raw) => ({
      raw,
      added: data.vocab.some((v) => v.word === normalizeWord(raw)),
    })) ?? []

  // The clip list arrives from the server, so "not found yet" and "not found"
  // are different answers. Redirecting on the first would throw anyone opening
  // a link to a clip straight back to the library.
  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!video || !line) return <NoSuchClip />

  const recording = recorder.status === 'recording' || recorder.status === 'requesting'

  const tapWord = async (raw: string) => {
    const result = await toggleVocabWord(raw, video.id)
    setPopup({ word: result.word, context: line.text, statusLabel: t(POPUP_LABEL[result.status]) })
  }

  const toggleRecord = async () => {
    if (recording) {
      await recorder.stop()
      return
    }
    attempt.current += 1
    setTake(null)
    setCapturedLevels([])
    setAnalysing(false)
    await recorder.start()
  }

  const resetMic = () => {
    attempt.current += 1
    recorder.reset()
    setTake(null)
    setCapturedLevels([])
    setAnalysing(false)
  }

  const nextLine = () => {
    setLineIndex((i) => Math.min(i + 1, video.captions.length - 1))
    resetMic()
    setPopup(null)
  }

  const bars = waveBars(recording ? recorder.levels : capturedLevels, recording)

  return (
    <div className="stack gap-4" style={{ maxWidth: 820 }}>
      <div className="row between wrap gap-2">
        <h2 style={{ margin: 0 }}>{video.title}</h2>
        <div className="tag tag-neutral mono">
          {t('practice.lineOf', Math.min(lineIndex + 1, video.captions.length), video.captions.length)}
        </div>
      </div>

      <div className="practice-grid">
        <div className="stack gap-3">
          {/* The frame the design left for the picture. It held a play icon
              and nothing else until clips had video; the player used to be
              bolted on beside the buttons instead, which left the screen with
              two video areas and a picture in the wrong one. */}
          <div className="practice-video">
            <ClipPlayer attach={attachSource} videoUrl={sourceVideoUrl} audioUrl={sourceUrl} />
            {/* The same tint the library card gives this clip, so it looks like
                itself wherever it turns up rather than becoming an anonymous
                brown box the moment it is opened. No line on it: the line is
                directly below with every word tappable, and that copy is the
                useful one. */}
            {!sourceVideoUrl && <ClipFace id={video.id} posterUrl="" line="" />}
          </div>

          <div style={{ fontSize: 16, fontStyle: 'italic', textAlign: 'center' }}>
            “
            {words.map((word, i) => (
              <button
                type="button"
                className="caption-word"
                data-added={word.added}
                key={`${word.raw}-${i}`}
                onClick={() => void tapWord(word.raw)}
              >
                {word.raw}
              </button>
            ))}
            ”
          </div>
          <div style={{ fontSize: 11, textAlign: 'center', opacity: 0.5 }}>
            {t('practice.tapWord')}
          </div>
          <div className="mono" style={{ fontSize: 13, textAlign: 'center', opacity: 0.6 }}>
            {line.ipa}
          </div>

          {popup && (
            <div className="card elev-md" style={{ position: 'relative', alignSelf: 'center', width: 'min(280px, 100%)' }}>
              <button
                type="button"
                className="btn btn-icon btn-ghost"
                style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26 }}
                onClick={() => setPopup(null)}
                aria-label={t('practice.close')}
              >
                <Icon name="x" size={14} />
              </button>
              <div className="card-title">{popup.word}</div>
              <div className="mono" style={{ fontSize: 13, opacity: 0.6 }}>
                {gloss?.ipa}
              </div>
              {/* Three answers, and the popup says which: the definition, the
                  wait for one nobody has ever asked for, and the admission
                  that none is coming. Saying nothing would read as a blank. */}
              <div className="card-body" style={{ opacity: gloss?.meaning ? 1 : 0.6 }}>
                {gloss?.meaning || (gloss === null || gloss.status === 'pending'
                  ? t('practice.lookingUp')
                  : t('practice.noDefinition'))}
              </div>
              {/* Merriam-Webster's free tier requires their name wherever their
                  definitions appear. Credited whoever wrote it, though: a
                  learner should know whether they are reading a lexicographer
                  or a model. */}
              {gloss?.source && (
                <div style={{ fontSize: 11, opacity: 0.55 }}>
                  {SOURCE_LABEL[gloss.source] ?? gloss.source}
                </div>
              )}
              <span className="tag tag-accent-2" style={{ alignSelf: 'flex-start' }}>
                {popup.statusLabel}
              </span>
            </div>
          )}

          <div className="wave-frame" data-recorded={!!take}>
            <svg width="100%" height="64" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
              {bars.map((bar, i) => (
                <rect key={i} x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={bar.color} rx="2" />
              ))}
            </svg>
          </div>

          {recording && (
            <div className="row gap-2" style={{ justifyContent: 'center', fontSize: 13 }}>
              <span className="rec-dot" />
              {recorder.status === 'requesting' ? (
                t('practice.waitingMic')
              ) : (
                <>
                  {t('practice.recording')}
                  <span className="mono" style={{ opacity: 0.7 }}>
                    {t('practice.secondsLeft', Math.max(0, MAX_CLIP_SECONDS - recorder.elapsed).toFixed(1))}
                  </span>
                </>
              )}
            </div>
          )}
          {recorder.status === 'denied' && (
            <div style={{ fontSize: 13, textAlign: 'center', color: 'var(--score-attention)' }}>
              {t('practice.micBlocked')}
            </div>
          )}
          {recorder.status === 'unsupported' && (
            <div style={{ fontSize: 13, textAlign: 'center', color: 'var(--score-attention)' }}>
              {t('practice.micUnsupported')}
            </div>
          )}

          {(analysing || take?.status === 'pending') && (
            <div style={{ fontSize: 13, textAlign: 'center', opacity: 0.7 }}>{t('practice.measuring')}</div>
          )}

          {take && take.score !== null && (
            <div className="card elev-sm row between gap-3">
              <div className="stack gap-1" style={{ flex: 1 }}>
                <div className="card-kicker">{t('practice.scoreKicker')}</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>{t(scoreLabelKey(take.score))}</div>
                {/* What the next band costs, rather than a bare "re-record to
                    improve": a learner deciding whether to go again wants to
                    know how far away it is. */}
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {nextTierIn(take.score) === null
                    ? t('practice.topBand')
                    : t('practice.toNextBand', nextTierIn(take.score) ?? 0)}
                </div>
                <div className="meter" style={{ marginTop: 2 }}>
                  <span style={{ width: `${take.score}%`, background: colorFor(take.score) }} />
                </div>
              </div>
              {/* Keyed by the result, so a re-record mounts a fresh badge and
                  the number climbs again rather than sliding from the last
                  take's score to this one. */}
              <ScoreBadge key={`${take.id}-${take.score}`} score={take.score} />
            </div>
          )}

          {take && take.score === null && take.status !== 'pending' && (
            <div className="card elev-sm stack gap-2">
              {/*
                Three different reasons a take has no score, and the screen used
                to give one message for all of them: it told a learner their
                recording was too quiet when the truth was that the clip has
                nothing to score against.
              */}
              {take.status === 'failed' ? (
                <>
                  <div className="card-kicker">{t('practice.nothingToMeasure')}</div>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>
                    {take.error ?? t('practice.tooQuiet')} {t('practice.tryCloser')}
                  </div>
                </>
              ) : (
                <>
                  <div className="card-kicker">{t('practice.takeRecorded')}</div>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>
                    {t('practice.nothingToScore')}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="stack gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!playable}
            title={playable ? t('practice.hearClipTitle') : t('practice.noOriginal')}
            onClick={() => void sourcePlayer.current?.play()}
          >
            {sourceVideoUrl ? t('practice.watchClip') : t('practice.hearClip')}
          </button>
          <button
            type="button"
            className={`btn ${recording ? 'btn-secondary' : 'btn-primary'} btn-block`}
            // Scoring takes seconds, and starting another recording through it
            // leaves the learner watching two takes at once. Stopping is always
            // allowed; starting waits until there is an answer about the last.
            disabled={analysing && !recording}
            title={analysing && !recording ? t('practice.waitingForScore') : undefined}
            onClick={toggleRecord}
          >
            <Icon name={recording ? 'square' : 'mic'} size={14} />
            {recording ? t('practice.stop') : take ? t('practice.rerecord') : t('practice.record')}
          </button>
          <div className="divider" style={{ margin: '4px 0' }} />
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!take || lineIndex >= video.captions.length - 1}
            onClick={nextLine}
          >
            {t('practice.nextLine')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!take}
            onClick={() => navigate(`/library/${video.id}/dub`)}
          >
            {/* Named for where it goes. It used to say "Watch", which was
                unambiguous until the clip above it grew a picture and a button
                that says "Watch clip again". */}
            {t('practice.dubReview')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!take}
            onClick={() => navigate(`/library/${video.id}`)}
          >
            {t('practice.seeAnalysis')}
          </button>
          {/* Keeping the take is offered here, not only on Dub Review: a
              learner who has just nailed a line should not have to go to
              another screen to save it. */}
          <DubExport
            state={dubState}
            filename={video.title}
            canDub={video.hasVideo}
            hasRecording={!!take?.hasAudio}
            label={t('practice.saveDub')}
          />
          <div className="divider" style={{ margin: '4px 0' }} />
          <button type="button" className="btn btn-ghost btn-block" onClick={resetMic}>
            {t('practice.resetMic')}
          </button>
        </div>
      </div>

      <div className="row between">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/library')}>
          <Icon name="log-out" size={15} />
          {t('practice.exit')}
        </button>
      </div>
    </div>
  )
}

