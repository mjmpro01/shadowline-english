import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Where the API is during development. In production nginx proxies it. */
const API = process.env.VITE_API_URL || 'http://localhost:8080'
/** The admin console's own dev server (app-admin, `npm run dev`). */
const CONSOLE = process.env.CONSOLE_URL ?? `http://localhost:${process.env.ADMIN_PORT ?? 5174}`

/** What /admin answers when the console's dev server is not running, in place
 *  of an empty 502: the page and the terminal both say what to start. */
const CONSOLE_DOWN = `The admin console's dev server is not running at ${CONSOLE}.

Start it beside this one:

  cd app-admin
  npm run dev

then reload this page.`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
})
