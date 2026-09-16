import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { SegmentedControl } from '../components/SegmentedControl'
import { ThumbnailStrip } from '../components/ThumbnailStrip'
import { WaveformEditor } from '../components/WaveformEditor'
import { MAX_CLIP_SECONDS } from '../data/types'
import { decodeFile, peaks as computePeaks, type Column } from '../lib/audio/decode'
import { proposeSegments, type Segment } from '../lib/audio/segment'
import { formatCategories, parseCategories, searchClips } from '../lib/clips'
import { sliceToWav } from '../lib/audio/wav'
import { extractFrames } from '../lib/video/frames'
import { SavedField } from '../components/SavedField'
import { useApp } from '../store/context'

const WAVEFORM_COLUMNS = 900
/** Slots on the filmstrip. Enough to show a change of speaker on a wide screen,
 *  few enough that walking a long file does not take all day — each one is a
 *  seek, and seeks are the slow part. */
const FILMSTRIP_SLOTS = 28

interface Line {
  title: string
  text: string
  ipa: string
  categories: string
}

interface Loaded {
  name: string
  samples: Float32Array
  sampleRate: number
  duration: number
  peaks: Column[]
  /** The original file, for the picture. The decoded samples carry only sound. */
  url: string
  file: File
  isVideo: boolean
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`
}

/** Floored to tenths like the timestamps beside it, so a boundary reads the same in both. */
function lengthLabel(seconds: number): string {
  return (Math.floor(seconds * 10) / 10).toFixed(1)
}

type Tab = 'cut' | 'clips'

export function AdminScreen() {
  const { data, addClips, updateClip, deleteClip } = useApp()
  const [tab, setTab] = useState<Tab>('cut')
  const [manageQuery, setManageQuery] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const player = useRef<HTMLAudioElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  /** Identifies the current playback. A second Play while one is running would
   *  otherwise leave two loops moving the same playhead. */
  const playing = useRef(0)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [playlist, setPlaylist] = useState('')
  const [batchCategories, setBatchCategories] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  /** Whether the batch just published is having its video cut. */
  const [savedVideo, setSavedVideo] = useState(false)
  const [frames, setFrames] = useState<(string | null)[]>([])

  const open = async (file: File | undefined) => {
    if (!file) return
    setBusy('Decoding…')
    setSaved(null)
    // The strip's slots exist from the moment a video is chosen, so it shows
    // as an empty filmstrip filling in rather than appearing once it is done.
    setFrames(file.type.startsWith('video/') ? Array.from({ length: FILMSTRIP_SLOTS }, () => null) : [])
    // The previous upload's url is dead the moment this one replaces it, and
    // an unrevoked one holds the whole file in memory until the tab closes.
    setLoaded((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return null
    })
    const url = URL.createObjectURL(file)
    try {
      const { samples, sampleRate } = await decodeFile(file)
      const proposal = proposeSegments(samples, sampleRate, { maxSeconds: MAX_CLIP_SECONDS })
      setLoaded({
        name: file.name,
        samples,
        sampleRate,
        duration: samples.length / sampleRate,
        peaks: computePeaks(samples, WAVEFORM_COLUMNS),
        url,
        file,
        // What the browser says it is, not what the extension claims. An
        // audio-only file in a video container still has no picture, which the
        // frame walk discovers and reports as an empty strip.
        isVideo: file.type.startsWith('video/'),
      })
      setSegments(proposal)
      setLines(proposal.map(() => ({ title: '', text: '', ipa: '', categories: batchCategories })))
      setSelected(proposal.length ? 0 : null)
      // A playlist per upload is the common case, so name it after the file.
      setPlaylist((current) => current || file.name.replace(/\.[^.]+$/, ''))
    } catch {
      URL.revokeObjectURL(url)
      setBusy(null)
      setLoaded(null)
      window.alert("That file couldn't be read as audio or video")
      return
    }
    setBusy(null)
  }

  /** Puts the picture on the frame at this moment without starting playback. */
  const scrub = (seconds: number) => {
    setPlayhead(seconds)
    playing.current++
    const element = video.current
    if (element) {
      element.pause()
      element.currentTime = seconds
    }
  }

  const playRange = (start: number, end: number) => {
    if (!loaded) return
    // Any loop already moving the playhead belongs to a previous press.
    const token = ++playing.current

    // A video is played whole and seeked to, rather than sliced: it carries its
    // own sound, so picture and audio cannot drift apart the way two separate
    // players would. Slicing is still what gets published — that is a different
    // job, and it happens once, at the end.
    if (loaded.isVideo && video.current) {
      const element = video.current
      element.currentTime = start
      setPlayhead(start)
      void element.play()
      const follow = () => {
        if (playing.current !== token) return
        // Driven by the video's own clock rather than the wall clock: a frame
        // it stalls on is a frame the playhead should wait at too.
        if (element.ended || element.currentTime >= end) {
          element.pause()
          setPlayhead(null)
          return
        }
        setPlayhead(element.currentTime)
        requestAnimationFrame(follow)
      }
      requestAnimationFrame(follow)
      return
    }

    const url = URL.createObjectURL(sliceToWav(loaded.samples, loaded.sampleRate, start, end))
    const audio = player.current
    if (!audio) return
    audio.src = url
    setPlayhead(start)
    void audio.play()
    const started = performance.now()
    const follow = () => {
      if (playing.current !== token) {
        URL.revokeObjectURL(url)
        return
      }
      const elapsed = (performance.now() - started) / 1000
      if (elapsed >= end - start) {
        setPlayhead(null)
        URL.revokeObjectURL(url)
        return
      }
      setPlayhead(start + elapsed)
      requestAnimationFrame(follow)
    }
    requestAnimationFrame(follow)
  }

  // Walking the file for frames is slow and entirely optional, so it runs after
  // the cut proposal is already on screen and fills the strip in as it goes.
  // Abandoning it on a new upload matters: without that, two walks fight over
  // the same strip and the frames arrive interleaved from both files.
  useEffect(() => {
    if (!loaded?.isVideo) return
    const controller = new AbortController()
    void extractFrames({
      url: loaded.url,
      duration: loaded.duration,
      count: FILMSTRIP_SLOTS,
      onFrame: ({ index, src }) =>
        setFrames((previous) => {
          const next = previous.slice()
          next[index] = src
          return next
        }),
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [loaded])

  const update = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const remove = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index))
    setLines((prev) => prev.filter((_, i) => i !== index))
    setSelected(null)
  }

  const applyCategoriesToAll = () => setLines((prev) => prev.map((line) => ({ ...line, categories: batchCategories })))

  const mergeWithNext = (index: number) => {
    setSegments((prev) =>
      prev
        .map((segment, i) => (i === index ? { start: segment.start, end: prev[index + 1].end } : segment))
        .filter((_, i) => i !== index + 1),
    )
    setLines((prev) =>
      prev
        .map((line, i) =>
          i === index ? { ...line, text: [line.text, prev[index + 1].text].filter(Boolean).join(' ') } : line,
        )
        .filter((_, i) => i !== index + 1),
    )
  }

  const splitAtPlayhead = () => {
    if (playhead === null || selected === null) return
    const segment = segments[selected]
    if (playhead <= segment.start + 0.2 || playhead >= segment.end - 0.2) return
    setSegments((prev) => [
      ...prev.slice(0, selected),
      { start: segment.start, end: playhead },
      { start: playhead, end: segment.end },
      ...prev.slice(selected + 1),
    ])
    setLines((prev) => [
      ...prev.slice(0, selected),
      prev[selected],
      { title: '', text: '', ipa: '', categories: prev[selected].categories },
      ...prev.slice(selected + 1),
    ])
  }

  const publish = async () => {
    if (!loaded) return
    // Named separately because it is the slow half: the recording can be
    // hundreds of megabytes, and "Saving…" for two minutes reads as a hang.
    setBusy(loaded.isVideo ? 'Uploading the recording…' : 'Saving…')
    await addClips(
      segments.map((segment, index) => ({
        title: lines[index].title.trim(),
        line: lines[index].text.trim(),
        ipa: lines[index].ipa.trim(),
        source: loaded.name,
        playlist: playlist.trim() || loaded.name,
        categories: parseCategories(lines[index].categories),
        start: segment.start,
        end: segment.end,
        audio: sliceToWav(loaded.samples, loaded.sampleRate, segment.start, segment.end),
      })),
      // Only a video needs cutting server-side. Audio was already sliced here,
      // and uploading the original again would buy nothing.
      loaded.isVideo ? { file: loaded.file, name: loaded.name } : undefined,
    )
    setBusy(null)
    setSaved(segments.length)
    setSavedVideo(loaded.isVideo)
    setLoaded((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return null
    })
    setSegments([])
    setLines([])
    setSelected(null)
    setFrames([])
  }

  const tooLong = segments.filter((s) => s.end - s.start > MAX_CLIP_SECONDS + 0.01).length

  return (
    <div className="stack gap-6">
      <div>
        <h1 style={{ marginBottom: 2 }}>Clip studio</h1>
        <div className="card-meta">
          Cut a recording into single lines for the library. Learners practise these; they cannot add their own.
        </div>
      </div>

      <SegmentedControl
        name="admin-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'cut', label: 'Cut a recording' },
          { value: 'clips', label: `Clips (${data.videos.length})` },
        ]}
      />

      {tab === 'clips' && (
        <div className="stack gap-3">
          <input
            className="input"
            placeholder="Find a clip by name, line, playlist or category"
            value={manageQuery}
            onChange={(e) => setManageQuery(e.target.value)}
            aria-label="Find a clip"
          />
          {searchClips(data.videos, { query: manageQuery }).map((video) => (
            <div className="card elev-sm stack gap-2" key={video.id}>
              <div className="row between wrap gap-2">
                <span className="card-meta mono">
                  {video.source} · {video.timestamp} · {clock(video.durationSeconds)}
                </span>
                <div className="row gap-2">
                  <button
                    type="button"
                    className={`btn ${video.featured ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => void updateClip(video.id, { featured: !video.featured })}
                  >
                    {video.featured ? 'Featured' : 'Feature'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => void deleteClip(video.id)}>
                    Delete clip
                  </button>
                </div>
              </div>
              <div className="row gap-3 wrap">
                <SavedField
                  id={`name-${video.id}`}
                  label="Name"
                  value={video.title}
                  style={{ flex: '1 1 220px' }}
                  onSave={(title) => void updateClip(video.id, { title })}
                />
                <SavedField
                  id={`playlist-${video.id}`}
                  label="Playlist"
                  value={video.playlist}
                  style={{ flex: '1 1 160px' }}
                  onSave={(playlist) => void updateClip(video.id, { playlist })}
                />
                <SavedField
                  id={`cats-${video.id}`}
                  label="Categories"
                  value={formatCategories(video.categories)}
                  style={{ flex: '1 1 160px' }}
                  onSave={(raw) => void updateClip(video.id, { categories: parseCategories(raw) })}
                />
              </div>
              <SavedField
                id={`text-${video.id}`}
                label="Line"
                value={video.captions[0]?.text ?? ''}
                onSave={(line) => void updateClip(video.id, { line })}
              />
            </div>
          ))}
          {data.videos.length === 0 && <div className="card-meta">No clips yet — cut a recording first.</div>}
        </div>
      )}

      {tab === 'cut' && (
      <div className="row gap-3 wrap">
        <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
          Upload audio or video
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,video/*"
          hidden
          onChange={(e) => void open(e.target.files?.[0])}
        />
        {/* Still not wired: fetching a video and stripping its audio is an
            endpoint the API does not have, and the button says so rather than
            failing when pressed. */}
        <button type="button" className="btn btn-secondary" disabled title="Not available yet — upload a file instead">
          Paste a YouTube URL
        </button>
        {busy && <span style={{ fontSize: 13, opacity: 0.7 }}>{busy}</span>}
      </div>
      )}

      {saved !== null && (
        <div className="card elev-sm">
          <div className="card-kicker">Published</div>
          <div style={{ fontSize: 14 }}>{saved} clips are now in the library.</div>
          {savedVideo && (
            <div className="card-meta">
              Their video is being cut in the background — learners can practise the audio meanwhile,
              and the picture appears when each cut is done.
            </div>
          )}
        </div>
      )}

      {tab === 'cut' && loaded && (
        <>
          <div className="row gap-3 wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="playlist">Playlist</label>
              <input
                id="playlist"
                className="input"
                placeholder="Lesson or episode name"
                value={playlist}
                onChange={(e) => setPlaylist(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="batch-categories">Categories for the batch</label>
              <input
                id="batch-categories"
                className="input"
                placeholder="interview, daily conversation"
                value={batchCategories}
                onChange={(e) => setBatchCategories(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-secondary" onClick={applyCategoriesToAll}>
              Apply to all clips
            </button>
          </div>

          <div className="stack gap-2">
            <div className="row between wrap gap-2">
              <div className="card-kicker">{loaded.name}</div>
              <div className="card-meta mono">
                {clock(loaded.duration)} · {segments.length} clips proposed
              </div>
            </div>
            {loaded.isVideo && (
              <video
                ref={video}
                src={loaded.url}
                className="studio-video"
                playsInline
                controls
                onSeeked={() => setPlayhead(video.current?.currentTime ?? null)}
                aria-label="Uploaded recording"
              />
            )}
            {frames.length > 0 && (
              <ThumbnailStrip
                frames={frames}
                duration={loaded.duration}
                playhead={playhead}
                onScrub={scrub}
              />
            )}
            <WaveformEditor
              peaks={loaded.peaks}
              duration={loaded.duration}
              segments={segments}
              selected={selected}
              playhead={playhead}
              onSelect={setSelected}
              onChange={setSegments}
              onScrub={scrub}
            />
            <div className="row gap-2 wrap">
              <button type="button" className="btn btn-secondary" onClick={() => playRange(0, loaded.duration)}>
                <Icon name="play" size={14} />
                Play all
              </button>
              <button type="button" className="btn btn-secondary" onClick={splitAtPlayhead} disabled={playhead === null || selected === null}>
                Split at playhead
              </button>
              {tooLong > 0 && (
                <span style={{ fontSize: 12, color: 'var(--score-attention)' }}>
                  {tooLong} clip{tooLong > 1 ? 's are' : ' is'} longer than {MAX_CLIP_SECONDS}s
                </span>
              )}
            </div>
          </div>

          <div className="stack gap-2">
            {segments.map((segment, index) => {
              const length = segment.end - segment.start
              const over = length > MAX_CLIP_SECONDS + 0.01
              return (
                <div
                  className="card elev-sm stack gap-2"
                  key={index}
                  data-selected={index === selected}
                  onPointerDown={() => setSelected(index)}
                >
                  <div className="row between wrap gap-2">
                    <div className="row gap-2">
                      <span className="tag tag-neutral mono">{index + 1}</span>
                      <span className="card-meta mono" style={{ color: over ? 'var(--score-attention)' : undefined }}>
                        {clock(segment.start)}–{clock(segment.end)} · {lengthLabel(length)}s
                      </span>
                    </div>
                    <div className="row gap-2">
                      <button type="button" className="btn btn-ghost" onClick={() => playRange(segment.start, segment.end)}>
                        <Icon name="play" size={14} />
                        Play
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={index === segments.length - 1}
                        onClick={() => mergeWithNext(index)}
                      >
                        Merge next
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => remove(index)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="row gap-3 wrap">
                    <div className="field" style={{ flex: '1 1 200px' }}>
                      <label htmlFor={`title-${index}`}>Name (optional)</label>
                      <input
                        id={`title-${index}`}
                        className="input"
                        placeholder="Defaults to the line"
                        value={lines[index]?.title ?? ''}
                        onChange={(e) => update(index, { title: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ flex: '1 1 200px' }}>
                      <label htmlFor={`categories-${index}`}>Categories</label>
                      <input
                        id={`categories-${index}`}
                        className="input"
                        placeholder="interview, greeting"
                        value={lines[index]?.categories ?? ''}
                        onChange={(e) => update(index, { categories: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`line-${index}`}>Line</label>
                    <input
                      id={`line-${index}`}
                      className="input"
                      placeholder="What is said in this clip"
                      value={lines[index]?.text ?? ''}
                      onChange={(e) => update(index, { text: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`ipa-${index}`}>IPA (optional)</label>
                    <input
                      id={`ipa-${index}`}
                      className="input mono"
                      placeholder="/…/"
                      value={lines[index]?.ipa ?? ''}
                      onChange={(e) => update(index, { ipa: e.target.value })}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={!segments.length || tooLong > 0 || busy !== null}
            onClick={() => void publish()}
          >
            Publish {segments.length} clips to the library
          </button>
        </>
      )}

      <audio ref={player} hidden />
    </div>
  )
}
