import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

export type ScoringStage = 'upload' | 'measure'

/**
 * "Scoring…", shown the moment a take stops, until its score is in.
 *
 * Scoring takes a few seconds — the recording goes up, then the worker
 * measures it — and the only sign of it used to be one muted line low on the
 * page, easy to read as nothing happening. This floats over the top of the
 * screen instead, with the two steps and how long it has been.
 *
 * It does not block the page: no backdrop, so the learner can still reset the
 * mic or tap a word while it runs, and it can be hidden, which puts the small
 * line back.
 */
export function ScoringPopup({ stage, onHide }: { stage: ScoringStage; onHide: () => void }) {
  const t = useT()
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(tick)
  }, [])

  const steps: { key: ScoringStage; label: string }[] = [
    { key: 'upload', label: t('practice.scoringUpload') },
    { key: 'measure', label: t('practice.measuring') },
  ]
  const current = steps.findIndex((step) => step.key === stage)

  return (
    <div className="scoring-popup" role="status" aria-live="polite" data-stage={stage}>
      <span className="scoring-popup-mic" aria-hidden="true">
        <Icon name="mic" size={22} />
      </span>
      <div className="scoring-popup-body">
        <div className="row between gap-2">
          <strong className="scoring-popup-title">{t('practice.scoringTitle')}</strong>
          <span className="mono scoring-popup-time">{t('practice.scoringElapsed', seconds)}</span>
        </div>
        <ol className="scoring-steps">
          {steps.map((step, i) => (
            <li key={step.key} data-state={i < current ? 'done' : i === current ? 'active' : 'next'}>
              <span className="scoring-step-mark" aria-hidden="true">
                {i < current ? <Icon name="check-circle" size={14} /> : null}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      </div>
      <button type="button" className="btn btn-ghost scoring-popup-hide" onClick={onHide}>
        {t('practice.scoringHide')}
      </button>
    </div>
  )
}
