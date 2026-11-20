import { useState } from 'react'
import { useI18n } from '../i18n'
import { explain } from '../lib/errors'
import { needsInstall, pushSupported, subscribe, timeZone, unsubscribe, type SubscribeResult } from '../lib/push'
import { useRemote } from '../lib/remote'
import { repository, type Reminders } from '../repository'

/**
 * Profile → Study reminders: on or off, when, and what about. Absent when the
 * server has no push keys; explains itself on a browser or a phone that cannot
 * have them.
 */
export function RemindersCard() {
  const { t, locale } = useI18n()
  const remote = useRemote('', async () => {
    const key = await repository.pushKey()
    return key ? repository.reminders() : null
  })
  const [prefs, setPrefs] = useState<Reminders | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (remote.state !== 'ready' || remote.value === null) return null
  const current = prefs ?? remote.value
  const on = current.enabled && current.subscribed

  const save = async (next: Partial<Reminders>) => {
    const merged = { ...current, ...next }
    setBusy(true)
    setNote(null)
    try {
      setPrefs(
        await repository.saveReminders({
          enabled: merged.enabled,
          remindAt: merged.remindAt,
          tz: timeZone(),
          locale: locale === 'en' ? 'en' : 'vi',
          streak: merged.streak,
          newEpisodes: merged.newEpisodes,
          competition: merged.competition,
        }),
      )
    } catch (err) {
      setNote(explain(err, t, t('reminders.failed')))
    } finally {
      setBusy(false)
    }
  }

  const turn = async (wanted: boolean) => {
    setNote(null)
    if (!wanted) {
      setBusy(true)
      await unsubscribe()
      setBusy(false)
      await save({ enabled: false })
      return
    }
    setBusy(true)
    let result: SubscribeResult
    try {
      result = await subscribe()
    } catch (err) {
      setBusy(false)
      setNote(explain(err, t, t('reminders.failed')))
      return
    }
    setBusy(false)
    if (result !== 'ok') {
      setNote(t(result === 'denied' ? 'reminders.denied' : 'reminders.unsupported'))
      return
    }
    await save({ enabled: true })
  }

  const test = async () => {
    setBusy(true)
    setNote(null)
    try {
      const n = await repository.testReminder()
      setNote(n > 0 ? t('reminders.testSent', n) : t('reminders.testNone'))
    } catch (err) {
      setNote(explain(err, t, t('reminders.failed')))
    } finally {
      setBusy(false)
    }
  }

  const supported = pushSupported()
  return (
    <section
      className="card elev-sm stack gap-2 reminders-card"
      style={{ width: '100%', textAlign: 'left' }}
      aria-labelledby="reminders-title"
    >
      <h2 id="reminders-title" className="card-kicker" style={{ margin: 0 }}>
        {t('reminders.title')}
      </h2>
      <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{t('reminders.body')}</span>

      {needsInstall() ? (
        <div className="card-meta">{t('reminders.install')}</div>
      ) : !supported ? (
        <div className="card-meta">{t('reminders.unsupported')}</div>
      ) : (
        <>
          <label className="row gap-2 reminders-switch" style={{ alignItems: 'center' }}>
            <input
              type="checkbox"
              role="switch"
              checked={on}
              disabled={busy}
              onChange={(e) => void turn(e.target.checked)}
            />
            <span>{t('reminders.on')}</span>
          </label>
          {on && (
            <div className="stack gap-2 reminders-options">
              <label className="row gap-2 wrap" style={{ alignItems: 'center' }}>
                <span>{t('reminders.at')}</span>
                <input
                  type="time"
                  className="input"
                  style={{ width: 'auto' }}
                  value={current.remindAt}
                  disabled={busy}
                  onChange={(e) => e.target.value && void save({ remindAt: e.target.value })}
                />
              </label>
              <label className="row gap-2" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={current.streak}
                  disabled={busy}
                  onChange={(e) => void save({ streak: e.target.checked })}
                />
                <span>{t('reminders.streak')}</span>
              </label>
              <label className="row gap-2" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={current.newEpisodes}
                  disabled={busy}
                  onChange={(e) => void save({ newEpisodes: e.target.checked })}
                />
                <span>{t('reminders.newEpisodes')}</span>
              </label>
              <label className="row gap-2" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={current.competition}
                  disabled={busy}
                  onChange={(e) => void save({ competition: e.target.checked })}
                />
                <span>{t('reminders.competition')}</span>
              </label>
              <div>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void test()}>
                  {t('reminders.test')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {note && (
        <div className="card-meta" role="status">
          {note}
        </div>
      )}
    </section>
  )
}

/**
 * On the Today card, once the goal is reached: an offer to be reminded
 * tomorrow, asked once. "Later" is kept on the server, so it is not asked again
 * on another device either.
 */
export function ReminderPrompt({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const available = useRemote('', async () => pushSupported() && !needsInstall() && (await repository.pushKey()) !== null)
  if (available.state !== 'ready' || !available.value) return null

  const turnOn = async () => {
    setBusy(true)
    setNote(null)
    try {
      const result = await subscribe()
      if (result !== 'ok') {
        setNote(t(result === 'denied' ? 'reminders.denied' : 'reminders.unsupported'))
        return
      }
      const prefs = await repository.reminders()
      await repository.saveReminders({
        enabled: true,
        remindAt: prefs.remindAt,
        tz: timeZone(),
        locale: locale === 'en' ? 'en' : 'vi',
        streak: prefs.streak,
        newEpisodes: prefs.newEpisodes,
        competition: prefs.competition,
      })
      onDone()
    } catch (err) {
      setNote(explain(err, t, t('reminders.failed')))
    } finally {
      setBusy(false)
    }
  }
  const later = async () => {
    setBusy(true)
    await repository.dismissReminderPrompt().catch(() => undefined)
    onDone()
  }
  return (
    <div className="reminder-prompt" role="group" aria-label={t('reminders.promptTitle')}>
      <span className="reminder-prompt-text">🔔 {t('reminders.promptTitle')}</span>
      <div className="row gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void turnOn()}>
          {t('reminders.promptOn')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void later()}>
          {t('reminders.promptLater')}
        </button>
      </div>
      {note && <span className="card-meta">{note}</span>}
    </div>
  )
}
