import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LoadFailure, Loading } from '../components/LoadState'
import { NoSuchClip } from '../components/NoSuchClip'
import { SegmentedControl } from '../components/SegmentedControl'
import { clock } from '../lib/time'
import { urlOf, useClipAudio, useClipVideo, useTakeAudio } from '../lib/useAudioUrl'
import { ApiError } from '../lib/api'
import { repository } from '../repository'
import type { Dub } from '../data/types'
import { useApp } from '../store/context'

export function DubScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const { data, state, statsFor } = useApp()
  const audioRef = useRef<HTMLAudioElement>(null)
  /** The picture. Muted and along for the ride: the audio element is the clock,
   *  because which voice is playing is the whole point of this screen. */
  const videoRef = useRef<HTMLVideoElement>(null)
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
  /** The exported file, keyed by the take it belongs to — switching takes must
   *  not show the previous one's file while the new one is being read. */
  const [resolvedDub, setResolvedDub] = useState<{ takeId: string; dub: Dub } | null>(null)
  const [dubError, setDubError] = useState<string | null>(null)
  /** Bumped when a dub is asked for, to restart the read below. Without it the
   *  poll only ever runs on arrival: it self-schedules while it sees `pending`,
   *  and a request that sets `pending` from outside leaves nothing running —
   *  the screen would wait for ever on a file that was already made. */
  const [dubRequest, setDubRequest] = useState(0)

  const video = data.videos.find((v) => v.id === videoId)
  const stats = statsFor(videoId ?? '')
  const take = stats.takes.find((t) => t.id === takeId) ?? stats.takes[stats.takes.length - 1]
  /** Which take the export applies to. A take with no recording has nothing to
   *  mux, so there is nothing to ask about either. */
  const takeIdForDub = take?.hasAudio ? take.id : null
  const myVoiceUrl = urlOf(useTakeAudio(take?.hasAudio ? take.id : null))
  const originalUrl = urlOf(useClipAudio(video?.id ?? null))
  const clipVideoUrl = urlOf(useClipVideo(video?.id ?? null))

  // Reads the dub, and keeps reading while one is being made. A mux is
  // sub-second work, so this is a short wait rather than a background errand —
  // which is also why the dubber is its own worker and not a job behind a batch
  // of cuts.
  useEffect(() => {
    if (!takeIdForDub) return
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const ask = async () => {
      try {
        const next = await repository.dub(takeIdForDub)
        if (!active) return
        setResolvedDub({ takeId: takeIdForDub, dub: next })
        if (next.status === 'pending') timer = setTimeout(ask, 1500)
      } catch {
        // Keep asking: the worker may still be running, and the next answer
        // may be the file.
        if (active) timer = setTimeout(ask, 1500)
      }
    }
    void ask()

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [takeIdForDub, dubRequest])

  // Read rather than stored, so a take with no answer yet shows nothing rather
  // than the previous take's file.
  const dub = resolvedDub?.takeId === takeIdForDub ? resolvedDub.dub : null

  const exportDub = async () => {
    if (!takeIdForDub) return
    setDubError(null)
    setResolvedDub({ takeId: takeIdForDub, dub: { status: 'pending', url: null } })
    try {
      setResolvedDub({ takeId: takeIdForDub, dub: await repository.requestDub(takeIdForDub) })
      // Start watching for it to land.
      setDubRequest((n) => n + 1)
    } catch (err) {
      // The common one is a clip with no picture to dub onto: an audio clip, or
      // one whose cut has not landed yet. Saying which beats a dead button.
      setResolvedDub({ takeId: takeIdForDub, dub: { status: 'none', url: null } })
      setDubError(err instanceof ApiError ? err.message : 'Could not start the export.')
    }
  }

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!video) return <NoSuchClip />

  const activeUrl = source === 'mine' ? myVoiceUrl : originalUrl
  const canPlay = !!activeUrl

  /** Moves the picture to where the sound is.
   *
   * Only when they have drifted apart by more than a fifth of a second:
   * assigning currentTime on every tick makes the video stutter, and a fifth of
   * a second is under what anyone watching a mouth would notice.
   */
  const followWithPicture = (seconds: number, force = false) => {
    const picture = videoRef.current
    if (!picture) return
    if (force || Math.abs(picture.currentTime - seconds) > 0.2) {
      picture.currentTime = Math.min(seconds, picture.duration || seconds)
    }
  }

  const rewind = () => {
    audioRef.current?.pause()
    videoRef.current?.pause()
    followWithPicture(0, true)
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
      videoRef.current?.pause()
      setPlaying(false)
    } else {
      void el.play()
      followWithPicture(el.currentTime, true)
      void videoRef.current?.play()
      setPlaying(true)
    }
  }

  const seek = (value: number) => {
    resumeAt.current = value
    setPosition(value)
    if (audioRef.current) audioRef.current.currentTime = value
    followWithPicture(value, true)
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
          {/* Muted on purpose, and the tag says so: the sound comes from the
              voice below, which is what dubbing is. No controls either — the
              transport under it drives both. */}
          {clipVideoUrl && (
            <video
              ref={videoRef}
              className="thumb-poster"
              src={clipVideoUrl}
              muted
              playsInline
              preload="metadata"
              aria-label={`${video.title}, without its sound`}
            />
          )}
          <span className="tag tag-neutral" style={{ position: 'absolute', top: 10, left: 10 }}>
            original audio muted
          </span>
          {!clipVideoUrl && <Icon name="play" size={32} />}
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
              followWithPicture(e.currentTarget.currentTime)
            }}
            onEnded={() => {
              videoRef.current?.pause()
              setPlaying(false)
            }}
          />
        )}

        {/* The dub as a file, rather than only as something this screen can
            play: a learner who has nailed a line wants to keep it and send it.
            Asked for rather than made for every take — a line gets practised a
            dozen times and nobody wants a dozen files. */}
        <div className="stack gap-2">
          <div className="card-kicker">This dub as a video</div>
          {dub?.status === 'ready' && dub.url ? (
            <div className="row gap-2 wrap">
              <a className="btn btn-primary" href={dub.url} download={`${video.title}.mp4`}>
                <Icon name="download" size={14} />
                Download
              </a>
              <a className="btn btn-secondary" href={dub.url} target="_blank" rel="noreferrer">
                Open
              </a>
            </div>
          ) : dub?.status === 'pending' ? (
            <div className="card-meta" role="status">
              Putting your voice on the picture…
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start' }}
              disabled={!takeIdForDub || !video.hasVideo}
              title={
                !takeIdForDub
                  ? 'This take has no recording'
                  : video.hasVideo
                    ? 'Make a video of this take over the original'
                    : 'This clip has no video to dub onto'
              }
              onClick={() => void exportDub()}
            >
              <Icon name="download" size={14} />
              Export this dub
            </button>
          )}
          {dubError && (
            <div className="card-meta" style={{ color: 'var(--score-attention)' }}>
              {dubError}
            </div>
          )}
        </div>

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
