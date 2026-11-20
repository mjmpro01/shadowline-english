/** The emblem each achievement track wears, on its card and its celebration. */
const ICONS: Record<string, string> = {
  takes: '🎙️',
  score: '🌟',
  streak: '🔥',
  goal: '🎯',
  dictation: '✍️',
  perfect: '💯',
  words: '📚',
  dialogue: '💬',
  tutor: '🧑‍🏫',
  medal: '🏅',
}

export function achievementIcon(track: string): string {
  return ICONS[track] ?? '🏆'
}

/** The next target on a ladder the learner has not reached, or null at the top. */
export function nextTarget(count: number, targets: number[]): number | null {
  return targets.find((target) => target > count) ?? null
}
