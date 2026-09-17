import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { allCategories, allPlaylists, searchClips } from '../lib/clips'
import { colorFor, sparkPoints } from '../lib/score'
import { clock } from '../lib/time'
import { useApp } from '../store/context'

export function LibraryScreen() {
  const { data, statsFor } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [playlist, setPlaylist] = useState('')

  const categories = allCategories(data.videos)
  const playlists = allPlaylists(data.videos)
  const results = searchClips(data.videos, { query, category, playlist })

  return (
    <div className="stack gap-6">
      <h1>Library</h1>

      <input
        type="search"
        className="input"
        placeholder="Search clips, lines, playlists"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search clips"
      />

      {playlists.length > 0 && (
        <div className="row gap-2 wrap">
          <button
            type="button"
            className={`btn ${playlist === '' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPlaylist('')}
          >
            All playlists
          </button>
          {playlists.map((name) => (
            <button
              type="button"
              key={name}
              className={`btn ${playlist === name ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPlaylist(playlist === name ? '' : name)}
            >
              {name}
            </button>
          ))}
          {/* Filtering shows the clips; opening shows the episode. Two hundred
              cards from one film say nothing about the order they were spoken
              in or where you left off, and that is what a playlist is. */}
          {playlist !== '' && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate(`/library/playlist/${encodeURIComponent(playlist)}`)}
            >
              Open as playlist
              <Icon name="chevron-right" />
            </button>
          )}
        </div>
      )}

      {categories.length > 0 && (
        <div className="row gap-2 wrap">
          {categories.map((name) => (
            <button
              type="button"
              key={name}
              className={category === name ? 'tag tag-accent' : 'tag tag-neutral'}
              style={{ cursor: 'pointer', border: 'none' }}
              onClick={() => setCategory(category === name ? '' : name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {results.length === 0 && (
        <div className="card-meta">Nothing matches that — try another word, or clear the filters.</div>
      )}

      <div className="grid-cards">
        {results.map((video) => {
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
                {/* The still when the cutter has made one; the icon otherwise,
                    which is every clip cut from audio and every one whose cut
                    is still queued. */}
                {video.posterUrl ? (
                  <img className="thumb-poster" src={video.posterUrl} alt="" loading="lazy" />
                ) : (
                  <Icon name="play" size={28} />
                )}
                <span className="tag tag-neutral thumb-tag">{clock(video.durationSeconds)}</span>
              </button>

              <button
                type="button"
                className="link-button stack"
                style={{ gap: 2 }}
                onClick={() => navigate(`/library/${video.id}`)}
                // Without this the button's name is the whole card read aloud:
                // title, playlist, score and take count run together.
                aria-label={video.title}
              >
                <span className="card-title clamp-2" style={{ fontSize: 15, marginTop: 'var(--space-2)' }}>
                  {video.title}
                </span>
                <span className="card-meta">{video.playlist || video.source}</span>
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
