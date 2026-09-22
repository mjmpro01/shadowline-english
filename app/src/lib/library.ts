/**
 * The shortest query worth sending.
 *
 * One letter matches most of the library and answers nothing. Mirrors
 * store.MinSearch on the server, which is what actually enforces it — this copy
 * is so the screen can say why it is not searching instead of showing a spinner
 * for an answer that was always going to be empty.
 */
export const MIN_SEARCH = 2

export function searchIsWorthRunning(query: string): boolean {
  return query.trim().length >= MIN_SEARCH
}
