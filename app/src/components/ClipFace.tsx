import { tintOf } from '../lib/score'

/** How much of the line the tile shows. Enough to tell two clips apart at a
 *  glance, short enough to stay large. */
const WORDS = 7

/**
 * What fills a clip's frame.
 *
 * The still when the cutter has made one. When it has not — every clip cut
 * from audio, and every one whose cut is still queued — a card used to be a
 * grey rectangle with a play triangle on it, which meant a library of them was
 * a grid of identical grey rectangles: nothing to read, nothing to aim at, and
 * the only way to tell two clips apart was the small print underneath.
 *
 * So the empty frame carries what the picture would have carried instead: the
 * opening of the line, set large, on a tint the clip keeps for good. The tint
 * is what makes the grid scannable and the words are what make it useful, and
 * neither costs a byte of storage or a second of anybody's worker.
 */
export function ClipFace({ id, posterUrl, line }: { id: string; posterUrl: string; line: string }) {
  if (posterUrl) {
    return <img className="thumb-poster" src={posterUrl} alt="" loading="lazy" />
  }

  // The tint always. The words only when nothing else on the screen is already
  // saying them: on the practice screen the line sits under the frame with
  // every word tappable, and printing it again above would be the same sentence
  // twice, the smaller copy being the useful one. Those callers pass no line.
  const words = line.trim().split(/\s+/).filter(Boolean)

  return (
    <span className="thumb-face" style={{ background: tintOf(id) }}>
      {words.length > 0 && (
        <span className="thumb-face-line">
          {words.slice(0, WORDS).join(' ')}
          {words.length > WORDS ? '…' : ''}
        </span>
      )}
    </span>
  )
}
