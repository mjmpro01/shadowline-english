/**
 * Binary store for recorded takes and the avatar image. localStorage can't
 * hold blobs of this size, so they live in IndexedDB keyed by id; the
 * structured records keep only the key.
 */
const DB_NAME = 'shadowline'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export function putBlob(key: string, blob: Blob): Promise<unknown> {
  return tx('readwrite', (store) => store.put(blob, key))
}

export function getBlob(key: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (store) => store.get(key))
}

export function deleteBlob(key: string): Promise<unknown> {
  return tx('readwrite', (store) => store.delete(key))
}

const urlCache = new Map<string, string>()

/** Object URL for a stored blob, cached so repeated renders don't leak URLs. */
export async function getBlobUrl(key: string): Promise<string | null> {
  const cached = urlCache.get(key)
  if (cached) return cached
  const blob = await getBlob(key)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(key, url)
  return url
}

export function invalidateBlobUrl(key: string): void {
  const url = urlCache.get(key)
  if (url) {
    URL.revokeObjectURL(url)
    urlCache.delete(key)
  }
}
