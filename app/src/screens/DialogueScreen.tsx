import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useT, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { PhraseForm } from '../components/PhraseForm'
import { known, reading, speakers, turnMillis, type Reading } from '../lib/dialogue'
import { explain } from '../lib/errors'
import { canListen, useListener } from '../lib/listen'
import { useRemote } from '../lib/remote'
import { canSpeak, speak, stopSpeaking } from '../lib/speak'
import {
  repository,
  type DialogueLine,
  type LearnerDialogue,
  type LinePasses,
  type PhraseInput,
} from '../repository'

/** Where the learner is with a line just read aloud. */
interface Attempt {
  line: number
  result: Reading | null
  /** Nothing at all was heard. */
  silent: boolean
}

/** A phrase being copied into the phrasebook, and where on the page from. */
interface Copying {
  key: string
  start: PhraseInput
}

const phraseKey = (phrase: string) => phrase.trim().toLowerCase()

/** The dialogue screen loads the dialogue; the lesson below is the dialogue. */
export function DialogueScreen() {
  const t = useT()
  const { ref = '' } = useParams()
  const remote = useRemote(ref, (key) => repository.dialogue(key))

  return (
    <div className="stack gap-6">
      <Link to="/dialogues" className="link-button row gap-1" style={{ alignSelf: 'flex-start' }}>
        <Icon name="chevron-left" size={16} />
        {t('dialogue.back')}
      </Link>
      {remote.state === 'loading' ? (
        <Loading />
      ) : remote.state === 'error' ? (
        <div className="card-meta">{remote.status === 404 ? t('dialogue.notFound') : remote.message}</div>
      ) : (
        <Lesson key={remote.value.id} dialogue={remote.value} t={t} />
      )}
    </div>
  )
}

/**
 * A dialogue to learn: heard in two voices, read aloud line by line until each
 * has been said the goal's number of times, said with one side hidden to know
 * it by heart, and copied from into the phrasebook.
 */
