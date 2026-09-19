import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { ClipFace } from '../components/ClipFace'
import { Icon } from '../components/Icon'
import { LoadFailure, Loading } from '../components/LoadState'
import { NoSuchClip } from '../components/NoSuchClip'
import { SegmentedControl } from '../components/SegmentedControl'
import { clock } from '../lib/time'
import { DubExport } from '../components/DubExport'
import { urlOf, useClipAudio, useClipVideo, useTakeAudio } from '../lib/useAudioUrl'
import { useDub } from '../lib/useDub'
import { useApp } from '../store/context'

export function DubScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const t = useT()
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
  const video = data.videos.find((v) => v.id === videoId)
  const stats = statsFor(videoId ?? '')
  const take = stats.takes.find((one) => one.id === takeId) ?? stats.takes[stats.takes.length - 1]
  /** Which take the export applies to. A take with no recording has nothing to
   *  mux, so there is nothing to ask about either. */
  const takeIdForDub = take?.hasAudio ? take.id : null
  const myVoiceUrl = urlOf(useTakeAudio(take?.hasAudio ? take.id : null))
  const originalUrl = urlOf(useClipAudio(video?.id ?? null))
  const clipVideoUrl = urlOf(useClipVideo(video?.id ?? null, Boolean(video?.videoPending)))
  const dubState = useDub(takeIdForDub)

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
        {t('dub.back')}
      </button>

      <h3 style={{ margin: 0 }}>{video.title}</h3>

      {/* Picture on one side, everything that drives it on the other. A 9:16
          frame is tall, and stacking the transport, the export and the takes
          underneath it left a column of controls four hundred pixels wide with
          half the screen empty either side of it. Below 760px it stacks, which
          is the shape a phone wants anyway. */}
      <div className="dub-grid">
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
              aria-label={t('dub.withoutSound', video.title)}
            />
          )}
          {/* Before the tag, not after it: the face fills the frame, so drawn
              second it paints straight over the thing it is meant to sit
              behind. */}
          {!clipVideoUrl && (
            <ClipFace id={video.id} posterUrl="" line={video.captions[0]?.text ?? ''} />
          )}
          <span
            className="tag tag-neutral"
            style={{ position: 'absolute', top: 10, left: 10, zIndex: 1 }}
          >
            {t('dub.muted')}
          </span>
        </div>

        <div className="stack gap-4">
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
                  {t('dub.myVoice')}
                </>
              ),
            },
            {
              value: 'original',
              label: (
                <>
                  <Icon name="volume" size={14} />
                  {t('dub.original')}
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
              title={canPlay ? t('dub.play') : source === 'mine' ? t('dub.noTakeAudio') : t('dub.noOriginalAudio')}
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
              aria-label={t('dub.position')}
            />
          </div>
          <div className="row between mono" style={{ fontSize: 12, opacity: 0.65 }}>
            <span>{clock(position)}</span>
            <span>{canPlay ? clock(duration) : clock(video.durationSeconds)}</span>
          </div>
          {source === 'original' && !originalUrl && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {t('dub.noOriginal')}
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
            play: a learner who has nailed a line wants to keep it and send it. */}
        <div className="stack gap-2">
          <div className="card-kicker">{t('dub.asVideo')}</div>
          <DubExport
            state={dubState}
            filename={video.title}
            canDub={video.hasVideo}
            hasRecording={!!takeIdForDub}
            label={t('dub.export')}
          />
        </div>

        <div className="stack gap-2">
          <div className="card-kicker">{t('dub.takes')}</div>
          <div className="row gap-2" style={{ overflowX: 'auto' }}>
            {/* `option`, not `t`: this list used to name its callback `t`, which
                shadowed the translate function and turned every label into a
                call on a Take object. */}
            {stats.takes.map((option, i) => (
              <button
                type="button"
                key={option.id}
                className={`btn ${option.id === take?.id ? 'btn-primary' : 'btn-secondary'} mono`}
                style={{ flexShrink: 0 }}
                onClick={() => selectTake(option.id)}
              >
                {t('analysis.take', i + 1)}
              </button>
            ))}
          </div>
          {take && !take.hasAudio && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>{t('dub.noRecording')}</div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
