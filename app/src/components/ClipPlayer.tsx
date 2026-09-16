/**
 * Plays the clip being shadowed — as video when a cut of the original exists,
 * and as audio otherwise.
 *
 * One element, not both: a clip always has audio, so rendering the video
 * alongside it would play the line twice, a beat apart. Screens keep a single
 * `HTMLMediaElement` ref and call `.play()` on it without caring which arrived,
 * because that is the only difference between the two they have to know about.
 *
 * `attach` is a callback rather than a ref object for two reasons: a ref to a
 * video element is not a ref to a media element as far as the types are
 * concerned, and the assignment belongs to the screen that owns the ref.
 */
export function ClipPlayer({
  attach,
  videoUrl,
  audioUrl,
}: {
  attach: (element: HTMLMediaElement | null) => void
  videoUrl: string | null
  audioUrl: string | null
}) {
  if (videoUrl) {
    return (
      <video
        ref={attach}
        className="clip-video"
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
      />
    )
  }
  if (audioUrl) return <audio ref={attach} src={audioUrl} />
  return null
}
