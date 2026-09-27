import { useCallback, useEffect, useRef, useState } from 'react'
import { useRemote } from '../lib/remote'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { ThumbnailStrip } from '../components/ThumbnailStrip'
import { WaveformEditor } from '../components/WaveformEditor'
import { MAX_CLIP_SECONDS, type Transcript } from '../data/types'
import { publishClips, type PublishProgress } from '../lib/publish'
import { looksLikeVideo } from '../lib/media'
import { decodeFile, peaks as computePeaks } from '../lib/audio/decode'
import { proposeSegments, type Segment } from '../lib/audio/segment'
import { clipName, parseCategories } from '../lib/clips'
import { sliceToWav } from '../lib/audio/wav'
import { ipaOf, lineOf, wordsBetween } from '../lib/transcript'
import { extractFrames } from '../lib/video/frames'
import { readDraft, saveDraft, type StudioLine, type StudioLoaded } from '../lib/studioDraft'
import { repository } from '../repository'

const WAVEFORM_COLUMNS = 900
/** Slots on the filmstrip. Enough to show a change of speaker on a wide screen,
 *  few enough that walking a long file does not take all day — each one is a
 *  seek, and seeks are the slow part. */
const FILMSTRIP_SLOTS = 28

/** How often to ask whether the transcript is ready. Whisper takes minutes on
 *  a long recording, so asking more often only adds requests. */
const TRANSCRIPT_POLL_MS = 3000

/**
 * `include` is whether this clip goes to the library when the batch is
 * published — distinct from `selected`, which is the one clip the timeline is
 * focused on. Every proposal starts included, because a short recording is
 * usually published whole; a fifty-minute one proposes hundreds of cuts and
 * most of them are not dialogue worth shadowing, which is what the bulk
 * controls are for.
 */
type Line = StudioLine
type Loaded = StudioLoaded

