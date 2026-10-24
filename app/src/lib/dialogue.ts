import { align, tokens, type Mark } from './dictation'
import type { DialogueLine, DialogueSummary, LinePasses } from '../repository'

/**
 * Reading a dialogue aloud until it is known: what was heard of a line, and
 * how far a learner is.
 */

export interface Reading {
  /** The line's words, each heard or not, and anything said that it has not. */
  marks: Mark[]
  heard: number
  total: number
}

/** What the browser heard against the line it was meant to be. */
export function reading(said: string, line: string): Reading {
  const marks = align(said, line)
  return {
    marks,
    heard: marks.filter((m) => m.kind === 'right').length,
    total: tokens(line).length,
  }
}

/** Whether a line has been read aloud enough times to count as known. */
export function known(passes: LinePasses | undefined, goal: number): boolean {
  return (passes?.passes ?? 0) >= goal
}

/** The topics in a list of dialogues, each once, in the order they first come. */
export function topicsOf(dialogues: DialogueSummary[]): string[] {
  return [...new Set(dialogues.map((d) => d.topic).filter((t) => t !== ''))]
}

/** How long to leave for a learner to say their own line, when the rest of
 *  the dialogue is being played for them: about as long as saying it slowly. */
export function turnMillis(line: string): number {
  return 1200 + tokens(line).length * 450
}

/** The two people in a dialogue, by who speaks first as each. */
export function speakers(lines: DialogueLine[]): { A: string; B: string } {
  return {
    A: lines.find((l) => l.speaker === 'A')?.name || 'A',
    B: lines.find((l) => l.speaker === 'B')?.name || 'B',
  }
}
