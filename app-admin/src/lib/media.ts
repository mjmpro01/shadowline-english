/**
 * Whether an upload has a picture in it.
 *
 * The browser's own `file.type` first, because when it knows one it is right.
 * But it often does not: it is empty for `.mkv`, `.m4v`, `.ts` and half a dozen
 * other containers, and an empty type used to mean the studio showed no
 * picture, queued no cut, and published clips that reached their learners with
 * nothing to watch — silently, because as far as the app was concerned nothing
 * had gone wrong.
 *
 * This is the same rule as `looksLikeVideo` in
 * `server/internal/api/clips.go`, and has to stay that way: the studio decides
 * what to show, the server decides what to cut, and a file the two disagree
 * about is one that looks right in the studio and arrives blank.
 * `test/media.test.ts` and `server/internal/api/upload_test.go` pin the same
 * cases on both sides.
 */
const VIDEO_EXTENSIONS = [
  '.mkv', '.m4v', '.mov', '.avi', '.wmv', '.flv', '.ts', '.mts', '.m2ts',
  '.mpg', '.mpeg', '.3gp', '.ogv', '.webm', '.mp4',
]

export function looksLikeVideo(contentType: string, name: string): boolean {
  if (contentType.startsWith('video/')) return true
  // An audio type is trusted over any name: somebody who uploads
  // `song.mp4.mp3` has uploaded an mp3.
  if (contentType.startsWith('audio/')) return false
  const lower = name.toLowerCase()
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
