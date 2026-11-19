import { repository } from '../repository'

/**
 * Study reminders in this browser: whether it can have them, and turning them
 * on and off. Permission is only ever asked for here, from a button the learner
 * pressed — a browser that asks by itself on arrival is one people learn to
 * say no to.
 */

/** This browser can receive push at all. */
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** An iPhone or iPad not running the app from the Home Screen: Safari there
 *  only delivers push to an installed web app (iOS 16.4 and later). */
export function needsInstall(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone
}

/** The permission as it stands: 'default' until asked. */
export function permission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'denied'
}

function keyBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // Registered in production on load; here as well, so reminders can be
  // turned on before that has happened, or in a build that does not.
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) return existing
  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

export type SubscribeResult = 'ok' | 'denied' | 'unsupported' | 'off'

/** Asks for permission, subscribes this browser, and tells the server. */
export async function subscribe(): Promise<SubscribeResult> {
  if (!pushSupported()) return 'unsupported'
  const key = await repository.pushKey()
  if (!key) return 'off'
  const answer = await Notification.requestPermission()
  if (answer !== 'granted') return 'denied'
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }))
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  await repository.subscribePush({
    endpoint: json.endpoint ?? sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  })
  return 'ok'
}

/** Stops this browser's reminders, on the server and in the browser. */
export async function unsubscribe(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await repository.unsubscribePush(sub.endpoint).catch(() => undefined)
  await sub.unsubscribe().catch(() => false)
}

/** The browser's own time zone, for reminders at the learner's own hour. */
export function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh'
  } catch {
    return 'Asia/Ho_Chi_Minh'
  }
}
