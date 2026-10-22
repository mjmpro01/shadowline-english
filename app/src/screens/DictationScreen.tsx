import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useT, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import {
  SELF_KINDS,
  align,
  autoKind,
  countErrors,
  markKey,
  score,
  type ErrorKind,
  type Mark,
} from '../lib/dictation'
import { explain } from '../lib/errors'
import { useRemote } from '../lib/remote'
import { normalizeWord } from '../lib/text'
import { clock } from '../lib/time'
import { usePassagePlayer, type PassagePlayer } from '../lib/usePassagePlayer'
import { repository, type Passage } from '../repository'
import { useApp } from '../store/context'

/**
 * Dictation, the five steps of it: listen to a passage through, write it down a
 * phrase at a time, check it against what was said, shadow it, and listen to it
 * again. The passage is a run of lines from one episode, starting at the one the
 * learner picked; the server gathers the lines and cuts them into phrases.
 *
 * With `?review=<id>` it is only the last step — the passage written down
 * yesterday, listened to again from the dashboard.
 */
export function DictationScreen() {
  const { episodeId, clipId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const t = useT()
  const remote = useRemote(clipId ?? '', (id) => repository.dictation(id))
  const title = remote.state === 'ready' ? remote.value.episode.title : null

  return (
    <div className="stack gap-4 dictation">
      <button
        type="button"
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate(`/library/e/${episodeId ?? ''}`)}
      >
        <Icon name="chevron-left" />
        {title ? t('dictation.back', title) : t('series.back')}
      </button>

      {remote.state === 'loading' && <Loading />}
      {remote.state === 'error' && (
        <div className="card-meta">{remote.status === 404 ? t('dictation.notFound') : remote.message}</div>
      )}
      {remote.state === 'ready' && (
        <Dictation key={clipId} passage={remote.value} review={params.get('review')} t={t} />
      )}
    </div>
  )
}

/** Minutes the method suggests for each step. */
const MINUTES = [3, 12, 5, 5, 5]
const STEP_NAMES = ['dictation.step1', 'dictation.step2', 'dictation.step3', 'dictation.step4', 'dictation.step5'] as const
/** Listens to a phrase before it may be left blank. */
const LISTENS_BEFORE_BLANK = 3

interface Draft {
  step: number
  chunk: number
  typed: string[]
  listens: number[]
  tags: Record<string, ErrorKind>
  savedId: string | null
  passes: number
}

function freshDraft(passage: Passage): Draft {
  const n = passage.chunks.length
  return { step: 1, chunk: 0, typed: new Array(n).fill(''), listens: new Array(n).fill(0), tags: {}, savedId: null, passes: 0 }
}

/** Kept for the tab, so a reload in the middle of writing loses nothing. */
function useDraft(passage: Passage, review: string | null) {
  const storageKey = `shadowline.dictation.${passage.clips[0]?.id ?? ''}`
  const [draft, setDraft] = useState<Draft>(() => {
    if (review) return { ...freshDraft(passage), step: 5 }
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Draft | null
      if (saved && saved.typed?.length === passage.chunks.length) return saved
    } catch {
      // Nothing usable kept; start again.
    }
    return freshDraft(passage)
  })
  useEffect(() => {
    if (review) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft))
    } catch {
      // A private window may refuse; the draft just does not outlive the tab.
    }
  }, [draft, review, storageKey])
  const clear = () => {
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      // As above.
    }
  }
  return [draft, setDraft, clear] as const
}

/** Time on the current step, beside what the method suggests. Keyed on the
 *  step, so it starts again at each. */
function StepClock({ minutes, t }: { minutes: number; t: Translate }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="card-meta mono" data-testid="step-clock">
      {clock(seconds)} · {t('dictation.suggested', minutes)}
    </div>
  )
}

