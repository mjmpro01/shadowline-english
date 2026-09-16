import { spawn, type ChildProcess } from 'node:child_process'
import { SCORING_DIR, serverEnv } from './environment'

let worker: ChildProcess | undefined

/**
 * Starts the scoring worker.
 *
 * The API and the dev server are Playwright's own webServer entries, which it
 * waits on by polling a URL. The worker has no port to poll, so it lives here.
 */
export default async function globalSetup(): Promise<void> {
  worker = spawn('python3', ['-m', 'shadowline.worker'], {
    cwd: SCORING_DIR,
    env: serverEnv(),
    stdio: 'inherit',
  })
  worker.on('exit', (code) => {
    if (code) console.error(`scoring worker exited with ${code} — takes will never be scored`)
  })
}

export function stopWorker(): void {
  worker?.kill('SIGTERM')
}
