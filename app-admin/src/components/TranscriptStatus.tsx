import { useEffect, useState } from 'react'
import type { Transcript, WorkerStatus } from '../data/types'
import { useT } from '../i18n'
import { Icon } from './Icon'

/** Seconds between two moments, never negative. */
function secondsBetween(from: string, now: number): number {
  return Math.max(0, Math.round((now - Date.parse(from)) / 1000))
}

/** A length of time the way somebody would say it: "40 giây", "3 phút". */
function useDuration() {
  const t = useT()
  return (seconds: number) => {
    if (seconds < 60) return t('time.seconds', seconds)
    if (seconds < 3600) return t('time.minutes', Math.floor(seconds / 60))
    if (seconds < 86400) return t('time.hours', Math.floor(seconds / 3600))
    return t('time.days', Math.floor(seconds / 86400))
  }
}

/** The clock, ticking once a second while `on` — for "waiting 40s" to move. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return now
}

type Tone = 'busy' | 'good' | 'warn' | 'bad' | 'quiet'

/**
 * Where the transcript of a recording is, in words an admin can act on.
 *
 * It used to be one sentence — "listening", "transcribing" or "could not be
 * transcribed" — which could not tell a queue nobody was reading from a model
 * that was busy, or a missing file from a missing model. This says which part
 * of the wait it is in, how long it has been, whether the transcriber is
 * running at all, and, when it gave up, why, with a way to try again.
 */
export function TranscriptStatus({
  transcript,
  uploading,
  onRetry,
}: {
  transcript: Transcript | null
  /** The recording is still on its way to the server. */
  uploading: boolean
  /** Queues the recording again; absent when there is nothing to retry. */
  onRetry?: () => Promise<void>
}) {
  const t = useT()
  const duration = useDuration()
  const pending = transcript?.status === 'pending'
  const now = useNow(pending)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(false)

  const retry = async () => {
    if (!onRetry) return
    setRetrying(true)
    setRetryError(false)
    try {
      await onRetry()
    } catch {
      setRetryError(true)
    } finally {
      setRetrying(false)
    }
  }

  let tone: Tone = 'quiet'
  let text = t('transcript.checking')
  let detail: string | null = null
  let hint: string | null = null
  const worker = transcript?.transcriber ?? null

  if (uploading) {
    tone = 'busy'
    text = t('transcript.uploading')
  } else if (transcript?.uploadFailed) {
    tone = 'bad'
    text = t('transcript.uploadFailed')
  } else if (transcript?.status === 'ready') {
    tone = 'good'
    text = t('transcript.ready', transcript.words.length)
  } else if (transcript?.status === 'failed') {
    tone = 'bad'
    text = transcript.error
      ? t('transcript.failed', transcript.attempts || transcript.maxAttempts || 1, transcript.error)
      : t('transcript.failedNoReason')
    detail = t('transcript.typeMeanwhile')
  } else if (transcript?.status === 'pending') {
    const running = transcript.stage === 'running'
    if (running && transcript.startedAt) {
      tone = 'busy'
      text = t(
        'transcript.running',
        duration(secondsBetween(transcript.startedAt, now)),
        transcript.attempts ?? 1,
        transcript.maxAttempts ?? 3,
      )
    } else {
      tone = 'busy'
      text = t(
        'transcript.queued',
        transcript.ahead ?? 0,
        duration(transcript.queuedAt ? secondsBetween(transcript.queuedAt, now) : 0),
      )
    }
    if (transcript.error) detail = t('transcript.lastError', transcript.error)

    // Nothing to take the job, or nothing heard from what took it: the wait
    // will not end on its own, which is the one thing worth shouting about.
    if (worker === null && transcript.transcriber !== undefined) {
      tone = 'warn'
      detail = t('transcript.neverSeen')
      hint = t('transcript.howToStart')
    } else if (worker && !worker.online) {
      tone = 'warn'
      const ago = duration(secondsBetween(worker.seenAt, now))
      detail = running ? t('transcript.offlineRunning', ago) : t('transcript.offline', ago)
      hint = t('transcript.howToStart')
    }
  }

  return (
    <div className={`transcript-status transcript-${tone}`} role="status" aria-live="polite">
      <span className="transcript-status-mark" aria-hidden="true">
        {tone === 'busy' || tone === 'quiet' ? (
          <span className="spinner" />
        ) : (
          <Icon name={tone === 'good' ? 'check-circle' : 'alert'} size={18} />
        )}
      </span>
      <div className="stack gap-1" style={{ minWidth: 0, flex: 1 }}>
        <div className="transcript-status-text">{text}</div>
        {detail && <div className="transcript-status-detail">{detail}</div>}
        {hint && <code className="transcript-status-hint">{hint}</code>}
        {worker && transcript?.status === 'pending' && worker.online && (
          <div className="transcript-status-detail">{t('transcript.worker.online', worker.busy)}</div>
        )}
        {retryError && <div className="transcript-status-detail">{t('transcript.retryFailed')}</div>}
      </div>
      {transcript?.status === 'failed' && !transcript.uploadFailed && onRetry && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={retrying}
          onClick={() => void retry()}
        >
          <Icon name="retry" size={15} />
          {t('transcript.retry')}
        </button>
      )}
    </div>
  )
}

/** The transcriber's state in one line, for the upload history's header. */
export function TranscriberBadge({ worker }: { worker: WorkerStatus | null | undefined }) {
  const t = useT()
  const duration = useDuration()
  const now = useNow(true)
  if (worker === undefined) return null
  const online = worker?.online ?? false
  return (
    <span className={`worker-badge ${online ? 'worker-online' : 'worker-offline'}`}>
      <span className="worker-dot" aria-hidden="true" />
      {worker === null
        ? t('transcript.worker.never')
        : online
          ? t('transcript.worker.online', worker.busy)
          : t('transcript.worker.offline', duration(secondsBetween(worker.seenAt, now)))}
    </span>
  )
}
