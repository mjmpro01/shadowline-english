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

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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
    throw new ApiError(response.status, await errorMessage(response))
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    /* not JSON — fall through to the status text */
  }
  return response.statusText || `Request failed (${response.status})`
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
