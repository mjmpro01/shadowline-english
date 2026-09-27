import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Paths this dev server answers itself, or passes to the API. */
const OWN = ['/admin', '/api', '/auth', '/files']

/**
 * Sends everything that is not the console's to the learner app's dev server.
 *
 * In production the two are one origin and nginx serves both. Here the console
 * has a server of its own, and it has no /login and no /dashboard: a signed-out
 * visit to :5174/admin/ was sent to :5174/login and got Vite's "did you mean
 * /admin/login" page, and "Back to the app" went nowhere. A redirect to the
 * app's server fixes both, and the session cookie follows, because a cookie is
 * shared across ports on one host.
 */
function learnerAppRedirect(appUrl: string): Plugin {
  return {
    name: 'learner-app-redirect',
    configureServer(server) {
      // Registered directly rather than returned, so it runs before Vite's own
      // base-path check turns the request into that error page.
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/'
        if (OWN.some((path) => url === path || url.startsWith(`${path}/`) || url.startsWith(`${path}?`))) {
          return next()
        }
        res.statusCode = 302
        res.setHeader('Location', appUrl + url)
        res.end()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // The shell's variables and this folder's .env files alike: Vite reads .env
  // for the app it builds, not for its own config, so without this an
  // ADMIN_API_URL written in .env was silently ignored.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  /** Where the API is during development. In production nginx proxies it. */
  const API = env.ADMIN_API_URL ?? 'http://localhost:8080'
  /** The learner app's dev server, which owns /login and everything else. */
  const APP = env.APP_URL ?? 'http://localhost:5173'

  return {
    plugins: [react(), learnerAppRedirect(APP)],
    // Served under /admin/ on the same host as the learner app: the session
    // cookie has no Domain and the API allows exactly one CORS origin, so sharing
    // the origin is what makes signing in work with no server change at all.
    base: '/admin/',
    server: {
      port: Number(env.ADMIN_PORT ?? 5174),
      // Proxied rather than called across origins, which is both what nginx does
      // in production and the reason this app needs no CORS allowance of its own.
      proxy: {
        '/api': { target: API, changeOrigin: false },
        '/auth': { target: API, changeOrigin: false },
        '/files': { target: API, changeOrigin: false },
      },
    },
  }
})
