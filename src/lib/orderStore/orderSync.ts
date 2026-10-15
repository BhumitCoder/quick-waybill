// Shared with excel-report-manager/src/lib/orderStore/orderSync.ts — keep both copies identical.
/**
 * Keeps a device's copy of the order documents current, fetching only what
 * changed since the last visit, and performs the "read → compute → write
 * changes" cycle that replaces rewriting a whole master file.
 *
 * Rules that make it safe regardless of the order things arrive in:
 *   - A document version is applied only if it is at least as new as the one
 *     held (updatedAt). Re-applying the same version is harmless.
 *   - The cursor only advances past documents actually applied, and catch-up
 *     queries use `>=`, so nothing committed at the cursor's instant is missed.
 *   - First load: read the newest updatedAt (T0) BEFORE reading everything,
 *     then catch up from T0 — anything that changed mid-load is fetched again.
 */
import type { Firestore } from 'firebase/firestore';
import { columnsOf, diffRows, expandRows, type Row, type StoredDoc } from './rowCodec';
import {
  commitDiff, listenChangesSince, listenColumns, newOrderId, platformKey, readAllLive,
  readChangesSince, readColumns, readMaxUpdatedAt,
  type Dataset, type PlatformScope, type SyncedDoc,
} from './orderRepo';

export interface SyncMeta {
  cursor: number;
  columns: Record<string, string[]>;
}

export interface PersistedSync extends SyncMeta {
  docs: SyncedDoc[];
}

/**
 * Where a device keeps its copy (IndexedDB in the browser, memory in tests).
 * Documents are saved individually so a change costs only what changed; the
 * meta and the documents of one save must be written atomically together.
 */
export interface SyncPersistence {
  load(): Promise<PersistedSync | null>;
  save(meta: SyncMeta, upserts: SyncedDoc[], deletedIds: string[]): Promise<void>;
}

export interface OrderSyncOptions {
  db: Firestore;
  dataset: Dataset;
  persistence: SyncPersistence;
  /** Merged-row key — identifies a row across writes (getMergedRowKey). */
  keyOf: (row: Row) => string | null;
  /** This client's id, recorded on every write. */
  writer: string;
  /** Limit the copy to one platform (the scanner); omit for everything (the panel). */
  scope?: PlatformScope;
}

export type ChangeListener = (changedPlatformKeys: string[]) => void;

export class OrderSync {
  private readonly o: OrderSyncOptions;
  private cursor = 0;
  private readonly docs = new Map<string, Map<string, SyncedDoc>>(); // platformKey → id → doc
  private readonly columns = new Map<string, string[]>();
  private readonly rowCache = new Map<string, { docs: SyncedDoc[]; rows: Row[] }>();
  private readonly listeners = new Set<ChangeListener>();
  private unsubs: Array<() => void> = [];
  private ready: Promise<void> | null = null;
  private readonly pendingUpserts = new Map<string, SyncedDoc>();
  private readonly pendingDeletes = new Set<string>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persisting: Promise<void> = Promise.resolve();

  constructor(options: OrderSyncOptions) {
    this.o = options;
  }

