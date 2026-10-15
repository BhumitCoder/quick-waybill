// Shared with excel-report-manager/src/lib/orderStore/orderRepo.ts — keep both copies identical.
/**
 * Firestore reads and writes for order documents.
 *
 * Takes the Firestore instance as a parameter (never imports the app's
 * firebase.ts) so it runs unchanged against the emulator in tests.
 *
 *   orders/{id}, ordersArchive/{id}
 *     companyId, platformId, pos, row, deleted, updatedAt, writer
 *   orderColumns/{companyId}_{platformId}[_archive]
 *     companyId, platformId, dataset, columns
 */
import {
  collection, doc, query, where, orderBy, limit, startAfter, getDocs, writeBatch,
  serverTimestamp, documentId, onSnapshot, Timestamp,
  type Firestore, type QueryConstraint, type DocumentSnapshot, type WriteBatch,
} from 'firebase/firestore';
import type { StoredDoc, StoredRow, RowDiff } from './rowCodec';

export type Dataset = 'master' | 'archive';

export const ORDER_COLLECTION: Record<Dataset, string> = { master: 'orders', archive: 'ordersArchive' };
export const COLUMNS_COLLECTION = 'orderColumns';

export interface PlatformScope { companyId: string; platformId: string }

export const platformKey = (companyId: string, platformId: string) => `${companyId}_${platformId}`;
export const columnsDocId = (companyId: string, platformId: string, dataset: Dataset) =>
  dataset === 'master' ? platformKey(companyId, platformId) : `${platformKey(companyId, platformId)}_archive`;

/** A document as held locally. `updatedAt` in microseconds; null = written locally, server copy not seen yet. */
export interface SyncedDoc extends StoredDoc {
  companyId: string;
  platformId: string;
  deleted: boolean;
  updatedAt: number | null;
}

export const toMicros = (t: Timestamp) => t.seconds * 1_000_000 + Math.floor(t.nanoseconds / 1000);
export const fromMicros = (m: number) => new Timestamp(Math.floor(m / 1_000_000), (m % 1_000_000) * 1000);

function fromSnapshot(s: DocumentSnapshot): SyncedDoc | null {
  const d = s.data({ serverTimestamps: 'none' });
  if (!d || typeof d.companyId !== 'string' || typeof d.platformId !== 'string') return null;
  const ts = d.updatedAt instanceof Timestamp ? toMicros(d.updatedAt) : null;
  return {
    id: s.id,
    companyId: d.companyId,
    platformId: d.platformId,
    pos: typeof d.pos === 'number' ? d.pos : 0,
    row: (d.row ?? {}) as StoredRow,
    deleted: d.deleted === true,
    updatedAt: ts,
  };
}

const scopeFilters = (scope?: PlatformScope): QueryConstraint[] =>
  scope ? [where('companyId', '==', scope.companyId), where('platformId', '==', scope.platformId)] : [];

/** Newest updatedAt in the dataset (or scope), or null when it is empty. */
export async function readMaxUpdatedAt(db: Firestore, dataset: Dataset, scope?: PlatformScope): Promise<number | null> {
  const snap = await getDocs(query(
    collection(db, ORDER_COLLECTION[dataset]),
    ...scopeFilters(scope), orderBy('updatedAt', 'desc'), limit(1),
  ));
  const ts = snap.docs[0]?.data({ serverTimestamps: 'none' }).updatedAt;
  return ts instanceof Timestamp ? toMicros(ts) : null;
}

/** Every live (non-deleted) document of the dataset (or scope), paged. */
export async function readAllLive(db: Firestore, dataset: Dataset, scope?: PlatformScope, pageSize = 2000): Promise<SyncedDoc[]> {
  const out: SyncedDoc[] = [];
  let last: DocumentSnapshot | undefined;
  for (;;) {
    const snap = await getDocs(query(
      collection(db, ORDER_COLLECTION[dataset]),
      ...scopeFilters(scope), where('deleted', '==', false), orderBy(documentId()),
      ...(last ? [startAfter(last)] : []), limit(pageSize),
    ));
    snap.docs.forEach(s => { const d = fromSnapshot(s); if (d) out.push(d); });
    if (snap.docs.length < pageSize) return out;
    last = snap.docs[snap.docs.length - 1];
  }
}

