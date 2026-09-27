/** A picture for what a clip is about, from the categories an admin gave it.
 *  Emoji rather than drawn icons: every learner's device has them in colour,
 *  and a child can tell a coffee cup from a microphone before they can read. */
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
