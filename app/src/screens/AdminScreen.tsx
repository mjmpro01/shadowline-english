import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { SegmentedControl } from '../components/SegmentedControl'
import { ThumbnailStrip } from '../components/ThumbnailStrip'
import { WaveformEditor } from '../components/WaveformEditor'
import { MAX_CLIP_SECONDS, type Transcript } from '../data/types'
import { decodeFile, peaks as computePeaks, type Column } from '../lib/audio/decode'
import { proposeSegments, type Segment } from '../lib/audio/segment'
import { clipName, formatCategories, nextClipNumber, parseCategories, searchClips } from '../lib/clips'
import { sliceToWav } from '../lib/audio/wav'
import { ipaOf, lineOf, wordsBetween } from '../lib/transcript'
import { extractFrames } from '../lib/video/frames'
import { repository } from '../repository'
import { SavedField } from '../components/SavedField'
import { useApp } from '../store/context'

const WAVEFORM_COLUMNS = 900
/** Slots on the filmstrip. Enough to show a change of speaker on a wide screen,
 *  few enough that walking a long file does not take all day — each one is a
 *  seek, and seeks are the slow part. */
const FILMSTRIP_SLOTS = 28

/** How often to ask whether the transcript is ready. Whisper takes minutes on
 *  a long recording, so asking more often only adds requests. */
const TRANSCRIPT_POLL_MS = 3000

interface Line {
  title: string
  text: string
  ipa: string
  categories: string
  /**
   * Whether this clip goes to the library when the batch is published.
   *
   * Distinct from `selected`, which is the one clip the timeline is focused on.
   * Every proposal starts included, because a short recording is usually
   * published whole; a fifty-minute one proposes hundreds of cuts and most of
   * them are not dialogue worth shadowing, which is what the bulk controls are
   * for.
   */
  include: boolean
}

