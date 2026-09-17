/** Caption words are tapped with their punctuation attached; vocabulary is keyed on the bare word. */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z' ]/g, '')
    .trim()
}

/**
 * What a card shows where its meaning should be, before one has arrived.
 *
 * A word is looked up once for the whole app, so a card collected while that
 * was still running has nothing to show for a second or two. A deployment with
 * no API key has nothing to show at all, and the card cannot tell the two
 * apart — so this says only what is certainly true. The popup, which does know,
 * says which.
 *
 * Either way it beats a blank line under the word.
 */
export function meaningOrWait(meaning: string): string {
  return meaning || 'Meaning not looked up yet.'
}
