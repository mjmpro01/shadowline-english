/**
 * Where the browser tests find the stack.
 *
 * The API and the worker are real processes against a real Postgres: the parts
 * these tests exist to check — signing in, scoring, one learner not seeing
 * another's takes — are all server behaviour, and a mocked API would assert
 * only that the mock matches itself.
 */
import { join } from 'node:path'

export const API_PORT = Number(process.env.E2E_API_PORT ?? 8099)
export const API_URL = `http://localhost:${API_PORT}`
export const APP_PORT = Number(process.env.E2E_APP_PORT ?? 5173)
export const APP_URL = `http://localhost:${APP_PORT}`

/** A database of the test run's own, created and dropped by the global setup. */
export const DATABASE = process.env.E2E_DATABASE ?? 'shadowline_e2e'

/** Where to connect to create and drop that database. */
export const ADMIN_DSN =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres'

export const DATABASE_URL = ADMIN_DSN.replace(/\/[^/?]*(\?|$)/, `/${DATABASE}$1`)

export const REPO_ROOT = join(import.meta.dirname, '../..')
export const SERVER_DIR = join(REPO_ROOT, 'server')
export const SCORING_DIR = join(REPO_ROOT, 'scoring')

/** Object storage on disk: MinIO is not worth a container for a test run. */
export const BLOB_ROOT = join(process.cwd(), 'test-results', 'blobs')

export const ADMIN_EMAIL = 'admin@example.com'
export const LEARNER_EMAIL = 'minh@example.com'

/** Shared by the API and the worker, so both read the same objects. */
export function serverEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL,
    SESSION_SECRET: 'e2e-session-secret-at-least-32-chars',
    // The tests cannot hold real Google credentials, so the provider is faked
    // and the whole login path — state, PKCE, cookie, ADMIN_EMAILS — still runs.
    AUTH_FAKE: '1',
    DISK_ROOT: BLOB_ROOT,
    S3_ENDPOINT: '',
    ADDR: `:${API_PORT}`,
    APP_ORIGIN: APP_URL,
    OAUTH_REDIRECT_URL: `${API_URL}/auth/google/callback`,
    ADMIN_EMAILS: ADMIN_EMAIL,
    LOG_LEVEL: 'WARNING',
  }
}
