/**
 * The HTTP client. Every request carries the session cookie, and every failure
 * arrives as an ApiError with the server's own message — the screens show that
 * text, so a vague one here becomes a vague one on screen.
 */

/** Where the API lives. Set VITE_API_URL when it is not the same origin. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export class ApiError extends Error {
  readonly status: number
  /** The server's stable name for the error, when it gave one: what the app
   *  translates by (lib/errors.ts), where the message is English. */
  readonly code: string | undefined
  /** Seconds the server asked to wait, from Retry-After. */
  readonly retryAfter: number | undefined

  constructor(status: number, message: string, code?: string, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
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

  if (!response.ok) throw await errorFrom(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** The ApiError a failed response describes: its message, its code if it has
 *  one, and how long it asked to be left alone. */
export async function errorFrom(response: Response): Promise<ApiError> {
  let message = response.statusText || `Request failed (${response.status})`
  let code: string | undefined
  try {
    const body = (await response.json()) as { error?: string; code?: string }
    if (body.error) message = body.error
    code = body.code
  } catch {
    /* not JSON — keep the status text */
  }
  const wait = Number(response.headers.get('Retry-After'))
  return new ApiError(response.status, message, code, Number.isFinite(wait) && wait > 0 ? wait : undefined)
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),

  send: <T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body: unknown) =>
    request<T>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** A response as a file rather than as JSON to read: for something the
   *  learner saves, like their own data. */
  async file(path: string): Promise<Blob> {
    let response: Response
    try {
      response = await fetch(API_URL + path, { credentials: 'include' })
    } catch {
      throw new ApiError(0, 'Could not reach the server.')
    }
    if (!response.ok) throw await errorFrom(response)
    return response.blob()
  },

  /** Uploads a recording as the raw request body; there is only ever one file. */
  upload: <T>(method: 'POST' | 'PUT', path: string, blob: Blob) =>
    request<T>(path, {
      method,
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    }),
}

/** Where the "Continue with Google" button sends the browser. */
export function loginURL(): string {
  return `${API_URL}/auth/google/start`
}

export function loginWithPassword(email: string, password: string) {
  return api.send<{ user: unknown }>('POST', '/auth/login', { email, password })
}

/** Signs the new account in, or — where the server requires confirmed
 *  addresses — answers `verify` and mails a link instead. */
export function registerWithPassword(email: string, password: string, name?: string) {
  return api.send<{ user?: unknown; verify?: boolean }>('POST', '/auth/register', { email, password, name })
}

export function forgotPassword(email: string) {
  return api.send<void>('POST', '/auth/forgot', { email })
}
