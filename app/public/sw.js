/**
 * The service worker, and it is deliberately the smallest one that does any
 * good.
 *
 * Shadowline is useless offline: the clips, the takes and the scores all live
 * on the server, and no amount of caching makes a recording scoreable on a
 * train. So this does not pretend to be an offline app. It does two things.
 *
 * It makes the app installable, which is the point — on a phone, a home-screen
 * icon and a window with no browser chrome is most of what "an app" means to
 * somebody practising on the way to work.
 *
 * And it makes a second visit open from disk rather than from the network.
 *
 * Network-first, always, for everything it touches. A cache-first worker is
 * how an app ships an update that nobody receives; this one only reaches for
 * the cache when the network has actually failed, so a deploy is picked up the
 * next time anybody opens the app online.
 */
const VERSION = 'shadowline-v1'

// Nothing here is ever cached. The API carries a session and answers per
// learner; `/files/` is signed and expires; `/auth/` is a redirect dance.
// Serving any of it from a cache would be serving somebody else's answer, or
// yesterday's.
const NEVER = [/^\/api\//, /^\/auth\//, /^\/files\//, /^\/healthz$/, /^\/metrics$/]

self.addEventListener('install', () => {
  // No precache list: Vite hashes its filenames at build time and a list
  // written by hand here would be wrong by the next deploy. The cache fills
  // itself from what the app actually asks for.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (NEVER.some((pattern) => pattern.test(url.pathname))) return

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        // Opaque and error responses are not worth keeping: serving a cached
        // 404 back to somebody who has since deployed a fix is worse than the
        // 404 they would have got anyway.
        if (response.ok) {
          const cache = await caches.open(VERSION)
          await cache.put(request, response.clone())
        }
        return response
      } catch (err) {
        const cached = await caches.match(request)
        if (cached) return cached
        // A navigation with nothing cached: the app's own shell, which at
        // least renders and says it cannot reach the server.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html')
          if (shell) return shell
        }
        throw err
      }
    })(),
  )
})
