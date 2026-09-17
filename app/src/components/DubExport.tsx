import type { DubState } from '../lib/useDub'
import { Icon } from './Icon'

/**
 * The export control: a button, then a wait, then the file.
 *
 * One component because both screens show it — the Practice column, where a
 * learner has just recorded, and Dub Review, over whichever take they are
 * reviewing. Three states and no fourth: there is no failure to show, because a
 * dub that could not be made goes back to offering the button.
 */
export function DubExport({
  state,
  filename,
  canDub,
  hasRecording,
  label,
}: {
  state: DubState
  /** What the saved file is called, so it is not `download.mp4` in a folder of
   *  other people's downloads. */
  filename: string
  /** Whether the clip has a picture to dub onto at all. */
  canDub: boolean
  hasRecording: boolean
  label: string
}) {
  const { dub, error, request } = state

  if (dub?.status === 'ready' && dub.url) {
    return (
      <div className="stack gap-2">
        <a className="btn btn-primary btn-block" href={dub.url} download={`${filename}.mp4`}>
          <Icon name="download" size={14} />
          Download
        </a>
        <a className="btn btn-secondary btn-block" href={dub.url} target="_blank" rel="noreferrer">
          Open
        </a>
      </div>
    )
  }

  if (dub?.status === 'pending') {
    return (
      <div className="card-meta" role="status" style={{ textAlign: 'center' }}>
        Putting your voice on the picture…
      </div>
    )
  }

  return (
    <div className="stack gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={!hasRecording || !canDub}
        title={
          !hasRecording
            ? 'Record a take first'
            : canDub
              ? 'Make a video of this take over the original'
              : 'This clip has no video to dub onto'
        }
        onClick={() => void request()}
      >
        <Icon name="download" size={14} />
        {label}
      </button>
      {error && (
        <div className="card-meta" style={{ color: 'var(--score-attention)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
