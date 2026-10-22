import { useEffect, useState } from 'react'
import type { Locale, Translate } from '../../i18n'
import { canSpeak, speak } from '../../lib/speak'
import type { Bilingual, Chat, Friend, GameState, GiftResult, HeartEvent, TalkResult } from '../api'
import { MAX_HEARTS, POINTS_PER_HEART, giftsInBag, replyKey } from '../town'
import { ItemIcon } from './common'
import { pick } from './util'

/**
 * A chat with someone in Echo Town: how well the player knows them, the day's
 * line and three replies to choose from, a gift, and the story they share at a
 * heart. What was right, and why, comes back from the server.
 */
export function TownChat({
  friend,
  chat,
  result,
  gift,
  story,
  state,
  locale,
  t,
  busy,
  onReply,
  onGift,
  onHeart,
}: {
  friend: Friend
  chat: Chat | null
  result: TalkResult | null
  gift: GiftResult | null
  /** A heart event just opened, to read. */
  story: HeartEvent | null
  state: GameState
  locale: Locale
  t: Translate
  busy: boolean
  onReply: (reply: number) => void
  onGift: (item: string, words: number) => void
  onHeart: (hearts: number) => void
}) {
  return (
    <div className="arena-town stack gap-3">
      <Hearts friend={friend} t={t} />
      {story ? (
        <Story story={story} state={state} locale={locale} t={t} />
      ) : (
        friend.event && (
          <div className="arena-heart-event">
            <p>{t('arena.talk.heartEvent', pick(friend.name, locale))}</p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onHeart(friend.event!.hearts)}>
              {t('arena.talk.listen')}
            </button>
          </div>
        )
      )}
      <ChatPart chat={chat} result={result} friend={friend} locale={locale} t={t} busy={busy} onReply={onReply} />
      <GiftPart chat={chat} gift={gift} friend={friend} state={state} locale={locale} t={t} busy={busy} onGift={onGift} />
    </div>
  )
}

function Hearts({ friend, t }: { friend: Friend; t: Translate }) {
  const toNext = friend.hearts >= MAX_HEARTS ? 100 : friend.points % POINTS_PER_HEART
  return (
    <div className="arena-hearts" title={t('arena.talk.points', friend.points)}>
      <span aria-label={t('arena.talk.hearts', friend.hearts)} data-testid="friend-hearts">
        {Array.from({ length: MAX_HEARTS }, (_, i) => (
          <span key={i} className="arena-heart-pip" data-on={i < friend.hearts}>
            ♥
          </span>
        ))}
      </span>
      <div className="arena-bar arena-bar-friend" aria-hidden="true">
        <span style={{ width: `${toNext}%` }} />
      </div>
    </div>
  )
}

/** A line that shows its translation when tapped. */
export function Line({ text, t, speakable = false }: { text: Bilingual; t: Translate; speakable?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="arena-line">
      <button type="button" className="arena-line-text" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {text.en}
        {open && <span className="arena-line-vi">{text.vi}</span>}
      </button>
      {speakable && canSpeak() && (
        <button type="button" className="arena-speak" onClick={() => speak(text.en)} aria-label={t('arena.listen')}>
          🔊
        </button>
      )}
    </div>
  )
}

