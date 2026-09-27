import { beforeEach, describe, expect, it, vi } from 'vitest'

// The repository is the network; these tests are about what publishing asks of
// it, so it is replaced with one that records.
const calls = vi.hoisted(() => ({ created: 0, audio: [] as string[], failAudio: new Set<string>() }))

vi.mock('../src/repository', () => ({
  repository: {
    nextClipNumber: async () => 1,
    createClips: async (clips: unknown[]) =>
      clips.map(() => ({ id: `clip-${++calls.created}` })),
    uploadClipAudio: async (id: string) => {
      if (calls.failAudio.has(id)) throw new Error('refused')
      calls.audio.push(id)
    },
  },
}))

import { publishClips, type NewClip } from '../src/lib/publish'

function clip(audio?: Blob): NewClip {
  return {
    title: '',
    line: 'One step at a time',
    ipa: '',
    source: 'lecture.mp4',
    playlist: 'Lectures',
    categories: [],
    start: 0,
    end: 2,
    audio,
  }
}

describe('publishing a batch', () => {
  beforeEach(() => {
    calls.created = 0
    calls.audio = []
    calls.failAudio.clear()
  })

  it('sends no audio when the recording is on the server to be cut there', async () => {
    const result = await publishClips([clip(), clip()], 'source-1')
    expect(result).toEqual({ published: 2, withoutAudio: 0, cutOnServer: true })
    expect(calls.audio).toEqual([])
  })

  it('sends the sliced audio when the recording never reached the server', async () => {
    const wav = new Blob(['RIFF'], { type: 'audio/wav' })
    calls.failAudio.add('clip-2')
    const result = await publishClips([clip(wav), clip(wav), clip(wav)], null)
    expect(calls.audio.sort()).toEqual(['clip-1', 'clip-3'])
    expect(result).toEqual({ published: 3, withoutAudio: 1, cutOnServer: false })
  })
})
