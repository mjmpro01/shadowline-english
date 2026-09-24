import { describe, expect, it } from 'vitest'
import { looksLikeVideo } from '../src/lib/media'

/** The same cases as server/internal/api/upload_test.go. The studio decides
 *  what to show and the server decides what to cut; a file the two disagree
 *  about looks right in the studio and arrives blank. */
describe('looksLikeVideo', () => {
  it('believes a media type that says video', () => {
    expect(looksLikeVideo('video/mp4', 'lesson.mp4')).toBe(true)
    expect(looksLikeVideo('video/webm', 'lesson.webm')).toBe(true)
  })

  it('reads the name when the browser has no type to give', () => {
    // The ones that started this: browsers hand back an empty `file.type`.
    expect(looksLikeVideo('application/octet-stream', 'lesson.mkv')).toBe(true)
    expect(looksLikeVideo('application/octet-stream', 'lesson.m4v')).toBe(true)
    expect(looksLikeVideo('application/octet-stream', 'interview.MOV')).toBe(true)
    expect(looksLikeVideo('', 'episode.ts')).toBe(true)
  })

  it('trusts an audio type over any name', () => {
    expect(looksLikeVideo('audio/mpeg', 'song.mp4.mp3')).toBe(false)
    expect(looksLikeVideo('audio/wav', 'lesson.wav')).toBe(false)
  })

  it('says no when there is nothing to go on', () => {
    expect(looksLikeVideo('application/octet-stream', 'lesson')).toBe(false)
    expect(looksLikeVideo('application/octet-stream', 'notes.txt')).toBe(false)
  })
})