function Dictation({ passage, review, t }: { passage: Passage; review: string | null; t: Translate }) {
  const [draft, setDraft, clearDraft] = useDraft(passage, review)
  const player = usePassagePlayer(passage.clips.map((c) => c.id))
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const goTo = (step: number) => {
    player.stop()
    update({ step })
  }

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{t('dictation.start')}</h1>
        <div className="card-meta">
          {passage.episode.title} · {t('dictation.passage', passage.clips.length, clock(passage.totalSeconds))}
        </div>
      </div>

      <ol className="dict-steps" aria-label={t('dictation.start')}>
        {STEP_NAMES.map((name, i) => {
          const n = i + 1
          if (review && n !== 5) return null
          return (
            <li key={name} className="dict-step" data-state={n === draft.step ? 'now' : n < draft.step ? 'done' : 'later'}>
              <span className="dict-step-number">{n < draft.step ? '✓' : n}</span>
              <span>{t(name)}</span>
            </li>
          )
        })}
      </ol>
      <StepClock key={draft.step} minutes={MINUTES[draft.step - 1]} t={t} />

      {player.state.status === 'error' && <div className="card-meta">{t('dictation.noAudio')}</div>}

      {draft.step === 1 && (
        <section className="card elev-sm stack gap-3">
          <p style={{ margin: 0 }}>{t('dictation.listenIntro')}</p>
          <PlayAll player={player} t={t} />
          <div className="row gap-2">
            <button type="button" className="btn btn-primary" onClick={() => goTo(2)}>
              {t('dictation.toWrite')}
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </section>
      )}

      {draft.step === 2 && (
        <Write
          passage={passage}
          draft={draft}
          player={player}
          t={t}
          onChange={update}
          onBack={() => goTo(1)}
          onDone={() => goTo(3)}
        />
      )}

      {draft.step === 3 && (
        <Check
          passage={passage}
          draft={draft}
          player={player}
          t={t}
          onTag={(key, kind) => update({ tags: { ...draft.tags, [key]: kind } })}
          onBack={() => goTo(2)}
          onSaved={(savedId) => {
            player.stop()
            update({ savedId, step: 4 })
          }}
          onNext={() => goTo(4)}
        />
      )}

      {draft.step === 4 && (
        <section className="card elev-sm stack gap-3">
          <p style={{ margin: 0 }}>{t('dictation.shadowIntro')}</p>
          <div className="row gap-3 wrap" style={{ alignItems: 'center' }}>
            <PlayAll
              player={player}
              t={t}
              label={t('dictation.readAlong')}
              onFinished={() => setDraft((d) => ({ ...d, passes: d.passes + 1 }))}
            />
            <span className="tag tag-neutral" data-testid="passes">
              {t('dictation.passes', draft.passes)}
            </span>
          </div>
          <div className="stack gap-2">
            {passage.clips.map((clip, i) => (
              <div key={clip.id} className="dict-line" data-current={player.playing === i}>
                <span className="dict-line-text">{clip.text}</span>
                <Link className="btn btn-ghost" to={`/library/${clip.id}/practice`}>
                  <Icon name="mic" size={14} />
                  {t('dictation.practiseLine')}
                </Link>
              </div>
            ))}
          </div>
          <div className="row gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => goTo(3)}>
              <Icon name="chevron-left" size={16} />
              {t('dictation.prev')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => goTo(5)}>
              {t('dictation.next')}
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </section>
      )}

      {draft.step === 5 && (
        <Again
          review={review}
          player={player}
          t={t}
          episodeId={passage.episode.id}
          onBack={review ? null : () => goTo(4)}
          onDone={clearDraft}
        />
      )}
    </>
  )
}

function PlayAll({
  player,
  t,
  label,
  onFinished,
}: {
  player: PassagePlayer
  t: Translate
  label?: string
  onFinished?: () => void
}) {
  const playing = player.playing !== null
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ alignSelf: 'flex-start' }}
      disabled={player.state.status !== 'ready'}
      onClick={async () => {
        if (playing) return player.stop()
        if (await player.playAll()) onFinished?.()
      }}
    >
      <Icon name={playing ? 'square' : 'play'} size={14} />
      {playing ? t('dictation.stop') : (label ?? t('dictation.playAll'))}
    </button>
  )
}

