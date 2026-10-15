// Shared with excel-report-manager/src/lib/orderStore/rowCodec.test.ts — keep both copies identical.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  toStoredRow, columnsOf, expandRows, storedRowsEqual, assignPositions, diffRows, isEmptyRow,
  type Row, type StoredDoc,
} from './rowCodec';

/** What the app sees today after writing rows to master.xlsx and reading them back. */
function xlsxRoundTrip(rows: Row[]): Row[] {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Master Data');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  const read = XLSX.read(buf, { type: 'array' });
  // JSON clone = what the app receives from the parse worker (postMessage keeps
  // only plain enumerable data, dropping SheetJS's hidden __rowNum__)
  return JSON.parse(JSON.stringify(XLSX.utils.sheet_to_json(read.Sheets[read.SheetNames[0]], { defval: '' })));
}

/** The same rows through Firestore: stored form + column list, expanded on read. */
function storeRoundTrip(rows: Row[]): Row[] {
  const kept = rows.filter(r => !isEmptyRow(r));
  return expandRows(kept.map(toStoredRow), columnsOf(rows));
}

describe('row codec reproduces the xlsx round trip exactly', () => {
  const rows: Row[] = [
    { awb: '1490812345678', orderId: '2627071311715', subOrderId: '2627071311715S1', status: 'delivered', sellingPrice: 499, quantity: 1, 'Sr. No.': 1, 'Pickup/Drop': 'x' },
    { awb: 'SF123', orderId: '', subOrderId: undefined, status: null, sellingPrice: 0, extra: 'only here', flag: true },
    { orderId: 'ORD-9', note: '  padded value  ', zip: '000123', price: 12.75, neg: -3, big: 9007199254740991 },
    { awb: 'A1', '': 'header-less column', status: 'rto' },
    {},
  ];

  it('same keys, same key order, same values', () => {
    const viaXlsx = xlsxRoundTrip(rows);
    const viaStore = storeRoundTrip(rows);
    expect(viaStore).toEqual(viaXlsx);
    viaStore.forEach((r, i) => expect(Object.keys(r)).toEqual(Object.keys(viaXlsx[i])));
  });

  it('is stable: storing rows that were read back changes nothing', () => {
    const once = storeRoundTrip(rows);
    expect(storeRoundTrip(once)).toEqual(once);
  });

  it('stores a header-less column under a non-empty field name', () => {
    expect(Object.keys(toStoredRow({ '': 'v' }))).not.toContain('');
  });

  it('leaves empty values out of the stored form', () => {
    expect(toStoredRow({ a: '', b: undefined, c: null, d: 0, e: false, f: 'x' })).toEqual({ d: 0, e: false, f: 'x' });
  });

  it('compares stored rows by content, not key order', () => {
    expect(storedRowsEqual({ a: 1, b: 'x' }, { b: 'x', a: 1 })).toBe(true);
    expect(storedRowsEqual({ a: 1 }, { a: '1' })).toBe(false);
    expect(storedRowsEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('assignPositions', () => {
  const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

  it('keeps existing positions that are already in order', () => {
    expect(assignPositions([0, 1024, 2048])).toEqual([0, 1024, 2048]);
  });

  it('slots new items between their neighbours without moving anyone', () => {
    const out = assignPositions([0, undefined, undefined, 1024, undefined]);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(1024);
    expect(increasing(out)).toBe(true);
  });

  it('moves only the item that is out of order', () => {
    const out = assignPositions([0, 3072, 1024, 2048]); // 3072 moved up front
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(1024);
    expect(out[3]).toBe(2048);
    expect(increasing(out)).toBe(true);
  });

  it('renumbers when precision runs out, still in order', () => {
    let pos = [0, 1];
    for (let i = 0; i < 80; i++) pos = assignPositions([pos[0], undefined, pos[1]]).filter((_, k) => k !== 2);
    expect(increasing(pos)).toBe(true);
  });
});

// ── diffRows ──────────────────────────────────────────────────────────────────

const keyOf = (r: Row) => {
  const awb = String(r.awb ?? '').toLowerCase().trim();
  const orderId = String(r.orderId ?? '').toLowerCase().trim();
  const sub = String(r.subOrderId ?? '').toLowerCase().trim() || orderId || awb;
  if (awb) return `${awb}_${sub || awb}`;
  if (orderId) return `${orderId}_${sub || orderId}`;
  return null;
};

let idCounter = 0;
const newId = () => `doc${++idCounter}`;

function apply(before: StoredDoc[], diff: ReturnType<typeof diffRows>): StoredDoc[] {
  const docs = new Map(before.map(d => [d.id, d]));
  diff.deletes.forEach(id => docs.delete(id));
  diff.writes.forEach(w => docs.set(w.id, { id: w.id, pos: w.pos, row: w.row }));
  return [...docs.values()].sort((a, b) => a.pos - b.pos);
}

function fromRows(rows: Row[]): StoredDoc[] {
  return diffRows([], rows, keyOf, newId).after;
}

describe('diffRows', () => {
  const base: Row[] = [
    { awb: 'A1', orderId: 'O1', subOrderId: 'S1', status: 'pickup' },
    { awb: 'A2', orderId: 'O2', subOrderId: 'S2', status: 'pickup' },
    { awb: 'A3', orderId: 'O3', subOrderId: 'S3', status: 'pickup' },
  ];

  it('writes nothing when nothing changed', () => {
    const before = fromRows(base);
    const d = diffRows(before, base.map(r => ({ ...r })), keyOf, newId);
    expect(d.writes).toEqual([]);
    expect(d.deletes).toEqual([]);
  });

  it('writes only the changed row', () => {
    const before = fromRows(base);
    const after = base.map(r => r.awb === 'A2' ? { ...r, status: 'delivered' } : r);
    const d = diffRows(before, after, keyOf, newId);
    expect(d.writes.map(w => w.id)).toEqual([before[1].id]);
    expect(d.deletes).toEqual([]);
  });

  it('writes only the inserted row, keeping order', () => {
    const before = fromRows(base);
    const after = [base[0], { awb: 'A15', orderId: 'O15', subOrderId: 'S15' }, base[1], base[2]];
    const d = diffRows(before, after, keyOf, newId);
    expect(d.writes).toHaveLength(1);
    expect(d.writes[0].isNew).toBe(true);
    expect(apply(before, d).map(x => x.row.awb)).toEqual(['A1', 'A15', 'A2', 'A3']);
  });

  it('deletes removed rows', () => {
    const before = fromRows(base);
    const d = diffRows(before, [base[0], base[2]], keyOf, newId);
    expect(d.deletes).toEqual([before[1].id]);
    expect(d.writes).toEqual([]);
  });

  it('turns a re-keyed row into delete + create', () => {
    const before = fromRows([{ awb: 'A9', subOrderId: '' }]);
    const d = diffRows(before, [{ awb: 'A9', orderId: 'O9', subOrderId: 'S9' }], keyOf, newId);
    expect(d.deletes).toEqual([before[0].id]);
    expect(d.writes.map(w => w.isNew)).toEqual([true]);
  });

  it('keeps duplicate rows one-to-one', () => {
    const dup = [{ awb: 'D', orderId: 'X', subOrderId: 'Y', n: 1 }, { awb: 'D', orderId: 'X', subOrderId: 'Y', n: 2 }];
    const before = fromRows(dup);
    const d = diffRows(before, [dup[0], { ...dup[1], n: 3 }], keyOf, newId);
    expect(d.writes.map(w => w.id)).toEqual([before[1].id]);
  });

  it('survives hundreds of random uploads, edits, moves and deletes exactly', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let rows: Row[] = Array.from({ length: 60 }, (_, i) => ({ awb: `A${i}`, orderId: `O${i}`, subOrderId: `S${i}`, v: 0 }));
    let docs = fromRows(rows);
    let next = 1000;
    let totalWrites = 0;

    for (let round = 0; round < 400; round++) {
      const after = rows.map(r => ({ ...r }));
      const op = rand();
      if (op < 0.35) {                       // upload: insert a few rows at random spots
        for (let k = 0; k < 1 + Math.floor(rand() * 4); k++) {
          after.splice(Math.floor(rand() * (after.length + 1)), 0, { awb: `A${next}`, orderId: `O${next}`, subOrderId: `S${next}`, v: 0 });
          next++;
        }
      } else if (op < 0.6 && after.length) { // edit
        const i = Math.floor(rand() * after.length);
        after[i] = { ...after[i], v: (after[i].v as number) + 1, status: rand() < 0.5 ? '' : 'x' };
      } else if (op < 0.8 && after.length) { // delete
        after.splice(Math.floor(rand() * after.length), 1);
      } else if (after.length > 1) {          // move (re-sort after an id edit)
        const [moved] = after.splice(Math.floor(rand() * after.length), 1);
        after.splice(Math.floor(rand() * (after.length + 1)), 0, moved);
      }

      const d = diffRows(docs, after, keyOf, newId);
      totalWrites += d.writes.length;
      docs = apply(docs, d);
      // Reading back (sorted by pos, expanded) gives exactly what compute returned
      const cols = columnsOf(after);
      expect(expandRows(docs.map(x => x.row), cols)).toEqual(expandRows(after.map(toStoredRow), cols));
      rows = after;
    }
    // Minimal writes: far fewer than rewriting every row every time
    expect(totalWrites).toBeLessThan(400 * 4);
  });
});
