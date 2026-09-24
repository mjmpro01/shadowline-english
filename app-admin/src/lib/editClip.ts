import type { CaptionLine, Video } from '../data/types'
import { repository } from '../repository'

/**
 * A clip edit in the words the studio's fields use.
 *
 * The API takes a captions array; the studio edits one line and one IPA, which
 * is the first caption. Translating between the two used to happen in the
 * learner app's store, because that is where the clip being edited was cached.
 * The row is right here now, so this is a function of the row.
 */
export interface ClipEdit {
  title?: string
  playlist?: string
  categories?: string[]
  featured?: boolean
  line?: string
  ipa?: string
}

export function editClip(video: Video, edit: ClipEdit): Promise<Video> {
  const { line, ipa, ...rest } = edit
  const [first] = video.captions
  // Untouched unless one of the two was given: sending the captions back
  // unchanged would overwrite a second caption line somebody else had added.
  const captions: CaptionLine[] | undefined =
    line === undefined && ipa === undefined
      ? undefined
      : [
          { text: line ?? first?.text ?? '', ipa: ipa ?? first?.ipa ?? '' },
          ...video.captions.slice(1),
        ]
  return repository.updateClip(video.id, { ...rest, captions })
}