const EMPTY_LINE: Omit<Line, 'categories'> = { title: '', text: '', ipa: '', include: true }

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
  /** The upload on the server, which the transcript and the cut both hang off.
   *  Null while it is still going up, or if it failed. */
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)

  const open = async (file: File | undefined) => {
    if (!file) return
    setBusy('Decoding…')
    setSaved(null)
    // The strip's slots exist from the moment a video is chosen, so it shows
    // as an empty filmstrip filling in rather than appearing once it is done.
    setFrames(file.type.startsWith('video/') ? Array.from({ length: FILMSTRIP_SLOTS }, () => null) : [])
    setSourceId(null)
    setTranscript(null)
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
      setLines(proposal.map(() => ({ ...EMPTY_LINE, categories: batchCategories })))
      setSelected(proposal.length ? 0 : null)
      // A playlist per upload is the common case, so name it after the file.
      setPlaylist((current) => current || file.name.replace(/\.[^.]+$/, ''))

      // The recording goes up now rather than at publish, because transcribing
      // it is what fills the lines in and that cannot start until the server
      // has the file. Publishing then only has to reference it.
      //
      // Not awaited: the cuts are already on screen and the admin can work
      // while it uploads. A failure costs the transcript and the video, not the
      // batch — which is exactly where the studio was before either existed.
      void repository
        .uploadSource(file, file.name)
        .then(setSourceId)
        .catch(() => setTranscript({ status: 'failed', language: '', words: [] }))
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

  // Asks for the transcript until it is there or it is not coming. Whisper runs
  // on the server over the whole recording, so this is minutes of waiting with
  // the admin already cutting — which is the point of polling rather than
  // blocking the screen on it.
  useEffect(() => {
    if (!sourceId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const ask = async () => {
      try {
        const next = await repository.sourceTranscript(sourceId)
        if (!active) return
        setTranscript(next)
        if (next.status === 'pending') timer = setTimeout(ask, TRANSCRIPT_POLL_MS)
      } catch {
        // A failed request is not a failed transcript: keep asking, because the
        // worker may still be running and the next answer may be the words.
        if (active) timer = setTimeout(ask, TRANSCRIPT_POLL_MS)
      }
    }
    void ask()

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [sourceId])

  /**
   * Writes the transcript into the clips, leaving alone anything already typed.
   *
   * Only empty fields are filled, so a correction survives — both the automatic
   * fill when the words arrive and the button that re-runs it after boundaries
   * have moved.
   */
  const fillFromTranscript = useCallback((words: Transcript['words'], cuts: Segment[]) => {
    if (words.length === 0) return
    setLines((previous) =>
      previous.map((line, index) => {
        const cut = cuts[index]
        if (!cut) return line
        const spoken = wordsBetween(words, cut.start, cut.end)
        if (spoken.length === 0) return line
        return {
          ...line,
          text: line.text.trim() ? line.text : lineOf(spoken),
          ipa: line.ipa.trim() ? line.ipa : ipaOf(spoken),
        }
      }),
    )
  }, [])

  // The words land in the clips as they stand when they arrive, which is why
  // the fill is an effect and not part of the fetch: by then the admin has
  // usually been moving boundaries for a while.
  useEffect(() => {
    if (transcript?.status === 'ready') fillFromTranscript(transcript.words, segments)
    // segments deliberately absent: moving a boundary should not silently
    // rewrite the lines under the admin. The button below is how that is asked
    // for on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, fillFromTranscript])

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
      // The new half inherits whether its parent was going to be published:
      // splitting a clip is not a decision about publishing it.
      { ...EMPTY_LINE, categories: prev[selected].categories, include: prev[selected].include },
      ...prev.slice(selected + 1),
    ])
  }

  const publish = async () => {
    if (!loaded) return
    const chosen = segments
      .map((segment, index) => ({ segment, line: lines[index] }))
      .filter(({ line }) => line?.include)
    if (chosen.length === 0) return

    setBusy('Saving…')
    await addClips(
      chosen.map(({ segment, line }) => ({
        title: line.title.trim(),
        line: line.text.trim(),
        ipa: line.ipa.trim(),
        source: loaded.name,
        playlist: playlist.trim() || loaded.name,
        categories: parseCategories(line.categories),
        start: segment.start,
        end: segment.end,
        audio: sliceToWav(loaded.samples, loaded.sampleRate, segment.start, segment.end),
      })),
      // Already on the server since the file was opened, so publishing sends
      // an id rather than the recording all over again.
      sourceId,
    )
    setBusy(null)
    setSaved(chosen.length)
    setSavedVideo(loaded.isVideo)
    setLoaded((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return null
    })
    setSegments([])
    setLines([])
    setSelected(null)
    setFrames([])
    setSourceId(null)
    setTranscript(null)
  }

  const included = lines.filter((line) => line.include).length

  // The name each unnamed clip will carry, worked out the way publishing works
  // it out: numbered across the selected clips only, continuing from what the
  // playlist already holds. Shown as the placeholder so the studio is not
  // promising one thing and saving another.
  const publishPlaylist = playlist.trim() || loaded?.name || ''
  const clipNumbers: number[] = []
  let nextNumber = nextClipNumber(data.videos, publishPlaylist)
  for (const [index, line] of lines.entries()) {
    clipNumbers[index] = line.include ? nextNumber++ : 0
  }
  // Only what is actually going up has to be short enough. A proposal being
  // left behind is not a reason to refuse the batch.
  const tooLong = segments.filter(
    (s, i) => lines[i]?.include && s.end - s.start > MAX_CLIP_SECONDS + 0.01,
  ).length

  const includeAll = (include: boolean) =>
    setLines((previous) => previous.map((line) => ({ ...line, include })))

  /** Everything that has words in it, which after transcription is the part
   *  worth publishing — the rest of a long recording is silence and noise. */
  const includeOnlySpoken = () =>
    setLines((previous) => previous.map((line) => ({ ...line, include: line.text.trim() !== '' })))

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

      {/* What the tab looked like before a file is chosen: two buttons on an
          empty page, with nothing saying what pressing one leads to. An admin
          opening this for the first time has no idea whether it wants a
          three-second clip or an hour-long lecture, or that the lines write
          themselves. Four steps is the whole answer. */}
      {tab === 'cut' && !loaded && !busy && (
        <div className="card elev-sm stack gap-3" style={{ maxWidth: 640 }}>
          <div className="card-kicker">What happens next</div>
          <ol className="studio-steps">
            <li>
              <b>Upload a recording.</b> An hour is fine — it is cut into single lines, not
              practised whole.
            </li>
            <li>
              <b>The words write themselves.</b> Whisper transcribes it in the background and
              fills each line in, with its pronunciation. Keep cutting meanwhile.
            </li>
            <li>
              <b>Move the boundaries.</b> Every clip is proposed from the silences; drag, split
              or unselect the ones you do not want.
            </li>
            <li>
              <b>Publish.</b> The selected clips reach the library, and their video is cut in the
              background.
            </li>
          </ol>
          <div className="card-meta">
            Learners practise what is published here. They cannot add clips of their own.
          </div>
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

            <div className="row between wrap gap-2">
              <div className="card-meta">
                {transcript === null && 'Listening for the words…'}
                {transcript?.status === 'pending' &&
                  'Transcribing — the lines fill themselves in when it finishes. Keep cutting meanwhile.'}
                {transcript?.status === 'ready' &&
                  `Transcribed ${transcript.words.length} words. Empty lines have been filled in — check them.`}
                {transcript?.status === 'failed' &&
                  'The words could not be transcribed, so the lines are yours to type.'}
              </div>
              {/* Boundaries move after the words arrive, and the lines are not
                  rewritten underneath the admin when they do. This is how that
                  is asked for on purpose — and it still leaves typed lines
                  alone, so corrections survive it. */}
              {transcript?.status === 'ready' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fillFromTranscript(transcript.words, segments)}
                >
                  Fill empty lines from transcript
                </button>
              )}
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

          <div className="row between wrap gap-2">
            <div className="card-meta">
              {included} of {segments.length} clips selected to publish
              {included < segments.length && ' — the rest stay behind'}
            </div>
            <div className="row gap-2 wrap">
              <button type="button" className="btn btn-ghost" onClick={() => includeAll(true)}>
                Select all
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => includeAll(false)}>
                Select none
              </button>
              {/* After transcription this is the useful one: a long recording
                  proposes a cut per pause, and only some of them are speech. */}
              <button type="button" className="btn btn-ghost" onClick={includeOnlySpoken}>
                Only clips with a line
              </button>
            </div>
          </div>

          <div className="stack gap-2">
            {segments.map((segment, index) => {
              const length = segment.end - segment.start
              const over = lines[index]?.include && length > MAX_CLIP_SECONDS + 0.01
              return (
                <div
                  className="card elev-sm stack gap-2"
                  key={index}
                  data-selected={index === selected}
                  data-excluded={!lines[index]?.include}
                  onPointerDown={() => setSelected(index)}
                >
                  <div className="row between wrap gap-2">
                    <div className="row gap-2">
                      <label className="clip-include" title="Publish this clip">
                        <input
                          type="checkbox"
                          checked={lines[index]?.include ?? false}
                          onChange={(e) => update(index, { include: e.target.checked })}
                          aria-label={`Publish clip ${index + 1}`}
                        />
                      </label>
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
                        placeholder={
                          clipNumbers[index] ? clipName(clipNumbers[index]) : 'Named when published'
                        }
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
            disabled={included === 0 || tooLong > 0 || busy !== null}
            onClick={() => void publish()}
          >
            Publish {included} clips to the library
          </button>
        </>
      )}

      <audio ref={player} hidden />
    </div>
  )
}
