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

/**
 * The console: a separate build, served under /admin/ on the same host in
 * production and by its own dev server here.
 *
 * A different port and the same host on purpose. Cookies ignore the port, so one
 * sign-in covers both — which is the point of serving the console on the app's
 * origin rather than on a subdomain.
 */
export const ADMIN_PORT = Number(process.env.E2E_ADMIN_PORT ?? 5174)
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`

/** A database of the test run's own, created and dropped by the global setup. */
export const DATABASE = process.env.E2E_DATABASE ?? 'shadowline_e2e'

/** Where to connect to create and drop that database. */
export const ADMIN_DSN =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres'

export const DATABASE_URL = ADMIN_DSN.replace(/\/[^/?]*(\?|$)/, `/${DATABASE}$1`)

export const REPO_ROOT = join(import.meta.dirname, '../..')
export const SERVER_DIR = join(REPO_ROOT, 'server')
export const SCORING_DIR = join(REPO_ROOT, 'scoring')
export const ADMIN_DIR = join(REPO_ROOT, 'app-admin')

/** Object storage on disk: MinIO is not worth a container for a test run. */
export const BLOB_ROOT = join(process.cwd(), 'test-results', 'blobs')

/** The stand-in for 9router, in `fake-router.mjs`. */
export const ROUTER_PORT = Number(process.env.FAKE_ROUTER_PORT ?? 8199)
export const ROUTER_URL = `http://localhost:${ROUTER_PORT}`

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
    // The tutor talks to the fake router, never to a real model: those cost
    // money and answer differently every time.
    TUTOR_API_URL: `${ROUTER_URL}/v1`,
    TUTOR_API_KEY: 'e2e-router-key',
    TUTOR_MODEL: 'e2e/fake-model',
  }
}
