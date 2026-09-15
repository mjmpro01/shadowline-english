import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { colorFor, sparkPoints } from '../lib/score'
import { useApp } from '../store/context'

export function LibraryScreen() {
  const { data, importVideo, statsFor } = useApp()
  const [url, setUrl] = useState('')
  const navigate = useNavigate()

  const submitImport = (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    const video = importVideo(url)
    setUrl('')
    navigate(`/library/${video.id}/practice`)
  }

  return (
    <div className="stack gap-6">
      <h1>Library</h1>

      <form className="row gap-2 wrap" onSubmit={submitImport}>
        <input
          type="url"
          className="input"
          placeholder="Paste a YouTube Shorts / clip URL"
          style={{ flex: 1, minWidth: 220 }}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Import
        </button>
      </form>

      <div className="grid-cards">
        {data.videos.map((video) => {
          const stats = statsFor(video.id)
          const color = stats.lastScore === null ? 'var(--color-neutral-500)' : colorFor(stats.lastScore)
          return (
            <div className="card elev-sm" key={video.id} style={{ padding: 'var(--space-2)' }}>
              <button
                type="button"
                className="link-button thumb"
                onClick={() => navigate(`/library/${video.id}`)}
                aria-label={`Open analysis for ${video.title}`}
              >
                <Icon name="play" size={28} />
                <span className="tag tag-neutral thumb-tag">{video.duration}</span>
              </button>

              <button
                type="button"
                className="link-button stack"
                style={{ gap: 2 }}
                onClick={() => navigate(`/library/${video.id}`)}
              >
                <span className="card-title clamp-2" style={{ fontSize: 15, marginTop: 'var(--space-2)' }}>
                  {video.title}
                </span>
                <span className="card-meta">{video.source}</span>
                <span className="row between gap-2" style={{ marginTop: 2 }}>
                  <span className="score-big" style={{ color }}>
                    {stats.lastScore ?? '—'}
                  </span>
                  <svg width="56" height="20" viewBox="0 0 56 20" aria-hidden="true">
                    <polyline points={sparkPoints(stats.sparkline)} fill="none" stroke={color} strokeWidth="2" />
                  </svg>
                </span>
                <span className="card-meta">{stats.attempts} takes</span>
              </button>

              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ marginTop: 2 }}
                onClick={() => navigate(`/library/${video.id}/practice`)}
              >
                <Icon name="mic" size={14} />
                Practice
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
