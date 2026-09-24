import { API_URL, ApiError, api } from './api'

/**
 * The tutor's side of the chat.
 *
 * The model sits behind the server — 9router, in this deployment — and the key
 * never reaches the browser. What goes up is the conversation, which clip is
 * on screen and which language the app is in; the system prompt and the learner's real measurements on that clip
 * are added on the server, where nobody can edit them out.
 */

export interface TutorTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Whether this server has a tutor at all. Off unless TUTOR_API_KEY is set, and
 *  the chat is left out entirely rather than offering one that cannot answer. */
export async function tutorEnabled(): Promise<boolean> {
  try {
    const { enabled } = await api.get<{ enabled: boolean }>('/api/tutor')
    return enabled
  } catch {
    return false
  }
}

/** What the question is about, beyond its words. */
export interface TutorContext {
  /** The clip on screen, if any: the server tells the tutor the line and this
   *  learner's scores on it. */
  clipId: string | null
  /** The app's language. The tutor answers in the language the question is
   *  asked in; this is for a message that has none, like a bare English
   *  sentence to correct — which a learner reading the app in Vietnamese wants
   *  explained in Vietnamese. */
  locale: string
}

/**
 * Asks, and hands each piece of the answer to `onDelta` as it arrives.
 *
 * Streams because a tutor that shows nothing for eight seconds and then a
 * paragraph reads as broken, and one that starts writing within a second reads
 * as thinking. Resolves when the answer is complete; rejects with an ApiError
 * carrying the server's own sentence when it is refused, and quietly when
 * `signal` is aborted — the learner pressed stop, which is not a failure.
 */
export async function askTutor(
  messages: TutorTurn[],
  { clipId, locale }: TutorContext,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/api/tutor/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, locale, ...(clipId ? { clipId } : {}) }),
      signal,
    })
  } catch (err) {
    if (signal.aborted) return
    throw new ApiError(0, err instanceof Error ? 'Could not reach the server.' : String(err))
  }

  if (!response.ok || !response.body) {
    let message = response.statusText || `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* not JSON — keep the status text */
    }
    throw new ApiError(response.status, message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Events are separated by a blank line; the last piece may be half of one.
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        const line = event.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        const data = JSON.parse(line.slice('data: '.length)) as {
          delta?: string
          done?: boolean
          error?: string
        }
        if (data.error) throw new ApiError(502, data.error)
        if (data.delta) onDelta(data.delta)
        if (data.done) return
      }
    }
  } catch (err) {
    if (signal.aborted) return
    throw err
  }
}
