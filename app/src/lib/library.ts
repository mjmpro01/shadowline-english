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

/**
 * The page numbers a pager shows: the first, the last, the current one and its
 * neighbours, with `null` where a run is left out. Seven slots at most, so the
 * row fits a phone whatever the page count.
 *
 *   pageNumbers(1, 3)   → 1 2 3
 *   pageNumbers(5, 12)  → 1 … 4 5 6 … 12
 *   pageNumbers(2, 12)  → 1 2 3 4 5 … 12
 */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const current = Math.min(Math.max(page, 1), pages)
  // Near either end the window slides to keep seven slots, rather than
  // leaving a gap that hides a single number.
  const start = Math.max(2, Math.min(current - 1, pages - 4))
  const end = Math.min(pages - 1, Math.max(current + 1, 5))
  const out: (number | null)[] = [1]
  if (start > 2) out.push(null)
  for (let n = start; n <= end; n++) out.push(n)
  if (end < pages - 1) out.push(null)
  out.push(pages)
  return out
}
