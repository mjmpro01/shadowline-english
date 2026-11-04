import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useT, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { PhraseForm } from '../components/PhraseForm'
import { explain } from '../lib/errors'
import { canListen, useListener } from '../lib/listen'
import { useRemote } from '../lib/remote'
import { roleplayName } from '../lib/roleplay'
import { canSpeak, speak, stopSpeaking } from '../lib/speak'
import {
  repository,
  type DialoguePhrase,
  type PhraseInput,
  type RoleplayFeedback,
  type RoleplaySession,
  type RoleplayTurn,
} from '../repository'

/** The role-play screen loads the session; the conversation below is it. */
export function RoleplayScreen() {
  const t = useT()
  const { id = '' } = useParams()
  const remote = useRemote(id, (key) => repository.roleplay(key))

  return (
    <div className="stack gap-6">
      <Link to="/dialogues/roleplay" className="link-button row gap-1" style={{ alignSelf: 'flex-start' }}>
        <Icon name="chevron-left" size={16} />
        {t('roleplay.back')}
      </Link>
      {remote.state === 'loading' ? (
        <Loading />
      ) : remote.state === 'error' ? (
        <div className="card-meta">{remote.message}</div>
      ) : (
        <Conversation key={remote.value.id} session={remote.value} t={t} />
      )}
    </div>
  )
}

/** A phrase being copied into the phrasebook, and from where on the page. */
interface Copying {
  key: string
  start: PhraseInput
}

/**
 * A role-play under way, or read again once it has ended: the tutor's lines in
 * its part, the learner's under them with a more natural way to say each, and
 * the feedback at the end.
 */