  /** Load the local copy (or do the first full load), then catch up. Safe to call repeatedly. */
  init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.doInit().catch(e => { this.ready = null; throw e; });
    }
    return this.ready;
  }

  private async doInit(): Promise<void> {
    const saved = await this.o.persistence.load();
    if (saved) {
      this.cursor = saved.cursor;
      for (const [k, cols] of Object.entries(saved.columns)) this.columns.set(k, cols);
      for (const d of saved.docs) {
        const key = platformKey(d.companyId, d.platformId);
        let map = this.docs.get(key);
        if (!map) { map = new Map(); this.docs.set(key, map); }
        map.set(d.id, d);
      }
      await this.catchUp();
      return;
    }
    const { db, dataset, scope } = this.o;
    const t0 = await readMaxUpdatedAt(db, dataset, scope);
    const [all, cols] = await Promise.all([readAllLive(db, dataset, scope), readColumns(db, dataset, scope)]);
    cols.forEach((v, k) => this.columns.set(k, v));
    this.apply(all);
    this.cursor = t0 ?? 0;
    await this.flush();
    await this.catchUp();
  }

  /** Fetch every change since the cursor. Returns the platforms that changed. */
  async catchUp(): Promise<string[]> {
    const { db, dataset, scope } = this.o;
    const [changes, cols] = await Promise.all([
      readChangesSince(db, dataset, this.cursor, scope),
      readColumns(db, dataset, scope),
    ]);
    const changed = new Set(this.apply(changes));
    cols.forEach((v, k) => {
      if (!sameColumns(this.columns.get(k), v)) { this.columns.set(k, v); this.rowCache.delete(k); this.metaDirty = true; changed.add(k); }
    });
    const list = [...changed];
    if (list.length) this.emit(list);
    await this.flush();
    return list;
  }

  /** Follow changes live until stop(). */
  startLive(onError: (e: Error) => void = () => {}): void {
    if (this.unsubs.length) return;
    const { db, dataset, scope } = this.o;
    this.unsubs.push(listenChangesSince(db, dataset, this.cursor, scope, docs => {
      const changed = this.apply(docs);
      if (changed.length) { this.schedulePersist(); this.emit(changed); }
    }, onError));
    this.unsubs.push(listenColumns(db, dataset, scope, (key, cols) => {
      if (sameColumns(this.columns.get(key), cols)) return;
      this.columns.set(key, cols);
      this.metaDirty = true;
      this.rowCache.delete(key);
      this.schedulePersist();
      this.emit([key]);
    }, onError));
  }

  stop(): void {
    this.unsubs.forEach(u => u());
    this.unsubs = [];
  }

  /** Save everything not yet saved locally (also call when the page is being hidden). */
  flush(): Promise<void> {
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; }
    // Serialized, so saves land in order and the meta never runs ahead of its documents
    this.persisting = this.persisting.then(async () => {
      if (!this.pendingUpserts.size && !this.pendingDeletes.size && !this.metaDirty) return;
      const upserts = [...this.pendingUpserts.values()];
      const deletes = [...this.pendingDeletes];
      this.pendingUpserts.clear();
      this.pendingDeletes.clear();
      this.metaDirty = false;
      await this.o.persistence.save({ cursor: this.cursor, columns: Object.fromEntries(this.columns) }, upserts, deletes);
    });
    return this.persisting;
  }

  private metaDirty = false;

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => { this.persistTimer = null; void this.flush(); }, 1000);
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Platforms that have at least one live order. */
  platformKeys(): string[] {
    return [...this.docs.keys()].filter(k => (this.docs.get(k)?.size ?? 0) > 0);
  }

  /** A platform's rows exactly as reading its master file used to give them. */
  rows(companyId: string, platformId: string): Row[] {
    return this.cached(platformKey(companyId, platformId)).rows;
  }

  /**
   * Same contract as writing a master file under its lock: catch up so the
   * rows handed to `compute` are current, write only what changed, return
   * what compute was given and what it returned. The caller holds the lock.
   */
  async write(
    companyId: string, platformId: string,
    compute: (rows: Row[]) => Row[] | null | Promise<Row[] | null>,
  ): Promise<{ rowsBefore: Row[]; finalRows: Row[] }> {
    await this.init();
    await this.catchUp();
    const key = platformKey(companyId, platformId);
    const { docs: before, rows: rowsBefore } = this.cached(key);
    const finalRows = await compute(rowsBefore.map(r => ({ ...r })));
    if (finalRows === null) return { rowsBefore, finalRows: rowsBefore };

    const { db, dataset, keyOf, writer } = this.o;
    const diff = diffRows(before, finalRows, keyOf, () => newOrderId(db, dataset));
    const newColumns = finalRows.length ? columnsOf(finalRows) : null;
    const columnsChanged = newColumns !== null && !sameColumns(this.columns.get(key), newColumns);
    if (diff.writes.length || diff.deletes.length || columnsChanged) {
      await commitDiff(db, dataset, { companyId, platformId }, diff, columnsChanged ? newColumns : null, writer);
    }

    // Reflect the write locally right away; the server copies (with their
    // timestamps) arrive through the live feed / next catch-up and replace these
    if (columnsChanged) { this.columns.set(key, newColumns!); this.metaDirty = true; }
    const local: SyncedDoc[] = [
      ...diff.writes.map(w => ({ id: w.id, pos: w.pos, row: w.row, companyId, platformId, deleted: false, updatedAt: null })),
      ...diff.deletes.map(id => ({ id, pos: 0, row: {}, companyId, platformId, deleted: true, updatedAt: null })),
    ];
    this.apply(local);
    this.rowCache.delete(key);
    this.emit([key]);
    await this.flush();
    return { rowsBefore, finalRows };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Apply document versions; returns the platform keys that changed. */
  private apply(incoming: SyncedDoc[]): string[] {
    const changed = new Set<string>();
    for (const d of incoming) {
      const key = platformKey(d.companyId, d.platformId);
      let map = this.docs.get(key);
      const held = map?.get(d.id);
      // Keep whichever version is newer; the same version again is not a change.
      // A local (null) version is replaced by any server version of the same
      // write, and always beats older ones.
      if (held && held.updatedAt !== null && d.updatedAt !== null && d.updatedAt <= held.updatedAt) continue;
      if (d.deleted) {
        if (map?.delete(d.id)) changed.add(key);
        this.pendingUpserts.delete(d.id);
        this.pendingDeletes.add(d.id);
      } else {
        if (!map) { map = new Map(); this.docs.set(key, map); }
        map.set(d.id, d);
        changed.add(key);
        this.pendingDeletes.delete(d.id);
        this.pendingUpserts.set(d.id, d);
      }
      if (d.updatedAt !== null && d.updatedAt > this.cursor) { this.cursor = d.updatedAt; this.metaDirty = true; }
    }
    changed.forEach(k => this.rowCache.delete(k));
    return [...changed];
  }

  private cached(key: string): { docs: SyncedDoc[]; rows: Row[] } {
    let c = this.rowCache.get(key);
    if (!c) {
      const docs = [...(this.docs.get(key)?.values() ?? [])].sort((a, b) => a.pos - b.pos);
      const rows = expandRows(docs.map(d => d.row), this.columns.get(key) ?? columnsOf(docs.map(d => d.row)));
      c = { docs, rows };
      this.rowCache.set(key, c);
    }
    return c;
  }

  private emit(keys: string[]): void {
    this.listeners.forEach(l => l(keys));
  }
}

function sameColumns(a: string[] | undefined, b: string[]): boolean {
  return !!a && a.length === b.length && a.every((c, i) => c === b[i]);
}

/** Persistence held in memory — tests, and a fallback where IndexedDB is unavailable. */
export function memoryPersistence(): SyncPersistence & { state: PersistedSync | null; saves: number } {
  const p = {
    state: null as PersistedSync | null,
    saves: 0,
    async load() { return p.state ? structuredClone(p.state) : null; },
    async save(meta: SyncMeta, upserts: SyncedDoc[], deletedIds: string[]) {
      p.saves++;
      const docs = new Map((p.state?.docs ?? []).map(d => [d.id, d]));
      deletedIds.forEach(id => docs.delete(id));
      upserts.forEach(d => docs.set(d.id, structuredClone(d)));
      p.state = { ...structuredClone(meta), docs: [...docs.values()] };
    },
  };
  return p;
}

export type { StoredDoc };
