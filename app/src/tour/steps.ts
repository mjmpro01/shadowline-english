import type { Mood } from '../components/Mascot'
import type { MessageKey } from '../i18n/en'

/**
 * One popup of the guided tour.
 *
 * The tour walks a new learner through their first line by having them do it:
 * most steps point at a real control and wait for it to be pressed, rather than
 * describing it. What it points at is found by `data-tour` attributes on the
 * screens, so moving a button does not break the tour, and renaming one does
 * not either — the popups name nothing the screen does not show.
 */
export interface TourStep {
  id: string
  /** What to point at. Several selectors are tried in order and the first one
   *  on screen wins (the menu is a side panel on a desktop and a tab bar on a
   *  phone). None: a card in the middle of the screen. */
  target?: string
  /** Where the step happens. Anywhere else the tour waits, and says where to go. */
  where?: RegExp
  title: MessageKey
  body: MessageKey
  /**
   * How the learner moves on.
   *
   * `press`: by pressing the thing pointed at, which is the point of the step —
   * everything else on screen is held off until they do. `next`: with the
   * popup's own button, the screen staying usable around it. `either`: both.
   */
  advance: 'press' | 'next' | 'either'
  /** Said instead of `body` when this matches: the same place on screen can
   *  hold a score or the reason there is none. */
  otherwise?: { when: string; title: MessageKey; body: MessageKey }
  /** Said while the target is not on screen yet — a score still coming. */
  waiting?: MessageKey
  mood?: Mood
}

const PRACTICE = /\/practice$/

export const TOUR: TourStep[] = [
  { id: 'welcome', title: 'tour.welcome.title', body: 'tour.welcome.body', advance: 'next', mood: 'happy' },
  {
    id: 'start',
    // The first-steps button on a new learner's dashboard; on a replay, when
    // that card is gone, the first Practice button on the page — a featured
    // clip, a library card or an episode's line.
    target: '[data-tour="first-line"], [data-tour="practice-clip"]',
    where: /^\/(dashboard|library)/,
    title: 'tour.start.title',
    body: 'tour.start.body',
    advance: 'press',
    waiting: 'tour.start.waiting',
  },
  {
    id: 'listen',
    target: '[data-tour="listen"]',
    where: PRACTICE,
    title: 'tour.listen.title',
    body: 'tour.listen.body',
    advance: 'either',
    waiting: 'tour.practice.waiting',
  },
  {
    id: 'caption',
    target: '[data-tour="caption"]',
    where: PRACTICE,
    title: 'tour.caption.title',
    body: 'tour.caption.body',
    advance: 'next',
    waiting: 'tour.practice.waiting',
    mood: 'think',
  },
  {
    id: 'record',
    target: '[data-tour="record"]',
    where: PRACTICE,
    title: 'tour.record.title',
    body: 'tour.record.body',
    advance: 'press',
    waiting: 'tour.practice.waiting',
  },
  {
    id: 'wave',
    target: '[data-tour="wave"]',
    where: PRACTICE,
    title: 'tour.wave.title',
    body: 'tour.wave.body',
    advance: 'next',
    waiting: 'tour.practice.waiting',
  },
  {
    id: 'result',
    target: '[data-tour="result"]',
    where: PRACTICE,
    title: 'tour.result.title',
    body: 'tour.result.body',
    // A clip with no original sound keeps the take and cannot score it.
    otherwise: { when: '[data-tour="result"][data-scored="false"]', title: 'tour.unscored.title', body: 'tour.unscored.body' },
    advance: 'next',
    waiting: 'tour.result.waiting',
    mood: 'cheer',
  },
  {
    id: 'after',
    target: '[data-tour="after"]',
    where: PRACTICE,
    title: 'tour.after.title',
    body: 'tour.after.body',
    advance: 'next',
    waiting: 'tour.practice.waiting',
  },
  {
    id: 'vocabulary',
    target: '[data-tour="nav/vocabulary"]',
    title: 'tour.vocabulary.title',
    body: 'tour.vocabulary.body',
    advance: 'next',
  },
  { id: 'done', title: 'tour.done.title', body: 'tour.done.body', advance: 'next', mood: 'cheer' },
]
