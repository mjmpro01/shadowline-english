/**
 * The Shadowing Hero: the knight from the app's crest, as the tutor's face and
 * the one who cheers.
 *
 * Cut out of public/login/crest.png, so it is the same character as the login
 * screen and the home-screen icon rather than a second mascot beside them. Two
 * pictures: the whole knight for anywhere it has room, and the helmet alone for
 * a chat avatar, where the whole figure would be a smudge. Its mood is motion,
 * not a different drawing — it hops when it cheers and sways while it thinks.
 */
export type Mood = 'idle' | 'happy' | 'cheer' | 'think'

export function Mascot({
  mood = 'idle',
  size = 48,
  title,
  whole = false,
}: {
  mood?: Mood
  size?: number
  title?: string
  /** The whole knight, sword and cape. Only where it has real room: in a
   *  circle or a chat line the helmet alone is the face people recognise. */
  whole?: boolean
}) {
  const src = whole ? '/mascot/hero.webp' : '/mascot/hero-head.webp'
  return (
    <img
      className={`mascot mascot-${mood}`}
      src={src}
      width={size}
      height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      decoding="async"
    />
  )
}
