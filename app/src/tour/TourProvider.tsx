import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { useT } from '../i18n'
import { useApp } from '../store/context'
import { TourContext, markTourSeen, savedTourStep, saveTourStep, tourSeen } from './context'
import { TOUR, type TourStep } from './steps'

/**
 * Runs the guided tour over whichever screen the learner is on.
 *
 * It starts by itself once: for a learner with no takes yet, on the dashboard,
 * in a browser that has not finished or skipped it. After that it only runs
 * when asked (the Guide and Profile screens have a button for it).
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<number | null>(() => {
    const saved = savedTourStep()
    return saved !== null && saved >= 0 && saved < TOUR.length ? saved : null
  })
  const { data, state } = useApp()
  const { pathname } = useLocation()
  // Also kept here, for a browser that will not store the flag: skipping must
  // stop the tour for this visit even when it cannot for the next.
  const dismissed = useRef(false)

  const start = useCallback(() => {
    dismissed.current = false
    setIndex(0)
  }, [])

  const finish = useCallback(() => {
    dismissed.current = true
    markTourSeen()
    setIndex(null)
  }, [])

  const next = useCallback(() => {
    setIndex((i) => {
      if (i === null) return null
      if (i + 1 < TOUR.length) return i + 1
      dismissed.current = true
      markTourSeen()
      return null
    })
  }, [])

  const isNew = state === 'ready' && data.profile !== null && data.takes.length === 0
  useEffect(() => {
    if (index !== null || dismissed.current || !isNew || pathname !== '/dashboard' || tourSeen()) return
    // Once the dashboard is on screen, so the first popup lands on the page it
    // talks about rather than over a loading spinner.
    const timer = window.setTimeout(() => setIndex(0), 400)
    return () => window.clearTimeout(timer)
  }, [index, isNew, pathname])

  useEffect(() => {
    saveTourStep(index)
  }, [index])

  const value = useMemo(() => ({ start, running: index !== null }), [start, index])

  return (
    <TourContext.Provider value={value}>
      {children}
      {index !== null && (
        <TourOverlay key={TOUR[index].id} step={TOUR[index]} index={index} onNext={next} onSkip={finish} />
      )}
    </TourContext.Provider>
  )
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** Room left around the spotlight, so it does not sit on the button's edge. */
const HOLE_PAD = 6
const GUTTER = 16

/** The first match that is actually on screen: the tab bar's copy of a menu
 *  link is in the document on a desktop too, just not shown. */
function findTarget(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const box = el.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) return el
  }
  return null
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}

