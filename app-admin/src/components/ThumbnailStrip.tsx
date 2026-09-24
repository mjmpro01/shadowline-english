/**
 * Frames from the upload, laid along the same time axis as the waveform below.
 *
 * Cutting by ear alone means scrubbing blind for the moment a speaker changes.
 * The strip puts that on screen: slot i covers i/count of the recording, so it
 * lines up with the wave without either having to know about the other.
 */
export function ThumbnailStrip({
  frames,
  duration,
  playhead,
  onScrub,
}: {
  /** One entry per slot, null until that frame has been taken. */
  frames: (string | null)[]
  duration: number
  playhead: number | null
  onScrub: (seconds: number) => void
}) {
  const scrubTo = (clientX: number, box: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width))
    onScrub(ratio * duration)
  }

  return (
    <div
      className="filmstrip"
      onClick={(event) => scrubTo(event.clientX, event.currentTarget.getBoundingClientRect())}
    >
      {frames.map((src, index) => (
        <div className="filmstrip-cell" key={index}>
          {src && <img src={src} alt="" draggable={false} />}
        </div>
      ))}
      {playhead !== null && duration > 0 && (
        <div className="filmstrip-playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
      )}
    </div>
  )
}
