import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SegmentedControl } from '../components/SegmentedControl'
import { useBlobUrl } from '../lib/useAudioUrl'
import { useApp } from '../store/context'

function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function DubScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const { data, statsFor } = useApp()
  const audioRef = useRef<HTMLAudioElement>(null)

  const [source, setSource] = useState<'mine' | 'original'>('mine')
  const [takeId, setTakeId] = useState<string | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)

  const video = data.videos.find((v) => v.id === videoId)
  const stats = statsFor(videoId ?? '')
  const take = stats.takes.find((t) => t.id === takeId) ?? stats.takes[stats.takes.length - 1]
  const myVoiceUrl = useBlobUrl(take?.audioKey ?? null)

  if (!video) return <Navigate to="/library" replace />

  const rewind = () => {
    audioRef.current?.pause()
    setPosition(0)
    setPlaying(false)
  }

  const selectTake = (id: string) => {
    setTakeId(id)
    rewind()
  }

  const selectSource = (value: 'mine' | 'original') => {
    setSource(value)
    rewind()
  }

  const canPlay = source === 'mine' && !!myVoiceUrl

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
              title={canPlay ? 'Play your take' : 'Only recorded takes can be played back in this build'}
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
            <span>{canPlay ? clock(duration) : video.duration}</span>
          </div>
          {source === 'original' && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              The source clip's audio isn't bundled in this build — switch to “My voice” to hear your take.
            </div>
          )}
        </div>

        {myVoiceUrl && (
          <audio
            ref={audioRef}
            src={myVoiceUrl}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
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
          {take && !take.audioKey && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>This take is from your earlier history — no audio was stored.</div>
          )}
        </div>
      </div>
    </div>
  )
}
