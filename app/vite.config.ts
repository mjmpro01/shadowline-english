import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

/**
 * A fingerprint of the Arena's pictures, put on their URLs (?v=…) so a new
 * drawing reaches players on the next deploy. nginx lets browsers keep images
 * for a week; without this a browser held the old player sheet next to the
 * new player.json that describes a different one, and the farm did not draw.
 */
function gameArtVersion(dir = 'public/game'): string {
  const hash = createHash('sha256')
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) walk(path)
      else hash.update(path).update(readFileSync(path))
    }
  }
  try {
    walk(dir)
  } catch {
    return ''
  }
  return hash.digest('hex').slice(0, 10)
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The shell's variables and this folder's .env files alike: Vite reads .env
  // for the app it builds, not for its own config, so without this a
  // VITE_API_URL written in .env reached the app but not the proxy below.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  /** Where the API is during development. In production nginx proxies it. */
  const API = env.VITE_API_URL || 'http://localhost:8080'
  /** The admin console's own dev server (app-admin, `npm run dev`). */
  const CONSOLE = env.CONSOLE_URL ?? `http://localhost:${env.ADMIN_PORT ?? 5174}`

  /** What /admin answers when the console's dev server is not running, in place
   *  of an empty 502: the page and the terminal both say what to start. */
  const CONSOLE_DOWN = `The admin console's dev server is not running at ${CONSOLE}.

Start it beside this one:

  cd app-admin
  npm run dev

then reload this page.`

  return {
    plugins: [react()],
    define: { __GAME_ART__: JSON.stringify(gameArtVersion()) },
    server: {
      // One origin in development too, as nginx makes it in production: the
      // console is served under /admin/ beside the app. Without this the menu's
      // link to /admin/ fell into the app's catch-all route and landed on the
      // library, and the console's "sign in first" trip to /login went to the
      // console's own server, which has no login screen.
      //
      // The console calls /api, /auth and /files on whatever origin it is served
      // from, so those follow it here.
      proxy: {
        '/admin': {
          target: CONSOLE,
          changeOrigin: false,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              if (!('code' in err) || err.code !== 'ECONNREFUSED') return
              console.warn(`\n${CONSOLE_DOWN}\n`)
              // A websocket (the console's live reload) has no page to write to.
              if (!('writeHead' in res) || res.headersSent || res.writableEnded) return
              res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end(CONSOLE_DOWN)
            })
          },
        },
        '/api': { target: API, changeOrigin: false },
        '/auth': { target: API, changeOrigin: false },
        '/files': { target: API, changeOrigin: false },
      },
    },
  }
})
