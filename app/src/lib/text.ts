/** Caption words are tapped with their punctuation attached; vocabulary is keyed on the bare word. */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z' ]/g, '')
    .trim()
}
