import { createContext, useContext } from 'react'

export interface Tour {
  /** Starts the tour from its first popup. */
  start: () => void
  running: boolean
}

export const TourContext = createContext<Tour>({ start: () => undefined, running: false })

export function useTour(): Tour {
  return useContext(TourContext)
}

const STORAGE_KEY = 'shadowline.tour'

/** Whether this browser has finished or skipped the tour. Per device, like the
 *  theme: a phone that has seen it does not need to see it again. */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'done'
  } catch {
    return false
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'done')
  } catch {
    // A private window can refuse. The tour then comes back next visit, which
    // is a nuisance rather than a failure; the in-memory flag stops it this one.
  }
}

const STEP_KEY = 'shadowline.tour.step'

/** The step a tour in progress had reached in this tab, so a reload or a typed
 *  address carries on rather than silently ending it. */
export function savedTourStep(): number | null {
  try {
    const saved = sessionStorage.getItem(STEP_KEY)
    return saved === null ? null : Number(saved)
  } catch {
    return null
  }
}

export function saveTourStep(step: number | null): void {
  try {
    if (step === null) sessionStorage.removeItem(STEP_KEY)
    else sessionStorage.setItem(STEP_KEY, String(step))
  } catch {
    // Without it the tour still runs; it just ends with the page.
  }
}
