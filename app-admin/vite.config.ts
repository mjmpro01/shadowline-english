import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Where the API is during development. In production nginx proxies it. */
const API = process.env.ADMIN_API_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  // Served under /admin/ on the same host as the learner app: the session
  // cookie has no Domain and the API allows exactly one CORS origin, so sharing
  // the origin is what makes signing in work with no server change at all.
  base: '/admin/',
  server: {
    port: Number(process.env.ADMIN_PORT ?? 5174),
    // Proxied rather than called across origins, which is both what nginx does
    // in production and the reason this app needs no CORS allowance of its own.
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/auth': { target: API, changeOrigin: false },
      '/files': { target: API, changeOrigin: false },
    },
  },
})