/**
 * Every document (tombstones included) with updatedAt >= since. `>=`, not
 * `>`: a whole batch shares one commit timestamp, and re-applying a document
 * already seen is harmless, while skipping one is not.
 */
export async function readChangesSince(db: Firestore, dataset: Dataset, since: number, scope?: PlatformScope, pageSize = 2000): Promise<SyncedDoc[]> {
  const out: SyncedDoc[] = [];
  let last: DocumentSnapshot | undefined;
  for (;;) {
    const snap = await getDocs(query(
      collection(db, ORDER_COLLECTION[dataset]),
      ...scopeFilters(scope), where('updatedAt', '>=', fromMicros(since)), orderBy('updatedAt'), orderBy(documentId()),
      ...(last ? [startAfter(last)] : []), limit(pageSize),
    ));
    snap.docs.forEach(s => { const d = fromSnapshot(s); if (d) out.push(d); });
    if (snap.docs.length < pageSize) return out;
    last = snap.docs[snap.docs.length - 1];
  }
}

/** Live feed of documents changed at or after `since`. Returns the unsubscribe function. */
export function listenChangesSince(
  db: Firestore, dataset: Dataset, since: number, scope: PlatformScope | undefined,
  onDocs: (docs: SyncedDoc[]) => void, onError: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, ORDER_COLLECTION[dataset]), ...scopeFilters(scope), where('updatedAt', '>=', fromMicros(since))),
    snap => {
      const docs = snap.docChanges()
        .filter(c => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
        .map(c => fromSnapshot(c.doc))
        .filter((d): d is SyncedDoc => d !== null);
      if (docs.length) onDocs(docs);
    },
    onError,
  );
}

export async function readColumns(db: Firestore, dataset: Dataset, scope?: PlatformScope): Promise<Map<string, string[]>> {
  const snap = await getDocs(query(collection(db, COLUMNS_COLLECTION), ...scopeFilters(scope), where('dataset', '==', dataset)));
  const out = new Map<string, string[]>();
  snap.docs.forEach(s => {
    const d = s.data();
    if (Array.isArray(d.columns)) out.set(platformKey(d.companyId, d.platformId), d.columns as string[]);
  });
  return out;
}

export function listenColumns(
  db: Firestore, dataset: Dataset, scope: PlatformScope | undefined,
  onColumns: (key: string, columns: string[]) => void, onError: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, COLUMNS_COLLECTION), ...scopeFilters(scope), where('dataset', '==', dataset)),
    snap => snap.docChanges().forEach(c => {
      const d = c.doc.data();
      if (c.type !== 'removed' && Array.isArray(d.columns)) onColumns(platformKey(d.companyId, d.platformId), d.columns as string[]);
    }),
    onError,
  );
}

const BATCH_LIMIT = 400;

/**
 * Write a diff for one platform. Firestore batches cap at 500 writes, so a
 * large change is split across several batches — each is atomic, the whole
 * is not. Every write is idempotent (a full document set), so re-running the
 * same operation after a partial failure completes it.
 */
export async function commitDiff(
  db: Firestore, dataset: Dataset, scope: PlatformScope, diff: Pick<RowDiff, 'writes' | 'deletes'>,
  columns: string[] | null, writer: string,
): Promise<void> {
  const ops: Array<(b: WriteBatch) => void> = [];
  const col = collection(db, ORDER_COLLECTION[dataset]);
  if (columns) {
    const ref = doc(db, COLUMNS_COLLECTION, columnsDocId(scope.companyId, scope.platformId, dataset));
    ops.push(b => b.set(ref, { ...scope, dataset, columns, updatedAt: serverTimestamp() }));
  }
  for (const w of diff.writes) {
    ops.push(b => b.set(doc(col, w.id), {
      ...scope, pos: w.pos, row: w.row, deleted: false, updatedAt: serverTimestamp(), writer,
    }));
  }
  for (const id of diff.deletes) {
    // Tombstone, so every device's local copy learns the row is gone
    ops.push(b => b.set(doc(col, id), { ...scope, deleted: true, updatedAt: serverTimestamp(), writer }));
  }
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach(op => op(batch));
    await batch.commit();
  }
}

/** A new document id, generated locally (no network). */
export const newOrderId = (db: Firestore, dataset: Dataset) => doc(collection(db, ORDER_COLLECTION[dataset])).id;
