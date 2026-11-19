/**
 * The HTTP client. Every request carries the session cookie, and every failure
 * arrives as an ApiError with the server's own message — the screens show that
 * text, so a vague one here becomes a vague one on screen.
 */

/**
 * Always this origin.
 *
 * Unlike the learner app, the console has no setting for where the API is: nginx
 * proxies /api and /auth to it in production and Vite's dev proxy does the same
 * here. That is deliberate rather than incidental — calling the API cross-origin
 * would need a CORS allowance the server grants to exactly one origin, and the
 * session cookie has no Domain, so a console that reached past its own origin
 * would arrive without a session anyway.
 */
export const API_URL = ''

export class ApiError extends Error {
  readonly status: number
  /** The server's code for what went wrong, like `upload.tooLong`, when it
   *  gave one: what a page tells apart, as the message is for people. */
  readonly code: string

  constructor(status: number, message: string, code = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** True when the session has expired or was never there. */
  get unauthorized(): boolean {
    return this.status === 401
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_URL + path, { credentials: 'include', ...init })
  } catch {
    // fetch only rejects for network-level failures, which from the learner's
    // side means the server is not there.
    throw new ApiError(0, 'Could not reach the server.')
  }

  if (!response.ok) {
    const { message, code } = await errorBody(response)
    throw new ApiError(response.status, message, code)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function errorBody(response: Response): Promise<{ message: string; code: string }> {
  try {
    const body = (await response.json()) as { error?: string; code?: string }
    if (body.error) return { message: body.error, code: body.code ?? '' }
  } catch {
    /* not JSON — fall through to the status text */
  }
  return { message: response.statusText || `Request failed (${response.status})`, code: '' }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),

  send: <T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown) =>
    request<T>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Uploads a recording as the raw request body; there is only ever one file. */
  upload: <T>(method: 'POST' | 'PUT', path: string, blob: Blob) =>
    request<T>(path, {
      method,
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    }),
}
