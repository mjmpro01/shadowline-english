import { useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { SegmentedControl } from '../components/SegmentedControl'
import { WaveformEditor } from '../components/WaveformEditor'
import { MAX_CLIP_SECONDS } from '../data/types'
import { decodeFile, peaks as computePeaks } from '../lib/audio/decode'
import { proposeSegments, type Segment } from '../lib/audio/segment'
import { formatCategories, parseCategories, searchClips } from '../lib/clips'
import { sliceToWav } from '../lib/audio/wav'
import { useApp } from '../store/context'

const WAVEFORM_COLUMNS = 900

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
  peaks: { min: number; max: number }[]
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

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [playlist, setPlaylist] = useState('')
  const [batchCategories, setBatchCategories] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  const open = async (file: File | undefined) => {
    if (!file) return
    setBusy('Decoding…')
    setSaved(null)
    try {
      const { samples, sampleRate } = await decodeFile(file)
      const proposal = proposeSegments(samples, sampleRate, { maxSeconds: MAX_CLIP_SECONDS })
      setLoaded({
        name: file.name,
        samples,
        sampleRate,
        duration: samples.length / sampleRate,
        peaks: computePeaks(samples, WAVEFORM_COLUMNS),
      })
      setSegments(proposal)
      setLines(proposal.map(() => ({ title: '', text: '', ipa: '', categories: batchCategories })))
      setSelected(proposal.length ? 0 : null)
      // A playlist per upload is the common case, so name it after the file.
      setPlaylist((current) => current || file.name.replace(/\.[^.]+$/, ''))
    } catch {
      setBusy(null)
      setLoaded(null)
      window.alert("That file couldn't be read as audio or video")
      return
    }
    setBusy(null)
  }

  const playRange = (start: number, end: number) => {
    if (!loaded) return
    const url = URL.createObjectURL(sliceToWav(loaded.samples, loaded.sampleRate, start, end))
    const audio = player.current
    if (!audio) return
    audio.src = url
    setPlayhead(start)
    void audio.play()
    const started = performance.now()
    const follow = () => {
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
    setBusy('Saving…')
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
    )
    setBusy(null)
    setSaved(segments.length)
    setLoaded(null)
    setSegments([])
    setLines([])
    setSelected(null)
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
                  {video.source} · {video.timestamp} · {video.duration}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => deleteClip(video.id)}>
                  Delete clip
                </button>
              </div>
              <div className="row gap-3 wrap">
                <div className="field" style={{ flex: '1 1 220px' }}>
                  <label htmlFor={`name-${video.id}`}>Name</label>
                  <input
                    id={`name-${video.id}`}
                    className="input"
                    value={video.title}
                    onChange={(e) => updateClip(video.id, { title: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: '1 1 160px' }}>
                  <label htmlFor={`playlist-${video.id}`}>Playlist</label>
                  <input
                    id={`playlist-${video.id}`}
                    className="input"
                    value={video.playlist}
                    onChange={(e) => updateClip(video.id, { playlist: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: '1 1 160px' }}>
                  <label htmlFor={`cats-${video.id}`}>Categories</label>
                  <input
                    id={`cats-${video.id}`}
                    className="input"
                    value={formatCategories(video.categories)}
                    onChange={(e) => updateClip(video.id, { categories: parseCategories(e.target.value) })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor={`text-${video.id}`}>Line</label>
                <input
                  id={`text-${video.id}`}
                  className="input"
                  value={video.captions[0]?.text ?? ''}
                  onChange={(e) => updateClip(video.id, { line: e.target.value })}
                />
              </div>
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
        <button type="button" className="btn btn-secondary" disabled title="Needs a server to fetch and strip the audio">
          Paste a YouTube URL
        </button>
        {busy && <span style={{ fontSize: 13, opacity: 0.7 }}>{busy}</span>}
      </div>
      )}

      {saved !== null && (
        <div className="card elev-sm">
          <div className="card-kicker">Published</div>
          <div style={{ fontSize: 14 }}>{saved} clips are now in the library.</div>
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
            <WaveformEditor
              peaks={loaded.peaks}
              duration={loaded.duration}
              segments={segments}
              selected={selected}
              playhead={playhead}
              onSelect={setSelected}
              onChange={setSegments}
              onScrub={setPlayhead}
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
