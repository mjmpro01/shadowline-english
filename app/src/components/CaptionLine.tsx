import { captionWords } from '../lib/text'

/**
 * A clip's line, word by word.
 *
 * Two things are drawn on the same words, which is why they are drawn once:
 * every word is a button for adding it to Vocabulary, and every word carries
 * whether the transcriber heard it in the take. Rendering the line twice — once
 * to tap, once to mark — would put the same sentence on screen twice and make
 * the learner read it twice to find the one word they dropped.
 *
 * `heard` is aligned to this line's words by position, and the caller is the
 * one that knows the offset: a take covers the whole clip, and a clip can hold
 * more than one caption.
 */
export function CaptionLine({
  text,
  heard,
  isAdded,
  onTap,
}: {
  text: string
  /** Per word: true heard, false not heard, undefined not checked. */
  heard?: (boolean | undefined)[]
  isAdded?: (word: string) => boolean
  onTap?: (word: string) => void
}) {
  const words = captionWords(text)
  return (
    <>
      {words.map((word, i) => {
        const marks = {
          'data-added': isAdded?.(word) ?? false,
          // Only ever `false` reaches the attribute. A word the check did not
          // cover must look no different from one it did cover and heard —
          // there is nothing to tell the learner about it.
          'data-unheard': heard?.[i] === false,
        }
        return onTap ? (
          <button
            type="button"
            className="caption-word"
            key={`${word}-${i}`}
            onClick={() => onTap(word)}
            {...marks}
          >
            {word}
          </button>
        ) : (
          <span className="caption-word caption-word-flat" key={`${word}-${i}`} {...marks}>
            {word}
          </span>
        )
      })}
    </>
  )
}
