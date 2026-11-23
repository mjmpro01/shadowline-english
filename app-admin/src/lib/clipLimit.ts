/**
 * How long a clip may be, and which of a batch break that. Only a clip that
 * is going up has to be short enough: one left behind is not a reason to
 * refuse the batch.
 */

/** Seconds of slack for floating-point cut boundaries. */
const SLACK = 0.01

export function isOverLong(segment: { start: number; end: number }, max: number): boolean {
  return segment.end - segment.start > max + SLACK
}

/** How many of the clips selected to publish are longer than `max`. */
export function overLongSelected(
  segments: { start: number; end: number }[],
  selected: (index: number) => boolean,
  max: number,
): number {
  return segments.filter((s, i) => selected(i) && isOverLong(s, max)).length
}
