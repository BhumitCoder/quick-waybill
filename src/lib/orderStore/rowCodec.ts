// Shared with excel-report-manager/src/lib/orderStore/rowCodec.ts — keep both copies identical.
/**
 * Converts order rows between the shape the app works with (what reading a
 * master.xlsx gives) and the shape stored in Firestore, and works out the
 * minimal set of document writes for a change.
 *
 * The contract that keeps the rest of the app unchanged:
 *
 *   expandRows(rows.map(toStoredRow), columnsOf(rows))
 *
 * equals what writing `rows` to an xlsx and reading it back gives — same
 * keys, in the same order, with the same values (empty cells as ''). See
 * rowCodec.test.ts, which checks this against the real SheetJS round trip.
 *
 * Pure — no Firebase/React imports — so it is unit-testable and shareable
 * with the scanner app.
 */

export type CellValue = string | number | boolean;
export type Row = Record<string, unknown>;
export type StoredRow = Record<string, CellValue>;

/**
 * A column with no header text reads back from xlsx under the key ''.
 * Firestore rejects empty field names, so the stored row uses a stand-in.
 */
const EMPTY_KEY_STANDIN = '__EMPTY_HEADER';
const toStoredKey = (key: string) => (key === '' ? EMPTY_KEY_STANDIN : key);
const fromStoredKey = (key: string) => (key === EMPTY_KEY_STANDIN ? '' : key);

/**
 * The Firestore form of a row: empty values (undefined / null / '') are left
 * out — they come back as '' from expandRows, exactly as empty xlsx cells do.
 */
export function toStoredRow(row: Row): StoredRow {
  const out: StoredRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || v === null || v === '') continue;
    let value: CellValue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') value = v;
    // Not present in today's data (checked) — kept readable rather than lost
    else if (v instanceof Date) value = v.toISOString();
    else value = JSON.stringify(v);
    out[toStoredKey(k)] = value;
  }
  return out;
}

/**
 * Column order of a set of rows — every key, in order of first appearance,
 * the way SheetJS's json_to_sheet builds the header row.
 */
export function columnsOf(rows: Row[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) { seen.add(key); columns.push(key); }
    }
  }
  return columns;
}

/** Back to the app's row shape: every column present, in column order, '' when empty. */
export function expandRow(stored: StoredRow, columns: string[]): Row {
  const out: Row = {};
  for (const c of columns) {
    const k = toStoredKey(c);
    out[c] = k in stored ? stored[k] : '';
  }
  // Defensive: a value whose column is missing from the list is never dropped
  for (const k of Object.keys(stored)) {
    const c = fromStoredKey(k);
    if (!(c in out)) out[c] = stored[k];
  }
  return out;
}

/** xlsx drops rows with no values at all when the file is saved — mirror that. */
export function isEmptyRow(row: Row): boolean {
  return Object.keys(toStoredRow(row)).length === 0;
}

export function expandRows(stored: StoredRow[], columns: string[]): Row[] {
  return stored.map(s => expandRow(s, columns));
}

export function storedRowsEqual(a: StoredRow, b: StoredRow): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every(k => k in b && Object.is(a[k], b[k]));
}

// ── Order ────────────────────────────────────────────────────────────────────
//
// Row order matters (first-match lookups, default table order), and
// computeMergedRows re-sorts the whole platform on every upload, so new rows
// land in the middle. Each doc stores a numeric position `pos`; reading sorts
// by it. To keep writes minimal, rows that are already in the right relative
// order keep their pos, and only new or moved rows get a pos between their
// neighbours.

const POS_STEP = 1024;

/**
 * Positions for `items` (in the desired order) where `pos` is the item's
 * current position, or undefined for a new item. Keeps the longest run of
 * existing items that are already in increasing order; everything else gets a
 * new position between its kept neighbours. If precision runs out, every item
 * is renumbered (rare — costs one rewrite of the platform).
 */