function Conversation({ session, t }: { session: RoleplaySession; t: Translate }) {
  const navigate = useNavigate()
  const [turns, setTurns] = useState<RoleplayTurn[]>(session.turns)
  const [feedback, setFeedback] = useState<RoleplayFeedback | null>(session.feedback)
  const [text, setText] = useState('')
  const [waiting, setWaiting] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState('')
  const [voice, setVoice] = useState(canSpeak())
  const [copying, setCopying] = useState<Copying | null>(null)
  const [copied, setCopied] = useState<Set<string>>(new Set())
  const [phrases, setPhrases] = useState<DialoguePhrase[]>([])
  const [again, setAgain] = useState(false)
  const listener = useListener()
  const end = useRef<HTMLDivElement>(null)
  const ended = feedback !== null
  const listens = canListen() && listener.failed === null
  const name = roleplayName(session, t)
  const said = turns.some((turn) => turn.role === 'user')

  // A dialogue's phrases, to draw on while playing it.
  useEffect(() => {
    if (!session.dialogueId) return
    let wanted = true
    repository
      .dialogue(session.dialogueId)
      .then((d) => wanted && setPhrases(d.phrases))
      .catch(() => undefined)
    return () => {
      wanted = false
    }
  }, [session.dialogueId])

  useEffect(() => () => stopSpeaking(), [])

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' })
  }, [turns.length, waiting, feedback])

  // What the browser hears goes into the box, to be read over before sending.
  useEffect(() => {
    if (listener.listening && listener.said) setText(listener.said)
  }, [listener.listening, listener.said])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const line = text.trim()
    if (!line || waiting !== null) return
    listener.stop()
    stopSpeaking()
    setError('')
    setWaiting(line)
    setText('')
    try {
      const reply = await repository.roleplayTurn(session.id, line)
      setTurns((all) => [
        ...all,
        { role: 'user', content: line, better: reply.better, why: reply.why },
        { role: 'assistant', content: reply.reply, better: '', why: '' },
      ])
      if (voice) speak(reply.reply)
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
      setText(line)
    } finally {
      setWaiting(null)
    }
  }

  const finish = async () => {
    stopSpeaking()
    setFinishing(true)
    setError('')
    try {
      setFeedback(await repository.endRoleplay(session.id))
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
    } finally {
      setFinishing(false)
    }
  }

  const playAgain = async () => {
    setAgain(true)
    setError('')
    try {
      const next = await repository.startRoleplay({
        scenario: session.scenario,
        topic: session.topic,
        dialogueId: session.dialogueId ?? undefined,
        side: session.ownSide || undefined,
      })
      navigate(`/dialogues/roleplay/${next.id}`)
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
      setAgain(false)
    }
  }

  const copy = (key: string, phrase: string, note: string) =>
    setCopying({ key, start: { dialogueId: session.dialogueId, situation: name, phrase, note } })

  const copyButton = (key: string, phrase: string, note: string) =>
    copied.has(key) ? (
      <span className="card-meta row gap-1">
        <Icon name="check-circle" size={14} />
        {t('dialogue.inBook')}
      </span>
    ) : (
      <button type="button" className="btn btn-ghost" onClick={() => copy(key, phrase, note)}>
        <Icon name="plus" size={14} />
        {t('dialogue.toBook')}
      </button>
    )

  const form = (key: string) =>
    copying?.key === key && (
      <PhraseForm
        start={copying.start}
        onSaved={() => {
          setCopied((all) => new Set(all).add(key))
          setCopying(null)
        }}
        onCancel={() => setCopying(null)}
      />
    )

  const listenButton = (line: string) =>
    canSpeak() && (
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        title={t('roleplay.listen')}
        aria-label={t('roleplay.listen')}
        onClick={() => speak(line)}
      >
        <Icon name="volume" size={14} />
      </button>
    )

  return (
    <>
      <div className="stack gap-2">
        <h1 style={{ margin: 0 }}>{name}</h1>
        {session.topic && <p style={{ margin: 0 }}>{session.topic}</p>}
        {canSpeak() && (
          <button
            type="button"
            className="dict-chip"
            style={{ alignSelf: 'flex-start' }}
            aria-pressed={voice}
            onClick={() => {
              if (voice) stopSpeaking()
              setVoice((v) => !v)
            }}
          >
            {t('roleplay.voice')}
          </button>
        )}
      </div>

      {phrases.length > 0 && !ended && (
        <div className="card elev-sm stack gap-1" data-testid="roleplay-phrases">
          <span className="card-kicker">{t('roleplay.useThese')}</span>
          <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
            {phrases.map((p) => (
              <span key={p.phrase} className="tag tag-accent" title={p.note}>
                {p.phrase}
              </span>
            ))}
          </div>
        </div>
      )}

      <ol className="dialogue-lines" aria-live="polite">
        {turns.map((turn, i) => (
          <li
            key={i}
            className="dialogue-line"
            data-speaker={turn.role === 'assistant' ? 'A' : 'B'}
            data-testid={`turn-${i}`}
          >
            <div className="dialogue-bubble">
              <div className="row between gap-2">
                <span className="dialogue-who">
                  {turn.role === 'assistant' ? t('roleplay.tutor') : t('roleplay.you')}
                </span>
                {turn.role === 'assistant' && listenButton(turn.content)}
              </div>
              <p className="dialogue-text">{turn.content}</p>
              {turn.role === 'user' &&
                (turn.better ? (
                  <div className="roleplay-better" data-testid="better">
                    <div className="row between gap-2" style={{ flexWrap: 'wrap' }}>
                      <span>
                        <span className="card-kicker">{t('roleplay.better')}</span>{' '}
                        <strong>{turn.better}</strong>
                      </span>
                      <span className="row gap-1">
                        {listenButton(turn.better)}
                        {copyButton(`turn-${i}`, turn.better, turn.why)}
                      </span>
                    </div>
                    {turn.why && <div className="card-meta">{turn.why}</div>}
                    {form(`turn-${i}`)}
                  </div>
                ) : (
                  <div className="card-meta row gap-1">
                    <Icon name="check-circle" size={14} />
                    {t('roleplay.fine')}
                  </div>
                ))}
            </div>
          </li>
        ))}
        {waiting !== null && (
          <>
            <li className="dialogue-line" data-speaker="B">
              <div className="dialogue-bubble">
                <span className="dialogue-who">{t('roleplay.you')}</span>
                <p className="dialogue-text">{waiting}</p>
              </div>
            </li>
            <li className="dialogue-line" data-speaker="A">
              <div className="dialogue-bubble card-meta">{t('roleplay.thinking')}</div>
            </li>
          </>
        )}
      </ol>
      <div ref={end} />

      {error && (
        <div className="card-meta" role="alert">
          {error}
        </div>
      )}

      {!ended ? (
        <>
          <form className="roleplay-input" onSubmit={(e) => void send(e)}>
            <textarea
              className="input dict-box"
              rows={2}
              maxLength={500}
              placeholder={t('roleplay.placeholder')}
              aria-label={t('roleplay.placeholder')}
              value={text}
              disabled={waiting !== null || finishing}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <div className="row gap-2">
              {listens &&
                (listener.listening ? (
                  <button type="button" className="btn btn-secondary" onClick={listener.stop}>
                    <Icon name="square" size={14} />
                    {t('roleplay.stopSpeaking')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={waiting !== null || finishing}
                    onClick={() => {
                      stopSpeaking()
                      void listener.listen()
                    }}
                  >
                    <Icon name="mic" size={14} />
                    {t('roleplay.speak')}
                  </button>
                ))}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={text.trim() === '' || waiting !== null || finishing}
              >
                {t('roleplay.send')}
              </button>
            </div>
          </form>
          {said && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start' }}
              disabled={waiting !== null || finishing}
              onClick={() => void finish()}
            >
              <Icon name="check-circle" size={16} />
              {finishing ? t('roleplay.finishing') : t('roleplay.finish')}
            </button>
          )}
        </>
      ) : (
        <>
          <section className="card elev-sm stack gap-3" aria-labelledby="roleplay-feedback" data-testid="feedback">
            <h2 id="roleplay-feedback" style={{ margin: 0 }}>
              {t('roleplay.feedback')}
            </h2>
            <p style={{ margin: 0 }}>{feedback.summary}</p>
            {feedback.strengths.length > 0 && (
              <div className="stack gap-1">
                <span className="card-kicker">{t('roleplay.strengths')}</span>
                <ul className="roleplay-list">
                  {feedback.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {feedback.fixes.length > 0 && (
              <div className="stack gap-2">
                <span className="card-kicker">{t('roleplay.fixes')}</span>
                {feedback.fixes.map((fix, i) => (
                  <div key={i} className="roleplay-better">
                    <div>
                      <del className="card-meta">{fix.said}</del>
                    </div>
                    <div className="row between gap-2" style={{ flexWrap: 'wrap' }}>
                      <strong>{fix.better}</strong>
                      <span className="row gap-1">
                        {listenButton(fix.better)}
                        {copyButton(`fix-${i}`, fix.better, fix.why)}
                      </span>
                    </div>
                    {fix.why && <div className="card-meta">{fix.why}</div>}
                    {form(`fix-${i}`)}
                  </div>
                ))}
              </div>
            )}
            {feedback.phrases.length > 0 && (
              <div className="stack gap-2">
                <span className="card-kicker">{t('roleplay.phrases')}</span>
                {feedback.phrases.map((p, i) => (
                  <div key={i} className="roleplay-better" data-testid={`feedback-phrase-${i}`}>
                    <div className="row between gap-2" style={{ flexWrap: 'wrap' }}>
                      <strong>{p.phrase}</strong>
                      <span className="row gap-1">
                        {listenButton(p.phrase.replace(/…/g, ''))}
                        {copyButton(`phrase-${i}`, p.phrase, p.note)}
                      </span>
                    </div>
                    {p.note && <div className="card-meta">{p.note}</div>}
                    {form(`phrase-${i}`)}
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="row gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="card-meta">{t('roleplay.over')}</span>
            <button type="button" className="btn btn-primary" disabled={again} onClick={() => void playAgain()}>
              {again ? t('roleplay.starting') : t('roleplay.again')}
            </button>
          </div>
        </>
      )}
    </>
  )
}
