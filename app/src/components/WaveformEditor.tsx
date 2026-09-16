import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Segment } from '../lib/audio/segment'

const HEIGHT = 120
const HANDLE_WIDTH = 9

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
  peaks: { min: number; max: number }[]
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
      <svg viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        {peaks.map((peak, i) => (
          <line
            key={i}
            x1={i + 0.5}
            x2={i + 0.5}
            y1={50 - peak.max * 48}
            y2={50 - peak.min * 48}
            stroke="var(--color-neutral-500)"
            strokeWidth="1"
          />
        ))}
      </svg>

      {segments.map((segment, index) => (
        <div
          key={index}
          className="waveform-segment"
          data-selected={index === selected}
          style={{ left: pct(segment.start), width: pct(segment.end - segment.start) }}
          onPointerDown={() => onSelect(index)}
        >
          <span className="waveform-index mono">{index + 1}</span>
          {(['start', 'end'] as const).map((edge) => (
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
