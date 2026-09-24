/**
 * The HTTP client. Every request carries the session cookie, and every failure
 * arrives as an ApiError with the server's own message — the screens show that
 * text, so a vague one here becomes a vague one on screen.
 */

/** Where the API lives. Set VITE_API_URL when it is not the same origin. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

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
    if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
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

export function registerWithPassword(email: string, password: string, name?: string) {
  return api.send<{ user: unknown }>('POST', '/auth/register', { email, password, name })
}

export function forgotPassword(email: string) {
  return api.send<void>('POST', '/auth/forgot', { email })
}
