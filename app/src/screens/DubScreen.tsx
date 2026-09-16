import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LoadFailure, Loading } from '../components/LoadState'
import { NoSuchClip } from '../components/NoSuchClip'
import { SegmentedControl } from '../components/SegmentedControl'
import { clock } from '../lib/time'
import { urlOf, useClipAudio, useTakeAudio } from '../lib/useAudioUrl'
import { useApp } from '../store/context'

export function DubScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const { data, state, statsFor } = useApp()
  const audioRef = useRef<HTMLAudioElement>(null)
  /** Live playhead, captured when swapping voices — `position` only ticks a few times a second. */
  const resumeAt = useRef(0)
  /** Set while a swap is in flight: the reload resets currentTime to 0 and
      fires timeupdate, which would otherwise wipe the position we just saved. */
  const swapping = useRef(false)

  const [source, setSource] = useState<'mine' | 'original'>('mine')
  const [takeId, setTakeId] = useState<string | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)

  const video = data.videos.find((v) => v.id === videoId)
  const stats = statsFor(videoId ?? '')
  const take = stats.takes.find((t) => t.id === takeId) ?? stats.takes[stats.takes.length - 1]
  const myVoiceUrl = urlOf(useTakeAudio(take?.hasAudio ? take.id : null))
  const originalUrl = urlOf(useClipAudio(video?.id ?? null))

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!video) return <NoSuchClip />

  const activeUrl = source === 'mine' ? myVoiceUrl : originalUrl
  const canPlay = !!activeUrl

  const rewind = () => {
    audioRef.current?.pause()
    resumeAt.current = 0
    setPosition(0)
    setPlaying(false)
  }

  /** Both voices share one timeline, so switching keeps your place in the line. */
  const selectSource = (value: 'mine' | 'original') => {
    if (value === source) return
    resumeAt.current = audioRef.current?.currentTime ?? position
    swapping.current = true
    setSource(value)
  }

  const selectTake = (id: string) => {
    setTakeId(id)
    rewind()
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      void el.play()
      setPlaying(true)
    }
  }

  const seek = (value: number) => {
    resumeAt.current = value
    setPosition(value)
    if (audioRef.current) audioRef.current.currentTime = value
  }

  return (
    <div className="stack gap-4">
      <button
        type="button"
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate(`/library/${video.id}`)}
      >
        <Icon name="chevron-left" />
        Analysis
      </button>

      <div className="stack gap-4" style={{ maxWidth: 400, margin: '0 auto', width: '100%' }}>
        <h3 style={{ margin: 0 }}>{video.title}</h3>

        <div className="thumb" style={{ borderRadius: 'var(--radius-lg)' }}>
          <span className="tag tag-neutral" style={{ position: 'absolute', top: 10, left: 10 }}>
            original audio muted
          </span>
          <Icon name="play" size={32} />
        </div>

        <SegmentedControl
          name="audiosrc"
          value={source}
          onChange={selectSource}
          className="seg-audio"
          options={[
            {
              value: 'mine',
              label: (
                <>
                  <Icon name="mic" size={14} />
                  My voice
                </>
              ),
            },
            {
              value: 'original',
              label: (
                <>
                  <Icon name="volume" size={14} />
                  Original
                </>
              ),
            },
          ]}
        />

        <div className="stack gap-2">
          <div className="row gap-3">
            <button
              type="button"
              className="btn btn-primary btn-icon"
              onClick={togglePlay}
              disabled={!canPlay}
              title={canPlay ? 'Play' : source === 'mine' ? 'This take has no recording' : 'No original audio attached'}
            >
              <Icon name={playing ? 'square' : 'play'} size={14} />
            </button>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={position}
              disabled={!canPlay}
              onChange={(e) => seek(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--color-accent)' }}
              aria-label="Playback position"
            />
          </div>
          <div className="row between mono" style={{ fontSize: 12, opacity: 0.65 }}>
            <span>{clock(position)}</span>
            <span>{canPlay ? clock(duration) : clock(video.durationSeconds)}</span>
          </div>
          {source === 'original' && !originalUrl && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              No original audio for this clip yet — attach it on the Practice screen to compare by ear.
            </div>
          )}
        </div>

        {activeUrl && (
          <audio
            ref={audioRef}
            src={activeUrl}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration)
              // Swapping voices reloads the element; drop back onto the shared timeline.
              e.currentTarget.currentTime = Math.min(resumeAt.current, e.currentTarget.duration)
              swapping.current = false
              if (playing) void e.currentTarget.play()
            }}
            onTimeUpdate={(e) => {
              if (swapping.current) return
              resumeAt.current = e.currentTarget.currentTime
              setPosition(e.currentTarget.currentTime)
            }}
            onEnded={() => setPlaying(false)}
          />
        )}

        <div className="stack gap-2">
          <div className="card-kicker">Takes</div>
          <div className="row gap-2" style={{ overflowX: 'auto' }}>
            {stats.takes.map((t, i) => (
              <button
                type="button"
                key={t.id}
                className={`btn ${t.id === take?.id ? 'btn-primary' : 'btn-secondary'} mono`}
                style={{ flexShrink: 0 }}
                onClick={() => selectTake(t.id)}
              >
                Take {i + 1}
              </button>
            ))}
          </div>
          {take && !take.hasAudio && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>This take has no recording stored.</div>
          )}
        </div>
      </div>
    </div>
  )
}
