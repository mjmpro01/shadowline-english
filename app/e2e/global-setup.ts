import { spawn, type ChildProcess } from 'node:child_process'
import { SCORING_DIR, serverEnv } from './environment'

const workers: ChildProcess[] = []

/**
 * Starts the two background workers.
 *
 * The API and the dev server are Playwright's own webServer entries, which it
 * waits on by polling a URL. Neither worker has a port to poll, so they live
 * here. They are separate processes in production for the same reason they are
 * separate here: a cut holds a CPU for seconds and a learner is waiting on a
 * score.
 */
export default async function globalSetup(): Promise<void> {
  start('shadowline.worker', 'takes will never be scored')
  start('shadowline.cutter', 'published clips will never get their video')
  start('shadowline.dubber', 'exported dubs will never be produced')
}

function start(module: string, consequence: string): void {
  const worker = spawn('python3', ['-m', module], {
    cwd: SCORING_DIR,
    env: serverEnv(),
    stdio: 'inherit',
  })
  worker.on('exit', (code) => {
    if (code) console.error(`${module} exited with ${code} — ${consequence}`)
  })
  workers.push(worker)
}

export function stopWorker(): void {
  for (const worker of workers) worker.kill('SIGTERM')
}