const EMPTY_LINE: Omit<Line, 'categories'> = { title: '', text: '', ipa: '', include: true }

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`
}

/** Floored to tenths like the timestamps beside it, so a boundary reads the same in both. */
function lengthLabel(seconds: number): string {
  return (Math.floor(seconds * 10) / 10).toFixed(1)
}

export function Cut() {
  const t = useT()
  const fileInput = useRef<HTMLInputElement>(null)
  const player = useRef<HTMLAudioElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  /** Identifies the current playback. A second Play while one is running would
   *  otherwise leave two loops moving the same playhead. */
  const playing = useRef(0)

  // What the studio was in the middle of when it was last left. Read once: from
  // here on this screen's own state is the truth, and the effect below writes it
  // back out.
  const left = useRef(readDraft()).current

  const [loaded, setLoaded] = useState<Loaded | null>(left?.loaded ?? null)
  const [segments, setSegments] = useState<Segment[]>(left?.segments ?? [])
  const [lines, setLines] = useState<Line[]>(left?.lines ?? [])
  const [playlist, setPlaylist] = useState(left?.playlist ?? '')
  const [batchCategories, setBatchCategories] = useState(left?.batchCategories ?? '')
  const [selected, setSelected] = useState<number | null>(left?.selected ?? null)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /** How far publishing has got, so a long batch is visibly moving. */
  const [progress, setProgress] = useState<PublishProgress | null>(null)
  /** What went wrong publishing. Publishing used to have no catch at all: a
   *  failure left "Saving…" on screen for good and said nothing. */
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  /** Clips in the last batch whose audio never made it up. */
  const [savedSilent, setSavedSilent] = useState(0)
  /** Whether the batch just published is having its video cut. */
  const [savedVideo, setSavedVideo] = useState(false)
  // Whether the batch is being cut on the server — its sound, and its picture
  // when there is one — rather than having gone up already cut.
  const [savedOnServer, setSavedOnServer] = useState(false)
  const [frames, setFrames] = useState<(string | null)[]>(left?.frames ?? [])
  /** The upload on the server, which the transcript and the cut both hang off.
   *  Null while it is still going up, or if it failed. */
  const [sourceId, setSourceId] = useState<string | null>(left?.sourceId ?? null)
  /** In-flight upload promise so Publish can wait for the id the cutter needs
   *  instead of racing a large file and saving audio-only by accident. */
  const sourceUpload = useRef<Promise<string | null>>(left?.upload ?? Promise.resolve(null))
  const [sourceUploading, setSourceUploading] = useState(left?.sourceUploading ?? false)
  const [transcript, setTranscript] = useState<Transcript | null>(left?.transcript ?? null)
  /** The recording whose filmstrip has already been walked. */
  const walked = useRef<string | null>(left?.walked ?? null)

  // Back out to the draft on every change, so leaving this screen and coming
  // back finds the cut where it was rather than an empty studio.
  useEffect(() => {
    saveDraft(
      loaded
        ? {
            loaded,
            segments,
            lines,
            playlist,
            batchCategories,
            selected,
            frames,
            sourceId,
            sourceUploading,
            transcript,
            upload: sourceUpload.current,
            walked: walked.current,
          }
        : null,
    )
  }, [
    loaded,
    segments,
    lines,
    playlist,
    batchCategories,
    selected,
    frames,
    sourceId,
    sourceUploading,
    transcript,
  ])

  const open = async (file: File | undefined) => {
    if (!file) return
    setBusy(t('studio.decoding'))
    setSaved(null)
    // The strip's slots exist from the moment a video is chosen, so it shows
    // as an empty filmstrip filling in rather than appearing once it is done.
    setFrames(looksLikeVideo(file.type, file.name) ? Array.from({ length: FILMSTRIP_SLOTS }, () => null) : [])
    setSourceId(null)
    setSourceUploading(true)
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
        // Not `file.type` alone: it is empty for .mkv, .m4v and .ts, and
        // the server has to reach the same answer or the cut never happens.
        isVideo: looksLikeVideo(file.type, file.name),
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
      // Two calls: the row is written before a byte is sent, so a transfer still
      // running shows in the upload history and one that dies leaves a reason
      // behind rather than nothing at all.
      //
      // `sourceId` is set only once the file has landed, which is what the rest
      // of this screen depends on. Nothing is queued until then — so a transcript
      // poll started earlier would find no job and no words and report that as a
      // failure — and a clip published against a recording that never arrived
      // would queue a cut with nothing to cut.
      //
      // The studio stays interactive throughout; Publish awaits the promise so a
      // quick split-and-publish cannot race past the id.
      const upload = repository
        .createUpload(file, samples.length / sampleRate)
        .then(async (id) => {
          await repository.sendUpload(id, file)
          setSourceId(id)
          setSourceUploading(false)
          return id
        })
        .catch(() => {
          setSourceUploading(false)
          setTranscript({ status: 'failed', language: '', words: [] })
          return null
        })
      sourceUpload.current = upload
    } catch {
      URL.revokeObjectURL(url)
      setBusy(null)
      setSourceUploading(false)
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
    // Already walked, and the frames came back with the draft: seeking through
    // the whole file again for pictures that are on screen would be minutes of
    // work to arrive at what is already there.
    if (walked.current === loaded.url) return
    const controller = new AbortController()
    const url = loaded.url
    void extractFrames({
      url,
      duration: loaded.duration,
      count: FILMSTRIP_SLOTS,
      onFrame: ({ index, src }) =>
        setFrames((previous) => {
          const next = previous.slice()
          next[index] = src
          return next
        }),
      signal: controller.signal,
    }).then(() => {
      // Only a walk that finished counts. An abandoned one leaves gaps, and
      // coming back should fill them rather than keep them.
      if (!controller.signal.aborted) walked.current = url
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

    setBusy(t('studio.saving'))
    setFailure(null)
    setProgress({ stage: 'clips', done: 0, total: chosen.length })

    let result
    try {
      // Wait out an in-flight upload: sourceId state can still be null while the
      // promise is about to resolve, and publishing without it skips the cut.
      const uploadedId = sourceId ?? (await sourceUpload.current)
      result = await publishClips(
        chosen.map(({ segment, line }) => ({
          title: line.title.trim(),
          line: line.text.trim(),
          ipa: line.ipa.trim(),
          source: loaded.name,
          playlist: playlist.trim() || loaded.name,
          categories: parseCategories(line.categories),
          start: segment.start,
          end: segment.end,
          // Cut on the server when the recording is there: the cutter reads
          // it for the picture already, and slicing here meant uploading 220 MB
          // of WAV for a batch of four hundred. Sliced here only when the
          // recording never made it up, so the clips still have a sound.
          audio: uploadedId
            ? undefined
            : sliceToWav(loaded.samples, loaded.sampleRate, segment.start, segment.end),
        })),
        // Already on the server since the file was opened, so publishing sends
        // an id rather than the recording all over again.
        uploadedId,
        setProgress,
      )
    } catch (error) {
      // The cut stays exactly as it was. Whatever went wrong, the admin's hour
      // of work on the boundaries and the lines is not what should pay for it.
      setBusy(null)
      setProgress(null)
      setFailure(error instanceof Error ? error.message : String(error))
      return
    }

    setBusy(null)
    setProgress(null)
    setSaved(result.published)
    setSavedSilent(result.withoutAudio)
    setSavedVideo(loaded.isVideo)
    setSavedOnServer(result.cutOnServer)
    setLoaded((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return null
    })
    setSegments([])
    setLines([])
    setSelected(null)
    setFrames([])
    setSourceId(null)
    setSourceUploading(false)
    sourceUpload.current = Promise.resolve(null)
    setTranscript(null)
  }

  // Where the numbering starts, asked of the server: it is a fact about the
  // playlist, and the app no longer holds the playlist. Falls back to 1 while
  // the answer is in flight, which is what an empty playlist would say anyway.
  const numberFrom = useRemote(playlist.trim() || loaded?.name || '', (name) =>
    repository.nextClipNumber(name),
  )
  const firstNumber = numberFrom.state === 'ready' ? numberFrom.value : 1

  const included = lines.filter((line) => line.include).length

  // The name each unnamed clip will carry, worked out the way publishing works
  // it out: numbered across the selected clips only, continuing from what the
  // playlist already holds. Shown as the placeholder so the studio is not
  // promising one thing and saving another.
  const clipNumbers: number[] = []
  let nextNumber = firstNumber
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
        <h1 style={{ marginBottom: 2 }}>{t('studio.title')}</h1>
        <div className="card-meta">
          {t('studio.subtitle')}
        </div>
      </div>

      <div className="row gap-3 wrap">
        <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
          {t('studio.upload')}
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
        <button type="button" className="btn btn-secondary" disabled title={t('studio.youtubeSoon')}>
          {t('studio.youtube')}
        </button>
        {busy && (
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            {progress
              ? progress.stage === 'clips'
                ? t('studio.savingClips', progress.done, progress.total)
                : t('studio.savingAudio', progress.done, progress.total)
              : busy}
          </span>
        )}
      </div>

      {/* What the screen looked like before a file is chosen: two buttons on an
          empty page, with nothing saying what pressing one leads to. An admin
          opening this for the first time has no idea whether it wants a
          three-second clip or an hour-long lecture, or that the lines write
          themselves. Four steps is the whole answer. */}
      {!loaded && !busy && (
        <div className="card elev-sm stack gap-3" style={{ maxWidth: 640 }}>
          <div className="card-kicker">{t('studio.stepsKicker')}</div>
          <ol className="studio-steps">
            <li>
              <b>{t('studio.step1Title')}</b> {t('studio.step1')}
            </li>
            <li>
              <b>{t('studio.step2Title')}</b> {t('studio.step2')}
            </li>
            <li>
              <b>{t('studio.step3Title')}</b> {t('studio.step3')}
            </li>
            <li>
              <b>{t('studio.step4Title')}</b> {t('studio.step4')}
            </li>
          </ol>
          <div className="card-meta">
            {t('studio.stepsFooter')}
          </div>
        </div>
      )}

      {failure !== null && (
        <div className="card elev-sm stack gap-2" style={{ maxWidth: 640 }}>
          <div className="card-kicker">{t('studio.publishFailed')}</div>
          <div style={{ fontSize: 14 }}>{failure}</div>
          {/* Said out loud, because the obvious fear on seeing this is that the
              hour of cutting went with it. */}
          <div className="card-meta">{t('studio.publishFailedKept')}</div>
        </div>
      )}

      {saved !== null && (
        <div className="card elev-sm">
          <div className="card-kicker">{t('studio.published')}</div>
          <div style={{ fontSize: 14 }}>{t('studio.publishedBody', saved)}</div>
          {savedSilent > 0 && (
            <div className="card-meta">{t('studio.publishedSilent', savedSilent)}</div>
          )}
          {savedOnServer && <div className="card-meta">{t('studio.cutOnServer', savedVideo)}</div>}
        </div>
      )}

      {loaded && (
        <>
          <div className="row gap-3 wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="playlist">{t('studio.playlist')}</label>
              <input
                id="playlist"
                className="input"
                placeholder={t('studio.playlistHint')}
                value={playlist}
                onChange={(e) => setPlaylist(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="batch-categories">{t('studio.batchCategories')}</label>
              <input
                id="batch-categories"
                className="input"
                placeholder={t('studio.batchCategoriesHint')}
                value={batchCategories}
                onChange={(e) => setBatchCategories(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-secondary" onClick={applyCategoriesToAll}>
              {t('studio.applyToAll')}
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
                {transcript === null && t('studio.listening')}
                {transcript?.status === 'pending' &&
                  t('studio.transcribing')}
                {transcript?.status === 'ready' &&
                  `Transcribed ${transcript.words.length} words. Empty lines have been filled in — check them.`}
                {transcript?.status === 'failed' &&
                  t('studio.noTranscript')}
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
                      <label htmlFor={`title-${index}`}>{t('studio.nameOptional')}</label>
                      <input
                        id={`title-${index}`}
                        className="input"
                        placeholder={
                          clipNumbers[index] ? clipName(clipNumbers[index]) : t('studio.namedWhenPublished')
                        }
                        value={lines[index]?.title ?? ''}
                        onChange={(e) => update(index, { title: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ flex: '1 1 200px' }}>
                      <label htmlFor={`categories-${index}`}>{t('studio.categories')}</label>
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
            disabled={
              included === 0 ||
              tooLong > 0 ||
              busy !== null ||
              (loaded.isVideo && sourceUploading)
            }
            onClick={() => void publish()}
          >
            {loaded.isVideo && sourceUploading
              ? 'Uploading recording…'
              : `Publish ${included} clips to the library`}
          </button>
        </>
      )}

      <audio ref={player} hidden />
    </div>
  )
}
