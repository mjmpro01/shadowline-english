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

// --- Study reminders --------------------------------------------------------
// The server sends a reminder as JSON: {id, kind, title, body, url}. Shown with
// the app's icon; one of a kind replaces the last, so a phone that was off all
// day does not wake to a pile of them.
self.addEventListener('push', (event) => {
  let note = {}
  try {
    note = event.data ? event.data.json() : {}
  } catch {
    note = { title: 'Shadowline', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(note.title || 'Shadowline', {
      body: note.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: note.kind || 'shadowline',
      data: { url: note.url || '/dashboard', id: note.id || null },
    }),
  )
})

// Tapped: say so (the console counts it), then bring the app forward at the
// reminder's page — the tab already open if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url, id } = event.notification.data || {}
  const target = new URL(url || '/dashboard', self.location.origin).href
  event.waitUntil(
    (async () => {
      if (id) {
        fetch('/api/push/opened', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => undefined)
      }
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
