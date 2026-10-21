import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Locale, Translate } from '../../i18n'
import type { GameState, Quests } from '../api'
import { clock, secondsUntil } from '../growth'
import { MAX_HEARTS } from '../town'
import { ItemIcon, Portrait, RewardChips, Sheet } from './common'
import { pick, useNow } from './util'

/** Where in the app a learning task is done. */
const GO: Record<string, string> = {
  shadow2: '/library',
  shadow75: '/library',
  review5: '/vocabulary/practice',
}

/** The quest book: the story step the player is on, and today's three tasks. */
export function QuestBook({
  quests,
  state,
  locale,
  t,
  busy,
  skew,
  start,
  onClose,
  onClaim,
}: {
  quests: Quests
  state: GameState | null
  locale: Locale
  t: Translate
  busy: boolean
  skew: number
  start: 'main' | 'daily' | 'town'
  onClose: () => void
  onClaim: (quest: string) => void
}) {
  const [tab, setTab] = useState(start)
  // The townsfolk tab, once there is a town.
  const tabs = state?.profile.townOpen ? (['main', 'daily', 'town'] as const) : (['main', 'daily'] as const)
  const tabName = { main: t('arena.quest.main'), daily: t('arena.quest.daily'), town: t('arena.quest.town') }
  const left = secondsUntil(quests.endsAt, useNow() + skew)
  const main = quests.main

  return (
    <Sheet title={t('arena.quests')} onClose={onClose} t={t} wide>
      <div className="arena-tabs" role="tablist">
        {tabs.map((which) => (
          <button
            key={which}
            type="button"
            role="tab"
            aria-selected={tab === which}
            className="arena-tab"
            onClick={() => setTab(which)}
          >
            {tabName[which]}
          </button>
        ))}
      </div>

      {tab === 'town' && state ? (
        <ul className="arena-list">
          {state.friends.map((f) => (
            <li key={f.id} className="arena-list-row arena-friend" data-testid={`friend-${f.id}`}>
              <Portrait id={f.id} />
              <div className="arena-list-text">
                <strong>{pick(f.name, locale)}</strong>
                <span className="arena-muted">{pick(f.role, locale)}</span>
                <span className="arena-friend-hearts" aria-label={t('arena.talk.hearts', f.hearts)}>
                  {'♥'.repeat(f.hearts)}
                  <span className="arena-muted">{'♡'.repeat(MAX_HEARTS - f.hearts)}</span>
                </span>
                <span className="arena-muted">
                  {f.talkedToday ? `✓ ${t('arena.town.chatted')}` : ''}
                  {f.talkedToday && f.giftedToday ? ' · ' : ''}
                  {f.giftedToday ? `✓ ${t('arena.town.gifted')}` : ''}
                </span>
                {state.letter?.from.id === f.id && (
                  <span className="arena-muted">
                    {state.letter.done ? '✓ ' : '✉ '}
                    {t('arena.letter.title', pick(f.name, locale))}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : tab === 'main' ? (
        main ? (
          <div className="arena-quest">
            <div className="arena-quest-head">
              <strong>{pick(main.title, locale)}</strong>
              {main.target > 0 && (
                <span className="arena-muted">
                  {main.progress}/{main.target}
                </span>
              )}
            </div>
            <p>{pick(main.objective, locale)}</p>
            {main.target > 0 && (
              <div className="arena-bar" aria-hidden="true">
                <span style={{ width: `${(main.progress / main.target) * 100}%` }} />
              </div>
            )}
            <RewardChips reward={main.reward} state={state} locale={locale} t={t} />
            {main.done && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onClaim('main')}>
                {t('arena.claim')}
              </button>
            )}
          </div>
        ) : (
          <p>{t('arena.quest.storyDone')}</p>
        )
      ) : (
        <div className="stack gap-3">
          <p className="arena-muted">{t('arena.quest.resetsIn', clock(left))}</p>
          {quests.daily.map((q) => (
            <div key={q.id} className="arena-quest" data-claimed={q.claimed}>
              <div className="arena-quest-head">
                <strong>{pick(q.title, locale)}</strong>
                <span className="arena-muted">
                  {q.progress}/{q.target}
                </span>
              </div>
              {q.learning && <span className="arena-tag">{t('arena.quest.inApp')}</span>}
              <div className="arena-bar" aria-hidden="true">
                <span style={{ width: `${(q.progress / q.target) * 100}%` }} />
              </div>
              <div className="arena-quest-foot">
                <RewardChips reward={q.reward} state={state} locale={locale} t={t} />
                {q.claimed ? (
                  <span className="arena-muted">{t('arena.claimed')}</span>
                ) : q.done ? (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onClaim(q.id)}>
                    {t('arena.claim')}
                  </button>
                ) : GO[q.id] ? (
                  <Link className="btn btn-secondary" to={GO[q.id]}>
                    {t('arena.quest.go')}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}

          <div className="arena-quest arena-chest" data-claimed={quests.chest.claimed}>
            <div className="arena-quest-head">
              <ItemIcon id={quests.chest.claimed ? 'chest_open' : 'chest_closed'} size={40} />
              <strong>{t('arena.quest.chest')}</strong>
              {quests.chest.streak > 0 && (
                <span className="arena-tag">🔥 {t('arena.quest.streak', quests.chest.streak)}</span>
              )}
            </div>
            <RewardChips reward={quests.chest.reward} state={state} locale={locale} t={t} />
            {(quests.chest.bonus.gold || quests.chest.bonus.items) && !quests.chest.claimed ? (
              <div className="arena-quest-foot">
                <span className="arena-muted">{t('arena.quest.bonus')}</span>
                <RewardChips reward={quests.chest.bonus} state={state} locale={locale} t={t} />
              </div>
            ) : null}
            {quests.chest.claimed ? (
              <span className="arena-muted">{t('arena.claimed')}</span>
            ) : quests.chest.ready ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onClaim('chest')}>
                {t('arena.quest.open')}
              </button>
            ) : (
              <span className="arena-muted">{t('arena.quest.chestHint')}</span>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
