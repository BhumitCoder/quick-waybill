// Shared with excel-report-manager/src/lib/orderStore/idbPersistence.ts — keep both copies identical.
/**
 * IndexedDB home for a device's copy of the orders (see orderSync.ts).
 *
 * One record per order document, plus one meta record (sync cursor, column
 * lists). Each save writes its documents and the meta in ONE transaction, so
 * the stored cursor can never run ahead of the documents it describes. If
 * IndexedDB is unavailable (private mode, blocked storage) everything still
 * works — the copy just isn't kept between visits.
 */
import type { SyncedDoc } from './orderRepo';
import type { PersistedSync, SyncMeta, SyncPersistence } from './orderSync';

const DOCS = 'docs';
const META = 'meta';
const META_KEY = 'meta';

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DOCS, { keyPath: 'id' });
      req.result.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export function idbPersistence(name: string): SyncPersistence {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= open(name));
  const available = typeof indexedDB !== 'undefined';

  return {
    async reset(): Promise<void> {
      if (!available) return;
      const d = await db();
      const tx = d.transaction([DOCS, META], 'readwrite');
      tx.objectStore(DOCS).clear();
      tx.objectStore(META).clear();
      await done(tx);
    },

    async load(): Promise<PersistedSync | null> {
      if (!available) return null;
      try {
        const d = await db();
        const tx = d.transaction([DOCS, META], 'readonly');
        const metaReq = tx.objectStore(META).get(META_KEY);
        const docsReq = tx.objectStore(DOCS).getAll();
        await done(tx);
        const meta = metaReq.result as SyncMeta | undefined;
        if (!meta) return null;
        return { ...meta, docs: docsReq.result as SyncedDoc[] };
      } catch {
        return null; // start fresh — the full load rebuilds the copy
      }
    },

    /** Throws on failure — the caller re-queues, so the cursor never skips unsaved changes. */
    async save(meta: SyncMeta, upserts: SyncedDoc[], deletedIds: string[]): Promise<void> {
      if (!available) return;
      const d = await db();
      const tx = d.transaction([DOCS, META], 'readwrite');
      const docs = tx.objectStore(DOCS);
      for (const id of deletedIds) docs.delete(id);
      for (const doc of upserts) docs.put(doc);
      tx.objectStore(META).put(meta, META_KEY);
      await done(tx);
    },
  };
}