function Write({
  passage,
  draft,
  player,
  t,
  onChange,
  onBack,
  onDone,
}: {
  passage: Passage
  draft: Draft
  player: PassagePlayer
  t: Translate
  onChange: (patch: Partial<Draft>) => void
  onBack: () => void
  onDone: () => void
}) {
  const i = draft.chunk
  const chunk = passage.chunks[i]
  const clipIndex = passage.clips.findIndex((c) => c.id === chunk.clipId)
  const listens = draft.listens[i]
  const typed = draft.typed[i]
  const last = i === passage.chunks.length - 1
  const empty = typed.trim() === ''
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    box.current?.focus()
  }, [i])

  const listen = () => {
    const next = [...draft.listens]
    next[i] = listens + 1
    onChange({ listens: next })
    void player.playRange(clipIndex, chunk.start, chunk.end)
  }
  const move = (to: number) => {
    player.stop()
    onChange({ chunk: to })
  }
  const hint = (['dictation.hint0', 'dictation.hint1', 'dictation.hint2', 'dictation.hint3'] as const)[
    Math.min(listens, 3)
  ]

  return (
    <section className="card elev-sm stack gap-3" data-testid="write">
      <div className="row between wrap gap-2">
        <strong>{t('dictation.chunk', i + 1, passage.chunks.length)}</strong>
        <span className="card-meta" data-testid="listens">
          {t('dictation.listens', listens)}
        </span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${((i + 1) / passage.chunks.length) * 100}%` }} />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={player.state.status !== 'ready'}
        onClick={listen}
      >
        <Icon name="volume" size={16} />
        {t('dictation.listen')}
      </button>
      <p className="dict-hint" style={{ margin: 0 }}>
        {t(hint)}
      </p>
      <textarea
        ref={box}
        className="input dict-box"
        rows={3}
        value={typed}
        placeholder={t('dictation.placeholder')}
        aria-label={t('dictation.chunk', i + 1, passage.chunks.length)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => {
          const next = [...draft.typed]
          next[i] = e.target.value
          onChange({ typed: next })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            listen()
          }
        }}
      />
      <div className="card-meta">{t('dictation.replayKey')}</div>
      <div className="row gap-2 wrap">
        <button type="button" className="btn btn-secondary" onClick={() => (i === 0 ? onBack() : move(i - 1))}>
          <Icon name="chevron-left" size={16} />
          {t('dictation.prev')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          // Something written, or listened to enough times that leaving it
          // blank is the method rather than skipping it.
          disabled={empty && listens < LISTENS_BEFORE_BLANK}
          onClick={() => (last ? onDone() : move(i + 1))}
        >
          {last ? t('dictation.toCheck') : empty ? t('dictation.leaveBlank') : t('dictation.next')}
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </section>
  )
}

const KIND_LABEL = {
  missingEnding: 'dictation.kind.missingEnding',
  shortWord: 'dictation.kind.shortWord',
  unknownWord: 'dictation.kind.unknownWord',
  sound: 'dictation.kind.sound',
  linking: 'dictation.kind.linking',
  other: 'dictation.kind.other',
} as const

function Check({
  passage,
  draft,
  player,
  t,
  onTag,
  onBack,
  onSaved,
  onNext,
}: {
  passage: Passage
  draft: Draft
  player: PassagePlayer
  t: Translate
  onTag: (key: string, kind: ErrorKind) => void
  onBack: () => void
  onSaved: (id: string) => void
  onNext: () => void
}) {
  const { data, toggleVocabWord } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const marks = useMemo(
    () => passage.chunks.map((c, i) => align(draft.typed[i], c.text)),
    [passage, draft.typed],
  )
  const totals = marks.reduce(
    (sum, m) => {
      const s = score(m)
      return { total: sum.total + s.total, right: sum.right + s.right }
    },
    { total: 0, right: 0 },
  )
  const counts = countErrors(marks, draft.tags)
  const percent = totals.total === 0 ? 100 : Math.round((totals.right / totals.total) * 100)
  const saved = draft.savedId !== null
  const collected = new Set(data.vocab.map((v) => v.word))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const d = await repository.saveDictation({
        firstClipId: passage.clips[0].id,
        clipIds: passage.clips.map((c) => c.id),
        total: totals.total,
        right: totals.right,
        errors: counts,
      })
      onSaved(d.id)
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack gap-3" data-testid="check">
      <div className="card elev-sm stack gap-2">
        <div className="row gap-3 wrap" style={{ alignItems: 'baseline' }}>
          <span className="score-big" data-testid="accuracy">
            {t('dictation.accuracy', percent)}
          </span>
          <span className="card-meta">{t('dictation.rightOf', totals.right, totals.total)}</span>
        </div>
        <div className="row gap-2 wrap">
          {(Object.keys(counts) as ErrorKind[])
            .filter((k) => counts[k] > 0)
            .map((k) => (
              <span key={k} className="tag tag-neutral" data-kind={k}>
                {t(KIND_LABEL[k])}: {counts[k]}
              </span>
            ))}
        </div>
      </div>

      {passage.chunks.map((chunk, c) => {
        const clipIndex = passage.clips.findIndex((x) => x.id === chunk.clipId)
        const errors = marks[c]
          .map((m, k) => ({ m, k }))
          .filter(({ m }) => m.kind === 'wrong' || m.kind === 'missing')
        return (
          <div key={c} className="card elev-sm stack gap-2 dict-chunk" data-testid="chunk">
            <div className="row gap-2" style={{ alignItems: 'flex-start' }}>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={t('dictation.listen')}
                disabled={player.state.status !== 'ready'}
                onClick={() => void player.playRange(clipIndex, chunk.start, chunk.end)}
              >
                <Icon name="volume" size={16} />
              </button>
              <p className="dict-text">
                {marks[c].map((m, k) => (
                  <Word key={k} mark={m} t={t} />
                ))}
              </p>
            </div>
            {errors.length === 0 ? (
              <div className="card-meta">{t('dictation.allRight')}</div>
            ) : (
              <ul className="dict-errors">
                {errors.map(({ m, k }) => {
                  if (m.kind !== 'wrong' && m.kind !== 'missing') return null
                  const key = markKey(c, k)
                  const auto = autoKind(m)
                  const tag = draft.tags[key]
                  const word = normalizeWord(m.expected.raw)
                  return (
                    <li key={key} className="dict-error" data-testid="mistake">
                      <span>
                        <strong>{m.expected.word}</strong>{' '}
                        <span className="card-meta">
                          {m.kind === 'wrong' ? t('dictation.youWrote', m.typed.raw) : t('dictation.missed')}
                        </span>
                      </span>
                      {auto ? (
                        <span className="tag tag-accent">{t(KIND_LABEL[auto])}</span>
                      ) : (
                        <span className="row gap-1 wrap" role="group" aria-label={t('dictation.tagPrompt')}>
                          {SELF_KINDS.map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              className="dict-chip"
                              aria-pressed={tag === kind}
                              disabled={saved}
                              onClick={() => onTag(key, kind)}
                            >
                              {t(KIND_LABEL[kind])}
                            </button>
                          ))}
                        </span>
                      )}
                      {tag === 'unknownWord' &&
                        (collected.has(word) ? (
                          <span className="card-meta">{t('dictation.inVocab')}</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void toggleVocabWord(word, chunk.clipId)}
                          >
                            {t('dictation.addVocab')}
                          </button>
                        ))}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {error && <div className="card-meta" role="alert">{error}</div>}
      <div className="row gap-2">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <Icon name="chevron-left" size={16} />
          {t('dictation.prev')}
        </button>
        {saved ? (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {t('dictation.next')}
            <Icon name="chevron-right" size={16} />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {t('dictation.save')}
            <Icon name="chevron-right" size={16} />
          </button>
        )}
      </div>
    </section>
  )
}

function Word({ mark, t }: { mark: Mark; t: Translate }) {
  switch (mark.kind) {
    case 'right':
      return <span className="dict-w" data-kind="right">{mark.expected.raw} </span>
    case 'wrong':
      return (
        <span className="dict-w" data-kind="wrong">
          <del>{mark.typed.raw}</del> <ins>{mark.expected.raw}</ins>{' '}
        </span>
      )
    case 'missing':
      return (
        <span className="dict-w" data-kind="missing" title={t('dictation.missed')}>
          {mark.expected.raw}{' '}
        </span>
      )
    case 'extra':
      return (
        <span className="dict-w" data-kind="extra" title={t('dictation.notSaid')}>
          <del>{mark.typed.raw}</del>{' '}
        </span>
      )
  }
}

function Again({
  review,
  player,
  t,
  episodeId,
  onBack,
  onDone,
}: {
  review: string | null
  player: PassagePlayer
  t: Translate
  episodeId: string
  onBack: (() => void) | null
  onDone: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const done = async () => {
    player.stop()
    setBusy(true)
    try {
      if (review) await repository.reviewDictation(review)
      onDone()
      navigate(review ? '/dashboard' : `/library/e/${episodeId}`)
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
      setBusy(false)
    }
  }

  return (
    <section className="card elev-sm stack gap-3">
      <p style={{ margin: 0 }}>{review ? t('dictation.reviewIntro') : t('dictation.againIntro')}</p>
      <PlayAll player={player} t={t} />
      {!review && <p className="card-meta" style={{ margin: 0 }}>{t('dictation.tomorrow')}</p>}
      {error && <div className="card-meta" role="alert">{error}</div>}
      <div className="row gap-2">
        {onBack && (
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            <Icon name="chevron-left" size={16} />
            {t('dictation.prev')}
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void done()}>
          <Icon name="check-circle" size={16} />
          {t('dictation.done')}
        </button>
      </div>
    </section>
  )
}