export function assignPositions(items: Array<number | undefined>): number[] {
  const n = items.length;
  // Longest strictly-increasing subsequence of existing positions (patience sort)
  const tailsPos: number[] = [];
  const tailsIdx: number[] = [];
  const prev = new Array<number>(n).fill(-1);
  items.forEach((p, i) => {
    if (p === undefined) return;
    let lo = 0, hi = tailsPos.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tailsPos[mid] < p) lo = mid + 1; else hi = mid; }
    prev[i] = lo > 0 ? tailsIdx[lo - 1] : -1;
    tailsPos[lo] = p; tailsIdx[lo] = i;
  });
  const keep = new Set<number>();
  for (let i = tailsIdx.length ? tailsIdx[tailsIdx.length - 1] : -1; i !== -1; i = prev[i]) keep.add(i);

  const out = new Array<number>(n);
  let i = 0;
  while (i < n) {
    if (keep.has(i)) { out[i] = items[i]!; i++; continue; }
    // A run of items needing new positions, between kept neighbours
    let j = i;
    while (j < n && !keep.has(j)) j++;
    const k = j - i;
    let lo = i > 0 ? out[i - 1] : undefined;
    let hi = j < n ? items[j]! : undefined;
    if (lo === undefined && hi === undefined) { lo = -POS_STEP; hi = k * POS_STEP; }
    else if (lo === undefined) lo = hi! - (k + 1) * POS_STEP;
    else if (hi === undefined) hi = lo + (k + 1) * POS_STEP;
    const step = (hi! - lo!) / (k + 1);
    for (let m = 0; m < k; m++) out[i + m] = lo! + step * (m + 1);
    i = j;
  }

  // Precision exhausted somewhere (positions no longer strictly increasing) → renumber
  for (let m = 1; m < n; m++) {
    if (!(out[m] > out[m - 1])) return items.map((_, idx) => idx * POS_STEP);
  }
  return out;
}

// ── Diff ─────────────────────────────────────────────────────────────────────

export interface StoredDoc {
  id: string;
  pos: number;
  row: StoredRow;
}

export interface RowDiff {
  /** Documents to create or overwrite: new rows, changed rows, and rows that moved. */
  writes: Array<StoredDoc & { isNew: boolean }>;
  /** Document ids whose rows are gone. */
  deletes: string[];
  /** Every live document after the change, in row order. */
  after: StoredDoc[];
}

/**
 * Identity of each row: its merged key plus how many earlier rows share that
 * key ("k#0", "k#1", …), so the rare duplicate rows still map one-to-one.
 */
function identities(rows: Row[], keyOf: (row: Row) => string | null): string[] {
  const seen = new Map<string, number>();
  return rows.map(row => {
    const key = keyOf(row) ?? '\u0000no-key';
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}#${n}`;
  });
}

/**
 * The minimal writes that turn `before` (the platform's current docs, in row
 * order) into `afterRows` (what the compute step returned, in its order).
 * Unchanged rows that stay in place are not written at all.
 */
export function diffRows(
  before: StoredDoc[],
  afterRows: Row[],
  keyOf: (row: Row) => string | null,
  newId: () => string,
): RowDiff {
  afterRows = afterRows.filter(r => !isEmptyRow(r));
  const byIdentity = new Map<string, StoredDoc>();
  identities(before.map(d => d.row), keyOf).forEach((ident, i) => byIdentity.set(ident, before[i]));

  const used = new Set<string>();
  const matched = identities(afterRows, keyOf).map(ident => {
    const existing = byIdentity.get(ident);
    if (!existing || used.has(existing.id)) return undefined;
    used.add(existing.id);
    return existing;
  });

  const positions = assignPositions(matched.map(m => m?.pos));
  const writes: RowDiff['writes'] = [];
  const after: StoredDoc[] = afterRows.map((r, i) => {
    const row = toStoredRow(r);
    const existing = matched[i];
    const doc: StoredDoc = { id: existing?.id ?? newId(), pos: positions[i], row };
    if (!existing) writes.push({ ...doc, isNew: true });
    else if (existing.pos !== doc.pos || !storedRowsEqual(existing.row, row)) writes.push({ ...doc, isNew: false });
    return doc;
  });

  const deletes = before.filter(d => !used.has(d.id)).map(d => d.id);
  return { writes, deletes, after };
}
