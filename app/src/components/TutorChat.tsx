import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { ApiError } from '../lib/api'
import { parseMarkdown, type Inline } from '../lib/markdown'
import { askTutor, tutorEnabled, type TutorTurn } from '../lib/tutor'
import { useClip } from '../lib/useClip'
import { Icon } from './Icon'

/** A clip's own screens: /library/<id>, and its practice and dub screens. Series
 *  and episode pages are /library/s/… and /library/e/…, which this does not match. */
const CLIP_PATH = /^\/library\/([0-9a-f-]{36})(?:\/|$)/i

/** What an empty chat offers, depending on whether there is a line on screen. */
const ON_A_CLIP: MessageKey[] = ['tutor.askExplain', 'tutor.askSounds', 'tutor.askFix']
const IN_GENERAL: MessageKey[] = ['tutor.askLinking', 'tutor.askTh', 'tutor.askRoutine']

/**
 * The tutor, in a panel that opens from a button in the corner.
 *
 * Mounted in the shell rather than on a screen, so the conversation survives the
 * learner moving from the line to its analysis and back. When the screen is a
 * clip, the question goes up with that clip's id and the server tells the tutor
 * what the line is and how this learner's takes of it measured — which is what
 * lets it say "your stress was 44" rather than "stress is important".
 *
 * Kept for the tab, not stored: a conversation about one evening's practice is
 * not a record anybody asked the server to keep.
 */
export function TutorChat() {
  const { t, locale } = useI18n()
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)

  const { pathname } = useLocation()
  const clipId = CLIP_PATH.exec(pathname)?.[1] ?? null
  const { clip } = useClip(clipId ?? undefined)

  useEffect(() => {
    let wanted = true
    void tutorEnabled().then((on) => {
      if (wanted) setEnabled(on)
    })
    return () => {
      wanted = false
    }
  }, [])

  // Follow the answer as it is written, and put the cursor where the next
  // question goes when the panel opens.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [turns])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Leaving with an answer still streaming stops paying for it.
  useEffect(() => () => abort.current?.abort(), [])

  if (!enabled) return null

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    const asked: TutorTurn[] = [...turns, { role: 'user', content: question }]
    setTurns([...asked, { role: 'assistant', content: '' }])
    setDraft('')
    setFailure(null)
    setBusy(true)

    const controller = new AbortController()
    abort.current = controller
    try {
      await askTutor(
        asked,
        { clipId, locale },
        (delta) =>
          setTurns((current) => {
            const next = current.slice()
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, content: last.content + delta }
            return next
          }),
        controller.signal,
      )
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : t('tutor.failed'))
    } finally {
      // An answer that never started is not a turn: drop the empty bubble, so
      // the next question is not sent after a blank reply the model never gave.
      setTurns((current) =>
        current.length && current[current.length - 1].role === 'assistant' && current[current.length - 1].content === ''
          ? current.slice(0, -1)
          : current,
      )
      setBusy(false)
      abort.current = null
    }
  }

  const stop = () => abort.current?.abort()

  const restart = () => {
    stop()
    setTurns([])
    setFailure(null)
  }

  const suggestions = clipId ? ON_A_CLIP : IN_GENERAL

  return (
    <>
      <button
        type="button"
        className="tutor-launcher"
        aria-expanded={open}
        aria-controls="tutor-panel"
        onClick={() => setOpen((v) => !v)}
        title={t('tutor.open')}
        // Named for what pressing it does. The visible label is one word, and on
        // a phone not even that — the icon is all there is.
        aria-label={t('tutor.open')}
      >
        <Icon name="message-square" size={22} />
        <span className="tutor-launcher-label">{t('tutor.name')}</span>
      </button>

      {open && (
        <section
          id="tutor-panel"
          className="tutor-panel"
          role="dialog"
          aria-label={t('tutor.name')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
        >
          <header className="tutor-head">
            <div>
              <div className="tutor-title">{t('tutor.name')}</div>
              {/* Says what the tutor can see, so "this line" is never a guess. */}
              <div className="tutor-context">
                {clip ? t('tutor.about', clip.title) : t('tutor.general')}
              </div>
            </div>
            <div className="row gap-1">
              {turns.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={restart}>
                  {t('tutor.restart')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={t('tutor.close')}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </header>

          <div className="tutor-log" ref={log} aria-live="polite">
            {turns.length === 0 && (
              <div className="stack gap-2">
                <div className="card-meta">{clip ? t('tutor.introClip') : t('tutor.intro')}</div>
                <div className="stack gap-1">
                  {suggestions.map((key) => (
                    <button
                      type="button"
                      key={key}
                      className="tutor-suggestion"
                      onClick={() => void send(t(key))}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={`tutor-turn tutor-${turn.role}`}>
                {turn.role === 'assistant' ? (
                  turn.content ? (
                    <Rendered text={turn.content} />
                  ) : (
                    <span className="tutor-thinking">{t('tutor.thinking')}</span>
                  )
                ) : (
                  turn.content
                )}
              </div>
            ))}
            {failure !== null && <div className="tutor-failure">{failure}</div>}
          </div>

          <form
            className="tutor-compose"
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
          >
            <textarea
              ref={input}
              className="input"
              rows={2}
              maxLength={2000}
              value={draft}
              placeholder={t('tutor.placeholder')}
              aria-label={t('tutor.placeholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter is a new line — and neither while an
                // IME is still composing, which is how Vietnamese is typed.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
            />
            {busy ? (
              <button type="button" className="btn btn-secondary" onClick={stop}>
                {t('tutor.stop')}
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                {t('tutor.send')}
              </button>
            )}
          </form>
          <div className="tutor-note">{t('tutor.note')}</div>
        </section>
      )}
    </>
  )
}

/** The tutor's answer, from parsed Markdown into elements — never into HTML. */
function Rendered({ text }: { text: string }) {
  return (
    <>
      {parseMarkdown(text).map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        ) : block.ordered ? (
          <ol key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ol>
        ) : (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </>
  )
}

function inline(runs: Inline[]): ReactNode {
  return runs.map((run, i) => {
    switch (run.kind) {
      case 'bold':
        return <strong key={i}>{run.text}</strong>
      case 'italic':
        return <em key={i}>{run.text}</em>
      case 'code':
        return (
          <code key={i} className="mono">
            {run.text}
          </code>
        )
      default:
        return <Fragment key={i}>{run.text}</Fragment>
    }
  })
}
