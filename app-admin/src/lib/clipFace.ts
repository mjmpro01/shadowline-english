/**
 * How the learner app draws a clip that has no still of its own: a tint the
 * clip keeps for good, and a picture for its topic.
 *
 * Copied from ../app/src/lib/score.ts (tintOf) and ../app/src/lib/topics.ts
 * (iconFor), so the console's preview is the card a learner sees. Keep the
 * three in step: a preview that drifts from the app is a preview of nothing.
 */

function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h += str.charCodeAt(i) * (i + 7)
  return h
}

const TILE_TINTS = [
  'linear-gradient(155deg, #f7c948 0%, #e08a1e 100%)',
  'linear-gradient(155deg, #8fd46b 0%, #3f8f47 100%)',
  'linear-gradient(155deg, #6cc6f0 0%, #2f73c2 100%)',
  'linear-gradient(155deg, #f59aa8 0%, #d2476a 100%)',
  'linear-gradient(155deg, #b69cf5 0%, #6c4fc4 100%)',
  'linear-gradient(155deg, #ffae73 0%, #de5b2b 100%)',
]

export function tintOf(id: string): string {
  return TILE_TINTS[hashStr(id) % TILE_TINTS.length]
}

const TOPIC_ICONS: [RegExp, string][] = [
  [/interview|job|work|business|office/i, '💼'],
  [/chat show|talk show|show|tv/i, '📺'],
  [/speech|lecture|talk|ted|class/i, '🎤'],
  [/film|movie|cinema|series|friends/i, '🎬'],
  [/song|music/i, '🎵'],
  [/travel|trip|airport|hotel/i, '✈️'],
  [/food|cafe|coffee|restaurant/i, '☕'],
  [/daily|everyday|life|home/i, '🏡'],
  [/news/i, '📰'],
  [/game|sport/i, '⚽'],
  [/ielts|toeic|exam|test/i, '📝'],
]

export function iconFor(categories: string[] | undefined): string {
  for (const category of categories ?? []) {
    for (const [pattern, icon] of TOPIC_ICONS) if (pattern.test(category)) return icon
  }
  return '💬'
}
