import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { ADMIN_DSN, BLOB_ROOT, DATABASE, SERVER_DIR, serverEnv } from './environment'

/**
 * A clean database and object store for the run.
 *
 * Called from the top of playwright.config.ts rather than from globalSetup:
 * Playwright starts the webServer processes first, and the API exits
 * immediately if its database is not there.
 *
 * Playwright loads the config again in every test worker process, so this has
 * to know it is not the first one. Dropping the database a second time takes
 * the scoring worker's connection with it, and the symptom is takes that stay
 * "Measuring your pitch…" forever.
 */
export function provision(): void {
  if (process.env.TEST_WORKER_INDEX !== undefined) return

  psql(`drop database if exists ${DATABASE} with (force)`)
  psql(`create database ${DATABASE}`)

  rmSync(BLOB_ROOT, { recursive: true, force: true })
  mkdirSync(BLOB_ROOT, { recursive: true })

  // The seeder runs the migrations too, so the API finds a schema in place and
  // the library is not empty when the first test opens it.
  execFileSync('go', ['run', './cmd/seed'], { cwd: SERVER_DIR, env: serverEnv(), stdio: 'pipe' })
}

function psql(sql: string): void {
  execFileSync('psql', [ADMIN_DSN, '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' })
}
