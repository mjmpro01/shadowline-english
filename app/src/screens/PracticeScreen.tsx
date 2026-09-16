import { useCallback, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ClipPlayer } from '../components/ClipPlayer'
import { Icon } from '../components/Icon'
import { LoadFailure, Loading } from '../components/LoadState'
import { NoSuchClip } from '../components/NoSuchClip'
import { MAX_CLIP_SECONDS, type Take } from '../data/types'
import { colorFor, scoreLabel } from '../lib/score'
import { urlOf, useClipAudio, useClipVideo } from '../lib/useAudioUrl'
import { useRecorder } from '../lib/useRecorder'
import { normalizeWord } from '../lib/text'
import { useApp } from '../store/context'

const POPUP_LABEL = {
  added: 'Added to Vocabulary',
  removed: 'Removed from Vocabulary',
}

interface Popup {
  word: string
  ipa: string
  meaning: string
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
  const recorder = useRecorder({
    onComplete: async (recording, capturedLevels) => {
      // A null recording means the microphone gave us nothing; there is no take
      // to store, and sending an empty body would only queue a job that fails.
      if (!video || !recording) return
      setCapturedLevels(capturedLevels)
      setAnalysing(true)
      try {
        setTake(await addTake(video.id, recording))
      } finally {
        setAnalysing(false)
      }
    },
  })

  const video = data.videos.find((v) => v.id === videoId)
  const sourceAudio = useClipAudio(video?.id ?? null)
  const sourceUrl = urlOf(sourceAudio)
  const sourceVideoUrl = urlOf(useClipVideo(video?.id ?? null))
  /** Either form of the clip counts as having something to play. */
  const playable = sourceVideoUrl ?? sourceUrl
  const line = video?.captions[Math.min(lineIndex, (video?.captions.length ?? 1) - 1)]

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
    const entry = data.vocab.find((v) => v.word === result.word)
    setPopup({
      word: result.word,
      ipa: entry?.ipa ?? `/${result.word}/`,
      meaning: entry?.meaning ?? 'Auto-translated definition',
      statusLabel: POPUP_LABEL[result.status],
    })
  }

  const toggleRecord = async () => {
    if (recording) {
      await recorder.stop()
      return
    }
    setTake(null)
    setCapturedLevels([])
    await recorder.start()
  }

  const resetMic = () => {
    recorder.reset()
    setTake(null)
    setCapturedLevels([])
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
          Line {Math.min(lineIndex + 1, video.captions.length)} of {video.captions.length}
        </div>
      </div>

      <div className="practice-grid">
        <div className="stack gap-3">
          <div className="practice-video">
            <Icon name="play" size={34} />
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
            Tap a word to add it to Vocabulary — tap again to undo
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
                aria-label="Close"
              >
                <Icon name="x" size={14} />
              </button>
              <div className="card-title">{popup.word}</div>
              <div className="mono" style={{ fontSize: 13, opacity: 0.6 }}>
                {popup.ipa}
              </div>
              <div className="card-body">{popup.meaning}</div>
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
                'Waiting for microphone…'
              ) : (
                <>
                  Recording — read the line aloud
                  <span className="mono" style={{ opacity: 0.7 }}>
                    {Math.max(0, MAX_CLIP_SECONDS - recorder.elapsed).toFixed(1)}s left
                  </span>
                </>
              )}
            </div>
          )}
          {recorder.status === 'denied' && (
            <div style={{ fontSize: 13, textAlign: 'center', color: 'var(--score-attention)' }}>
              Microphone access was blocked. Allow it in your browser to record a take.
            </div>
          )}
          {recorder.status === 'unsupported' && (
            <div style={{ fontSize: 13, textAlign: 'center', color: 'var(--score-attention)' }}>
              This browser can't record audio.
            </div>
          )}

          {(analysing || take?.status === 'pending') && (
            <div style={{ fontSize: 13, textAlign: 'center', opacity: 0.7 }}>Measuring your pitch…</div>
          )}

          {take && take.score !== null && (
            <div className="card elev-sm row between">
              <div>
                <div className="card-kicker">Pitch match score</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>{scoreLabel(take.score)} — re-record to improve</div>
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 32, color: colorFor(take.score) }}>
                {take.score}
              </div>
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
                  <div className="card-kicker">Nothing to measure</div>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>
                    {take.error ?? 'The recording was too short or too quiet to track a pitch'} — try again
                    closer to the mic.
                  </div>
                </>
              ) : (
                <>
                  <div className="card-kicker">Take recorded</div>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>
                    This clip has no original audio, so there is nothing to score your delivery against.
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
            title={playable ? "Play the clip's original" : 'This clip has no original recording'}
            onClick={() => void sourcePlayer.current?.play()}
          >
            {sourceVideoUrl ? 'Watch clip again' : 'Hear clip again'}
          </button>
          <ClipPlayer attach={attachSource} videoUrl={sourceVideoUrl} audioUrl={sourceUrl} />
          <button
            type="button"
            className={`btn ${recording ? 'btn-secondary' : 'btn-primary'} btn-block`}
            onClick={toggleRecord}
          >
            <Icon name={recording ? 'square' : 'mic'} size={14} />
            {recording ? 'Stop' : take ? 'Re-record' : 'Record'}
          </button>
          <div className="divider" style={{ margin: '4px 0' }} />
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!take || lineIndex >= video.captions.length - 1}
            onClick={nextLine}
          >
            Next line
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!take}
            onClick={() => navigate(`/library/${video.id}/dub`)}
          >
            Watch
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!take}
            onClick={() => navigate(`/library/${video.id}`)}
          >
            See analysis
          </button>
          <div className="divider" style={{ margin: '4px 0' }} />
          <button type="button" className="btn btn-ghost btn-block" onClick={resetMic}>
            Reset mic
          </button>
        </div>
      </div>

      <div className="row between">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/library')}>
          <Icon name="log-out" size={15} />
          Exit
        </button>
      </div>
    </div>
  )
}

