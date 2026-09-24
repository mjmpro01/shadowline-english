import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Column } from '../lib/audio/decode'
import type { Segment } from '../lib/audio/segment'

const HEIGHT = 120
const HANDLE_WIDTH = 9

/**
 * Narrower than this, a clip cannot be grabbed — the two handles would overlap
 * — so it is drawn as a boundary tick instead of an interactive block. Without
 * this an hour of speech proposes hundreds of clips, each a couple of pixels
 * wide, and their borders alone paint the whole editor one solid colour.
 */
const MIN_INTERACTIVE_PX = 16
/** Narrower still, and the number on the block has nowhere to sit. */
const MIN_LABEL_PX = 34
/** Ticks closer together than this cannot be told apart, so only the first of
 *  a crowd is drawn. The result reads as dense rather than as a filled bar. */
const MIN_TICK_GAP_PX = 9
/** How far a tick reaches in from each edge, as a share of the height. Ticks
 *  are marks in the margins rather than full-height bars: at this density a bar
 *  per cut is a picket fence, and the wave behind it is what you are reading. */
const TICK_REACH = 15

/**
 * The waveform with the proposed cuts drawn over it. Boundaries are dragged
 * directly: the proposal is a starting point, and judging where a line really
 * begins is something only the person listening can do.
 */
export function WaveformEditor({
  peaks,
  duration,
  segments,
  selected,
  playhead,
  onSelect,
  onChange,
  onScrub,
}: {
  peaks: Column[]
  duration: number
  segments: Segment[]
  selected: number | null
  playhead: number | null
  onSelect: (index: number) => void
  onChange: (segments: Segment[]) => void
  onScrub: (seconds: number) => void
}) {
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; edge: 'start' | 'end' } | null>(null)
  // How wide the editor is on screen, which decides what can be drawn at all.
  // Measured rather than assumed: the same file is unreadable in a sidebar and
  // workable full-width.
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    // ResizeObserver reports the initial size on observe, so there is no
    // separate first measurement to take.
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const timeAt = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return 0
    return Math.max(0, Math.min(duration, ((clientX - box.left) / box.width) * duration))
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const active = drag.current
    if (!active) return
    const time = timeAt(event.clientX)
    const next = segments.map((segment) => ({ ...segment }))
    const target = next[active.index]
    // Boundaries may not cross their neighbours, or each other.
    if (active.edge === 'start') {
      const floor = next[active.index - 1]?.end ?? 0
      target.start = Math.max(floor, Math.min(time, target.end - 0.2))
    } else {
      const ceiling = next[active.index + 1]?.start ?? duration
      target.end = Math.min(ceiling, Math.max(time, target.start + 0.2))
    }
    onChange(next)
  }

  const endDrag = (event: ReactPointerEvent) => {
    if (!drag.current) return
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const pct = (seconds: number) => `${(seconds / duration) * 100}%`
  const pixelsPerSecond = duration > 0 ? width / duration : 0
  const widthOf = (segment: Segment) => (segment.end - segment.start) * pixelsPerSecond

  // The selected clip is always drawn as a block, however narrow: picking it
  // from the list below has to show you where in the recording it sits.
  const blocks = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment, index }) => index === selected || widthOf(segment) >= MIN_INTERACTIVE_PX)

  const ticks: number[] = []
  let lastTickPx = -Infinity
  for (const segment of segments) {
    const px = segment.start * pixelsPerSecond
    if (px - lastTickPx >= MIN_TICK_GAP_PX) {
      ticks.push(segment.start)
      lastTickPx = px
    }
  }

  // Seconds map onto the waveform's own x axis, so ticks can share its viewBox
  // instead of needing a second overlay to keep in step with it.
  const columns = peaks.length
  const xOf = (seconds: number) => (duration > 0 ? (seconds / duration) * columns : 0)

  return (
    <div
      ref={frame}
      className="waveform"
      style={{ height: HEIGHT }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        if (!drag.current) onScrub(timeAt(event.clientX))
      }}
    >
      <svg viewBox={`0 0 ${columns} 100`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        {/* Two paths rather than one line per column: a long file is a thousand
            columns, and a thousand elements is a thousand things to lay out. */}
        <path
          d={envelope(peaks, (c) => 50 - c.max * 48, (c) => 50 - c.min * 48)}
          fill="var(--color-neutral-700)"
        />
        <path
          d={envelope(peaks, (c) => 50 - c.rms * 44, (c) => 50 + c.rms * 44)}
          fill="var(--color-neutral-300)"
        />
        {ticks.map((seconds) => (
          <g key={seconds} stroke="var(--color-accent-400)" strokeWidth="1" vectorEffect="non-scaling-stroke">
            <line x1={xOf(seconds)} x2={xOf(seconds)} y1={0} y2={TICK_REACH} />
            <line x1={xOf(seconds)} x2={xOf(seconds)} y1={100 - TICK_REACH} y2={100} />
          </g>
        ))}
      </svg>

      {blocks.map(({ segment, index }) => (
        <div
          key={index}
          className="waveform-segment"
          data-selected={index === selected}
          style={{ left: pct(segment.start), width: pct(segment.end - segment.start) }}
          onPointerDown={() => onSelect(index)}
        >
          {widthOf(segment) >= MIN_LABEL_PX && <span className="waveform-index mono">{index + 1}</span>}
          {widthOf(segment) >= MIN_INTERACTIVE_PX &&
            (['start', 'end'] as const).map((edge) => (
              <span
                key={edge}
                className="waveform-handle"
                style={{ [edge === 'start' ? 'left' : 'right']: -HANDLE_WIDTH / 2, width: HANDLE_WIDTH }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drag.current = { index, edge }
                  onSelect(index)
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                aria-label={`Move ${edge} of clip ${index + 1}`}
              />
            ))}
        </div>
      ))}

      {playhead !== null && <div className="waveform-playhead" style={{ left: pct(playhead) }} />}
    </div>
  )
}

/**
 * One closed path tracing `top` left to right and `bottom` back again.
 *
 * Drawing the wave as a filled shape rather than a column of lines keeps the
 * element count flat: the file decides how many samples there are, not how many
 * nodes the browser has to lay out.
 */
function envelope(peaks: Column[], top: (column: Column) => number, bottom: (column: Column) => number): string {
  if (peaks.length === 0) return ''
  const parts: string[] = []
  peaks.forEach((column, i) => parts.push(`${i === 0 ? 'M' : 'L'}${i + 0.5},${top(column)}`))
  for (let i = peaks.length - 1; i >= 0; i--) parts.push(`L${i + 0.5},${bottom(peaks[i])}`)
  parts.push('Z')
  return parts.join(' ')
}
