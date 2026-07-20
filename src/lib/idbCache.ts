/**
 * IndexedDB cache for parsed master-file rows.
 * Persists across page reloads so repeated app opens never re-parse XLSX.
 *
 * Freshness is now VERSION-based, not a blind TTL: each entry stores the
 * masterSync updatedAt (millis) it was fetched at. The caller compares this
 * against the current masterSync doc and only re-downloads when they differ
 * — a file that hasn't changed in months is never redownloaded just because
 * time passed. TTL_MS is kept only as a backstop for entries whose version is
 * unknown (0) so the cache doesn't grow unbounded forever.
 * Degrades silently if IDB is unavailable (private mode, etc.).
 */

const DB_NAME = "awb-scanner-v1";
const STORE = "master-rows";
const DB_VERSION = 1;
const BACKSTOP_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, version-unknown entries only

export type CacheEntry = { rows: Record<string, unknown>[]; version: number; cachedAt: number };

let _db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(path: string): Promise<CacheEntry | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(path);
      req.onsuccess = () => {
        const v = req.result as CacheEntry | undefined;
        if (!v) { resolve(null); return; }
        if (v.version === 0 && Date.now() - v.cachedAt > BACKSTOP_TTL_MS) { resolve(null); return; }
        resolve(v);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet(path: string, rows: Record<string, unknown>[], version: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ rows, version, cachedAt: Date.now() } satisfies CacheEntry, path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IDB write failed — continue without caching
  }
}

export async function idbDelete(path: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
