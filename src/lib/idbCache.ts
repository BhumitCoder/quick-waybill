/**
 * IndexedDB cache for parsed master-file rows.
 * Persists across page reloads so repeated app opens never re-parse XLSX.
 * TTL: 8 hours. Degrades silently if IDB is unavailable (private mode, etc.).
 */

const DB_NAME = "awb-scanner-v1";
const STORE = "master-rows";
const DB_VERSION = 1;
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

type Entry = { rows: Record<string, unknown>[]; cachedAt: number };

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

export async function idbGet(path: string): Promise<Record<string, unknown>[] | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(path);
      req.onsuccess = () => {
        const v = req.result as Entry | undefined;
        resolve(v && Date.now() - v.cachedAt < TTL_MS ? v.rows : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet(path: string, rows: Record<string, unknown>[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ rows, cachedAt: Date.now() } satisfies Entry, path);
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
