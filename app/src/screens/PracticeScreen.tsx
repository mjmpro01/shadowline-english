import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import type { Take } from '../data/types'
import { colorFor, scoreLabel } from '../lib/score'
import { useBlobUrl } from '../lib/useAudioUrl'
import { useRecorder } from '../lib/useRecorder'
import { normalizeWord } from '../lib/text'
import { useApp } from '../store/context'

const POPUP_LABEL = {
  added: 'Added to Vocabulary',
  removed: 'Removed from Vocabulary',
  known: 'Already in Vocabulary',
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
  const { data, addTake, attachSourceAudio, toggleVocabWord } = useApp()
  const recorder = useRecorder()

  const [lineIndex, setLineIndex] = useState(0)
  const [take, setTake] = useState<Take | null>(null)
  const [capturedLevels, setCapturedLevels] = useState<number[]>([])
  const [popup, setPopup] = useState<Popup | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const sourceInput = useRef<HTMLInputElement>(null)
  const sourcePlayer = useRef<HTMLAudioElement>(null)

  const video = data.videos.find((v) => v.id === videoId)
  const sourceUrl = useBlobUrl(video?.sourceAudioKey ?? null)
  const line = video?.captions[Math.min(lineIndex, (video?.captions.length ?? 1) - 1)]

  const words =
    line?.text.split(' ').map((raw) => ({
      raw,
      added: data.vocab.some((v) => v.word === normalizeWord(raw)),
    })) ?? []

  if (!video || !line) return <Navigate to="/library" replace />

  const recording = recorder.status === 'recording' || recorder.status === 'requesting'

  const tapWord = (raw: string) => {
    const result = toggleVocabWord(raw, video.id)
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
      const blob = await recorder.stop()
      setCapturedLevels(recorder.levels)
      setAnalysing(true)
      try {
        setTake(await addTake(video.id, blob))
      } finally {
        setAnalysing(false)
      }
      return
    }
    setTake(null)
    setCapturedLevels([])
    await recorder.start()
  }

  const attachSource = async (file: File | undefined) => {
    if (!file) return
    await attachSourceAudio(video.id, file)
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
                onClick={() => tapWord(word.raw)}
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
              {recorder.status === 'requesting' ? 'Waiting for microphone…' : 'Recording — read the line aloud'}
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

          {analysing && <div style={{ fontSize: 13, textAlign: 'center', opacity: 0.7 }}>Measuring your pitch…</div>}

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

          {take && take.score === null && (
            <div className="card elev-sm stack gap-2">
              <div className="card-kicker">{take.analysis ? 'Take measured' : 'Nothing to measure'}</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {take.analysis
                  ? "Your pitch contour was recorded. Attach this clip's original audio to score the take against it."
                  : 'The recording was too short or too quiet to track a pitch — try again closer to the mic.'}
              </div>
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => sourceInput.current?.click()}>
                Attach source audio
              </button>
            </div>
          )}
        </div>

        <div className="stack gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!sourceUrl}
            title={sourceUrl ? "Play the clip's original audio" : 'Attach the original audio first'}
            onClick={() => sourcePlayer.current?.play()}
          >
            Hear clip again
          </button>
          {sourceUrl && <audio ref={sourcePlayer} src={sourceUrl} />}
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
          <button type="button" className="btn btn-ghost btn-block" onClick={() => sourceInput.current?.click()}>
            {video.sourceAudioKey ? 'Replace source audio' : 'Attach source audio'}
          </button>
          <input
            ref={sourceInput}
            type="file"
            accept="audio/*,video/*"
            hidden
            onChange={(e) => void attachSource(e.target.files?.[0])}
          />
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