function ChatPart({
  chat,
  result,
  friend,
  locale,
  t,
  busy,
  onReply,
}: {
  chat: Chat | null
  result: TalkResult | null
  friend: Friend
  locale: Locale
  t: Translate
  busy: boolean
  onReply: (reply: number) => void
}) {
  const [translate, setTranslate] = useState(false)
  const open = chat !== null && !chat.talked && !result
  // Keys 1–3 pick a reply.
  useEffect(() => {
    if (!open || !chat) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const i = replyKey(e.key, chat.replies.length)
      if (i >= 0 && !busy) onReply(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, chat, busy, onReply])

  if (!chat) return <p className="arena-muted">{t('arena.loading')}</p>
  return (
    <section className="arena-chat" aria-label={t('arena.talk.today')}>
      <p className="arena-muted">{t('arena.talk.today')}</p>
      <Line text={chat.line} t={t} speakable />
      {result ? (
        <div className="arena-turn" data-right={result.right}>
          <p className="arena-turn-verdict">
            {result.right ? t('arena.talk.right') : t('arena.talk.wrong')}{' '}
            <span className="arena-muted">{t('arena.talk.gain', result.points, pick(friend.name, locale))}</span>
          </p>
          <p>{pick(result.why, locale)}</p>
          {!result.right && (
            <p className="arena-muted">
              {t('arena.talk.better')} <strong>{result.answer.en}</strong>
            </p>
          )}
        </div>
      ) : chat.talked ? (
        <p className="arena-muted">{t('arena.talk.done')}</p>
      ) : (
        <>
          <div className="arena-options" data-long="true">
            {chat.replies.map((r, i) => (
              <button key={i} type="button" className="arena-option" disabled={busy} onClick={() => onReply(i)}>
                <kbd className="arena-kbd">{i + 1}</kbd>
                <span>
                  {r.en}
                  {translate && <span className="arena-line-vi">{r.vi}</span>}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="arena-link-btn" onClick={() => setTranslate((v) => !v)}>
            {translate ? t('arena.talk.hideTranslation') : t('arena.talk.showTranslation')}
          </button>
        </>
      )}
    </section>
  )
}

function GiftPart({
  chat,
  gift,
  friend,
  state,
  locale,
  t,
  busy,
  onGift,
}: {
  chat: Chat | null
  gift: GiftResult | null
  friend: Friend
  state: GameState
  locale: Locale
  t: Translate
  busy: boolean
  onGift: (item: string, words: number) => void
}) {
  const [item, setItem] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const name = pick(friend.name, locale)

  if (gift) {
    return (
      <section className="arena-gift" data-taste={gift.taste}>
        <p className="arena-turn-verdict">{t(`arena.gift.${gift.taste}`, name)}</p>
        <p className="arena-muted">
          {gift.rightWords ? t('arena.gift.wordsRight') : t('arena.gift.wordsWrong')} {pick(gift.why, locale)}
        </p>
        <p className="arena-muted">{t('arena.talk.gain', gift.points, name)}</p>
      </section>
    )
  }
  if (friend.giftedToday) return <p className="arena-muted">{t('arena.gift.done')}</p>
  if (!choosing) {
    return (
      <button type="button" className="btn btn-secondary arena-gift-open" disabled={busy || !chat} onClick={() => setChoosing(true)}>
        🎁 {t('arena.gift.give')}
      </button>
    )
  }
  const gifts = giftsInBag(state)
  if (gifts.length === 0) return <p className="arena-muted">{t('arena.gift.none')}</p>
  if (!item || !chat) {
    return (
      <section className="arena-gift">
        <p className="arena-muted">{t('arena.gift.which', name)}</p>
        <div className="arena-chips">
          {gifts.map((g) => (
            <button key={g.id} type="button" className="arena-chip arena-chip-btn" onClick={() => setItem(g.id)}>
              <ItemIcon id={g.id} size={20} /> {pick(g.name, locale)} × {g.qty}
            </button>
          ))}
        </div>
      </section>
    )
  }
  return (
    <section className="arena-gift">
      <p className="arena-muted">{t('arena.gift.say')}</p>
      <div className="arena-options" data-long="true">
        {chat.giftWords.map((w, i) => (
          <button key={i} type="button" className="arena-option" disabled={busy} onClick={() => onGift(item, i)}>
            <span>{w.en}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Story({ story, state, locale, t }: { story: HeartEvent; state: GameState; locale: Locale; t: Translate }) {
  return (
    <section className="arena-heart-event">
      {story.lines.map((l, i) => (
        <Line key={i} text={l} t={t} speakable />
      ))}
      <p className="arena-muted">
        {t('arena.got')}{' '}
        {story.reward.gold ? `+${story.reward.gold} ` : ''}
        {Object.entries(story.reward.items ?? {})
          .map(([id, n]) => `${pick(state.shop.find((s) => s.id === id)?.name ?? { en: id, vi: id }, locale)} × ${n}`)
          .join(', ')}
      </p>
    </section>
  )
}
