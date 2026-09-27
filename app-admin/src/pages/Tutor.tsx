import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { Loading } from '../components/LoadState'
import { SegmentedControl } from '../components/SegmentedControl'
import { ApiError } from '../lib/api'
import { repository, type TutorUsage } from '../repository'

const PERIODS = [7, 30, 90] as const
type Period = `${(typeof PERIODS)[number]}`

/**
 * What the tutor costs: questions and tokens by day, and who asks most.
 *
 * Every question is paid for at the router, and before this the only way to know
 * how many there had been was the router's own dashboard, which knows nothing
 * about learners. Read from the rows the limit counts, so the two cannot
 * disagree.
 */
export function Tutor() {
  const { t, locale } = useI18n()
  const [period, setPeriod] = useState<Period>('30')
  const [usage, setUsage] = useState<TutorUsage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let wanted = true
    repository
      .tutorUsage(Number(period))
      .then((next) => {
        if (!wanted) return
        setUsage(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (wanted) setError(err instanceof ApiError ? err.message : 'Could not load the usage.')
      })
    return () => {
      wanted = false
    }
  }, [period])

  const count = (n: number) => n.toLocaleString(locale)
  const questions = usage?.days.reduce((sum, d) => sum + d.questions, 0) ?? 0
  const tokens = usage?.days.reduce((sum, d) => sum + d.promptTokens + d.completionTokens, 0) ?? 0

  return (
    <div className="stack gap-3">
      <div className="row between wrap gap-2">
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('tutor.title')}</h1>
          <div className="card-meta">
            {usage === null
              ? '—'
              : t('tutor.subtitle', usage.model, usage.limit.questions, usage.limit.windowMinutes)}
          </div>
        </div>
        <SegmentedControl<Period>
          name={t('tutor.period')}
          value={period}
          options={PERIODS.map((n) => ({ value: `${n}` as Period, label: t('tutor.days', n) }))}
          onChange={setPeriod}
        />
      </div>

      {error !== null && <div className="card-meta">{error}</div>}
      {usage === null && error === null && <Loading />}

      {usage !== null && usage.days.length === 0 && <div className="card-meta">{t('tutor.none')}</div>}

      {usage !== null && usage.days.length > 0 && (
        <>
          <div className="card-title">{t('tutor.total', questions, count(tokens))}</div>

          <section className="card elev-sm stack gap-2">
            <h2 className="card-title">{t('tutor.byDay')}</h2>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('tutor.day')}</th>
                    <th className="num">{t('tutor.questions')}</th>
                    <th className="num">{t('tutor.learners')}</th>
                    <th className="num">{t('tutor.inputTokens')}</th>
                    <th className="num">{t('tutor.outputTokens')}</th>
                    <th className="num">{t('tutor.failed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.days.map((day) => (
                    <tr key={day.day}>
                      {/* The server's days are UTC days, so the date is read in
                          UTC too — in the local zone a day would print as the
                          one before it for everybody west of Greenwich. */}
                      <td className="mono">
                        {new Date(day.day).toLocaleDateString(locale, { timeZone: 'UTC' })}
                      </td>
                      <td className="num">{count(day.questions)}</td>
                      <td className="num">{count(day.learners)}</td>
                      <td className="num">{count(day.promptTokens)}</td>
                      <td className="num">{count(day.completionTokens)}</td>
                      <td className="num">{day.failed > 0 ? count(day.failed) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card elev-sm stack gap-2">
            <h2 className="card-title">{t('tutor.byLearner')}</h2>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('tutor.learner')}</th>
                    <th className="num">{t('tutor.questions')}</th>
                    <th className="num">{t('tutor.inputTokens')}</th>
                    <th className="num">{t('tutor.outputTokens')}</th>
                    <th>{t('tutor.lastAsked')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.learners.map((learner) => (
                    <tr key={learner.userId}>
                      <td>
                        <div>{learner.name || learner.email}</div>
                        {learner.name && <div className="card-meta">{learner.email}</div>}
                      </td>
                      <td className="num">{count(learner.questions)}</td>
                      <td className="num">{count(learner.promptTokens)}</td>
                      <td className="num">{count(learner.completionTokens)}</td>
                      <td className="mono">{new Date(learner.lastAsked).toLocaleString(locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="card-meta">{t('tutor.tokensNote')}</div>
        </>
      )}
    </div>
  )
}