function TourOverlay({
  step,
  index,
  onNext,
  onSkip,
}: {
  step: TourStep
  index: number
  onNext: () => void
  onSkip: () => void
}) {
  const t = useT()
  const { pathname } = useLocation()
  const here = !step.where || step.where.test(pathname)
  const [box, setBox] = useState<Box | null>(null)
  const scrolled = useRef(false)

  // Followed every frame rather than on scroll and resize alone: the screens
  // move under it by themselves too (a score card arriving pushes the buttons
  // down), and a spotlight left behind points at the wrong thing.
  useEffect(() => {
    if (!step.target || !here) return
    const selector = step.target
    let frame = 0
    const follow = () => {
      const el = findTarget(selector)
      if (el && !scrolled.current) {
        scrolled.current = true
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      const r = el?.getBoundingClientRect()
      const nextBox = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      setBox((prev) => (sameBox(prev, nextBox) ? prev : nextBox))
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [step.target, here])

  // Pressing the thing pointed at moves on, after the press has done its own
  // work: listened for on the document, so a button React re-creates is still
  // the button.
  useEffect(() => {
    if (!step.target || step.advance === 'next') return
    const selector = step.target
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(selector)) window.setTimeout(onNext, 0)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [step.target, step.advance, onNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  const counter = t('tour.counter', index + 1, TOUR.length)
  // Read while rendering: the box is followed every frame, so this is as fresh.
  const other = step.otherwise && document.querySelector(step.otherwise.when) ? step.otherwise : null
  const title = other ? other.title : step.title
  const body = other ? other.body : step.body
  const shown = here && box !== null && box.width > 0

  // Somewhere else, or the target not there yet: say where to go or what is
  // being waited for, and leave the screen alone.
  if (step.target && !shown) {
    return (
      <div className="tour-pill" role="status" aria-live="polite" data-testid="tour-waiting">
        <Mascot mood="think" size={30} />
        <span className="tour-pill-text">{t(step.waiting ?? 'tour.practice.waiting')}</span>
        <button type="button" className="btn btn-ghost tour-pill-skip" onClick={onSkip}>
          {t('tour.skip')}
        </button>
      </div>
    )
  }

  const hole: Box | null = shown
    ? {
        top: box.top - HOLE_PAD,
        left: box.left - HOLE_PAD,
        width: box.width + HOLE_PAD * 2,
        height: box.height + HOLE_PAD * 2,
      }
    : null

  return (
    <div className="tour" data-step={step.id}>
      {hole ? (
        <>
          <div className="tour-hole" style={hole} aria-hidden="true" />
          {/* Only on a step that is done by pressing the thing: four panes
              round the hole, so that one control is all that answers. */}
          {step.advance === 'press' && <Blockers hole={hole} />}
        </>
      ) : (
        <div className="tour-backdrop" aria-hidden="true" />
      )}

      <div
        className={`tour-bubble ${hole ? '' : 'tour-bubble-center'}`}
        style={hole ? placeBubble(hole) : undefined}
        role="dialog"
        aria-modal={hole ? undefined : true}
        aria-labelledby="tour-title"
      >
        <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
          <span className="tour-face" aria-hidden="true">
            <Mascot mood={step.mood ?? 'idle'} size={hole ? 44 : 64} />
          </span>
          <div className="stack gap-1" style={{ minWidth: 0 }}>
            <div className="tour-counter">{counter}</div>
            <div id="tour-title" className="tour-title">
              {t(title)}
            </div>
            <p className="tour-body">{t(body)}</p>
          </div>
        </div>
        <div className="row between gap-2 wrap" style={{ alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost tour-skip" onClick={onSkip}>
            {step.id === 'done' ? t('tour.close') : t('tour.skip')}
          </button>
          {step.advance === 'press' ? (
            <span className="tour-do">{t('tour.pressIt')}</span>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onNext} autoFocus>
              {step.id === 'welcome' ? t('tour.begin') : step.id === 'done' ? t('tour.finish') : t('tour.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Blockers({ hole }: { hole: Box }) {
  const right = hole.left + hole.width
  const bottom = hole.top + hole.height
  const panes: CSSProperties[] = [
    { top: 0, left: 0, right: 0, height: Math.max(0, hole.top) },
    { top: bottom, left: 0, right: 0, bottom: 0 },
    { top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height },
    { top: hole.top, left: right, right: 0, height: hole.height },
  ]
  return (
    <>
      {panes.map((style, i) => (
        <div key={i} className="tour-blocker" style={style} aria-hidden="true" />
      ))}
    </>
  )
}

/** Below the spotlight when there is more room there, above it otherwise, and
 *  never off the side of a phone. */
function placeBubble(hole: Box): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(360, vw - GUTTER * 2)
  const centre = hole.left + hole.width / 2
  const left = Math.min(Math.max(centre - width / 2, GUTTER), vw - width - GUTTER)
  const below = vh - (hole.top + hole.height)
  const above = hole.top
  // Beside a tall thing on a wide screen (the side menu), rather than under it.
  if (below < 220 && above < 220 && vw - (hole.left + hole.width) > width + GUTTER * 2) {
    return {
      width,
      left: hole.left + hole.width + GUTTER,
      top: Math.min(Math.max(hole.top, GUTTER), vh - 260),
    }
  }
  return below >= above
    ? { width, left, top: hole.top + hole.height + 12 }
    : { width, left, bottom: vh - hole.top + 12 }
}
