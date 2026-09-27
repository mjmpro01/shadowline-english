import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Where the API is during development. In production nginx proxies it. */
const API = process.env.VITE_API_URL || 'http://localhost:8080'
/** The admin console's own dev server (app-admin, `npm run dev`). */
const CONSOLE = process.env.CONSOLE_URL ?? `http://localhost:${process.env.ADMIN_PORT ?? 5174}`

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
      '/admin': { target: CONSOLE, changeOrigin: false, ws: true },
      '/api': { target: API, changeOrigin: false },
      '/auth': { target: API, changeOrigin: false },
      '/files': { target: API, changeOrigin: false },
    },
  },
})