function Lesson({ dialogue: d, t }: { dialogue: LearnerDialogue; t: Translate }) {
  const [passes, setPasses] = useState<LinePasses[]>(d.passes)
  const [showVi, setShowVi] = useState(false)
  // The side whose lines are hidden: the learner's, when they play it.
  const [role, setRole] = useState<'' | 'A' | 'B'>('')
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [playing, setPlaying] = useState<number | null>(null)
  const [playingAll, setPlayingAll] = useState(false)
  // The line the learner is to say themselves, while the rest is played.
  const [turn, setTurn] = useState<number | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [copying, setCopying] = useState<Copying | null>(null)
  const [inBook, setInBook] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const listener = useListener()
  const run = useRef(0)
  const pause = useRef<number | undefined>(undefined)
  const who = speakers(d.lines)
  const voices = canSpeak()
  // Hearing that failed once — the microphone refused, or a browser with the
  // API but no service behind it — fails until the page is reloaded.
  const listens = canListen() && listener.failed === null
  const knownLines = passes.filter((p) => known(p, d.goal)).length

  useEffect(() => {
    let wanted = true
    repository
      .phrasebook()
      .then((book) => wanted && setInBook(new Set(book.map((p) => phraseKey(p.phrase)))))
      .catch(() => undefined)
    return () => {
      wanted = false
      run.current++
      window.clearTimeout(pause.current)
      stopSpeaking()
    }
  }, [])

  const stop = () => {
    run.current++
    window.clearTimeout(pause.current)
    stopSpeaking()
    setPlaying(null)
    setPlayingAll(false)
    setTurn(null)
  }

  const voiceOf = (line: DialogueLine) => (line.speaker === 'A' ? 0 : 1)

  const hear = (i: number) => {
    stop()
    const token = run.current
    setPlaying(i)
    speak(d.lines[i].text, {
      voice: voiceOf(d.lines[i]),
      onEnd: () => run.current === token && setPlaying(null),
    })
  }

  /** Plays the dialogue from the top, leaving a gap for the learner to say
   *  their own lines when one side is hidden. */
  const playAll = () => {
    stop()
    const token = run.current
    setPlayingAll(true)
    const step = (i: number) => {
      if (run.current !== token) return
      if (i >= d.lines.length) {
        setPlaying(null)
        setPlayingAll(false)
        setTurn(null)
        return
      }
      const line = d.lines[i]
      setPlaying(i)
      if (role !== '' && line.speaker === role) {
        setTurn(i)
        pause.current = window.setTimeout(() => {
          setTurn(null)
          step(i + 1)
        }, turnMillis(line.text))
        return
      }
      setTurn(null)
      speak(line.text, { voice: voiceOf(line), onEnd: () => step(i + 1) })
    }
    step(0)
  }

  const count = async (line: number, heard: number, total: number) => {
    try {
      const got = await repository.readLine(d.id, line, heard, total)
      setPasses((all) => all.map((p, i) => (i === line ? got : p)))
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
    }
  }

  const readAloud = async (i: number) => {
    stop()
    setError('')
    setAttempt({ line: i, result: null, silent: false })
    const said = await listener.listen()
    if (said.trim() === '') {
      setAttempt({ line: i, result: null, silent: true })
      return
    }
    const result = reading(said, d.lines[i].text)
    setAttempt({ line: i, result, silent: false })
    if (result.heard > 0) await count(i, result.heard, result.total)
  }

  const chooseRole = (side: '' | 'A' | 'B') => {
    stop()
    setRole(side)
    setRevealed(new Set())
  }

  const copy = (key: string, phrase: string, note: string) =>
    setCopying({ key, start: { dialogueId: d.id, situation: d.situation || d.title, phrase, note } })

  const copied = (phrase: string) => {
    setInBook((book) => new Set(book).add(phraseKey(phrase)))
    setCopying(null)
  }

  const form = (key: string) =>
    copying?.key === key && (
      <PhraseForm start={copying.start} onSaved={(p) => copied(p.phrase)} onCancel={() => setCopying(null)} />
    )

  const copyButton = (key: string, phrase: string, note: string) =>
    inBook.has(phraseKey(phrase)) ? (
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

  const heardWords = useMemo(
    () =>
      attempt?.result?.marks.flatMap((m, j) =>
        'expected' in m ? [{ key: j, text: m.expected.raw, heard: m.kind === 'right' }] : [],
      ) ?? [],
    [attempt],
  )

  return (
    <>
      <div className="stack gap-2">
        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          {d.topic && <span className="tag tag-neutral">{d.topic}</span>}
          <span className="tag tag-outline">{d.level}</span>
        </div>
        <h1 style={{ margin: 0 }}>{d.title}</h1>
        {d.situation && <p style={{ margin: 0 }}>{d.situation}</p>}
        <div className="card-meta" data-testid="dialogue-known">
          {t('dialogue.knownOf', knownLines, d.lines.length)}
        </div>
      </div>

      <div className="dialogue-tools">
        {voices && (
          <button type="button" className="btn btn-primary" onClick={playingAll ? stop : playAll}>
            <Icon name={playingAll ? 'square' : 'play'} size={16} />
            {playingAll ? t('dialogue.stop') : t('dialogue.playAll')}
          </button>
        )}
        <button type="button" className="dict-chip" aria-pressed={showVi} onClick={() => setShowVi((v) => !v)}>
          {t('dialogue.showVi')}
        </button>
        <div className="row gap-1" role="group" aria-label={t('dialogue.myRole')} style={{ flexWrap: 'wrap' }}>
          <span className="card-meta">{t('dialogue.myRole')}</span>
          {(['', 'A', 'B'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className="dict-chip"
              aria-pressed={role === side}
              onClick={() => chooseRole(side)}
            >
              {side === '' ? t('dialogue.noRole') : who[side]}
            </button>
          ))}
        </div>
      </div>
      {!listens && (
        <div className="card-meta">
          {listener.failed === 'not-allowed' ? t('dialogue.noMic') : t('dialogue.cantListen')}
        </div>
      )}
      {error && (
        <div className="card-meta" role="alert">
          {error}
        </div>
      )}

      <ol className="dialogue-lines">
        {d.lines.map((line, i) => {
          const hidden = role !== '' && line.speaker === role && !revealed.has(i)
          const mine = attempt?.line === i
          const p = passes[i]
          return (
            <li
              key={i}
              className="dialogue-line"
              data-speaker={line.speaker}
              data-current={playing === i}
              data-testid={`line-${i}`}
            >
              <div className="dialogue-bubble">
                <div className="row between gap-2">
                  <span className="dialogue-who">{line.name || line.speaker}</span>
                  {known(p, d.goal) && <span className="tag tag-accent">{t('dialogue.known')}</span>}
                </div>
                {hidden ? (
                  <button
                    type="button"
                    className="dialogue-hidden"
                    onClick={() => setRevealed((all) => new Set(all).add(i))}
                  >
                    <Icon name="eye" size={16} />
                    {turn === i ? t('dialogue.yourTurn') : t('dialogue.reveal')}
                  </button>
                ) : (
                  <p className="dialogue-text">{line.text}</p>
                )}
                {showVi && !hidden && line.vi && <p className="dialogue-vi">{line.vi}</p>}

                {mine && listener.listening && (
                  <p className="dialogue-heard card-meta" aria-live="polite">
                    {t('dialogue.listening')} {listener.said}
                  </p>
                )}
                {mine && !listener.listening && attempt.silent && (
                  <p className="dialogue-heard card-meta">{t('dialogue.heardNothing')}</p>
                )}
                {mine && !listener.listening && attempt.result && (
                  <p className="dialogue-heard">
                    <span className="dict-text">
                      {heardWords.map((w) => (
                        <span key={w.key} className="dict-w" data-kind={w.heard ? 'right' : 'missing'}>
                          {w.text}{' '}
                        </span>
                      ))}
                    </span>
                    <span className="card-meta">{t('dialogue.heard', attempt.result.heard, attempt.result.total)}</span>
                  </p>
                )}

                <div className="dialogue-actions">
                  {voices && (
                    <button type="button" className="btn btn-ghost" onClick={() => hear(i)}>
                      <Icon name="volume" size={14} />
                      {t('dialogue.listen')}
                    </button>
                  )}
                  {listens ? (
                    mine && listener.listening ? (
                      <button type="button" className="btn btn-secondary" onClick={listener.stop}>
                        <Icon name="square" size={14} />
                        {t('dialogue.stopListening')}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary" onClick={() => void readAloud(i)}>
                        <Icon name="mic" size={14} />
                        {t('dialogue.readAloud')}
                      </button>
                    )
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => void count(i, 0, 0)}>
                      <Icon name="check-circle" size={14} />
                      {t('dialogue.readOnce')}
                    </button>
                  )}
                  {!hidden && copyButton(`line-${i}`, line.text, '')}
                  <Passes passes={p?.passes ?? 0} goal={d.goal} t={t} />
                </div>
                {form(`line-${i}`)}
              </div>
            </li>
          )
        })}
      </ol>

      {d.phrases.length > 0 && (
        <section className="stack gap-2" aria-labelledby="dialogue-phrases">
          <h2 id="dialogue-phrases" className="card-kicker" style={{ margin: 0 }}>
            {t('dialogue.phrases')}
          </h2>
          {d.phrases.map((phrase, j) => (
            <div key={j} className="card elev-sm stack gap-2" data-testid={`phrase-${j}`}>
              <div className="row between gap-2" style={{ flexWrap: 'wrap' }}>
                <strong className="dialogue-phrase">{phrase.phrase}</strong>
                <span className="row gap-1">
                  {voices && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      title={t('dialogue.listen')}
                      aria-label={t('dialogue.listen')}
                      onClick={() => speak(phrase.phrase.replace(/…/g, ''))}
                    >
                      <Icon name="volume" size={14} />
                    </button>
                  )}
                  {copyButton(`phrase-${j}`, phrase.phrase, phrase.note)}
                </span>
              </div>
              {phrase.note && <div className="card-meta">{phrase.note}</div>}
              {form(`phrase-${j}`)}
            </div>
          ))}
        </section>
      )}
    </>
  )
}

/** How many times a line has been read aloud, as the goal's dots. */
function Passes({ passes, goal, t }: { passes: number; goal: number; t: Translate }) {
  return (
    <span className="dialogue-passes" title={t('dialogue.passes', passes, goal)} aria-label={t('dialogue.passes', passes, goal)}>
      {Array.from({ length: goal }, (_, k) => (
        <span key={k} className="dialogue-pass" data-done={k < passes} />
      ))}
      <span className="mono">
        {passes}/{goal}
      </span>
    </span>
  )
}
