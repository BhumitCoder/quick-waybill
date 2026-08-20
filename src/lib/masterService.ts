import { ref, getDownloadURL, uploadBytes } from "firebase/storage";
import { doc, setDoc, getDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { storage, db, masterSyncCollection } from "./firebase";
import { idbGet, idbSet } from "./idbCache";

export type MasterRow = Record<string, unknown>;

// Per-session id written into masterSync so the report panel can distinguish
// scanner writes from its own (it skips reloading for its own clientId).
// Must be set on EVERY write — merge:true would otherwise leave a stale
// clientId from a previous panel write in the doc.
const CLIENT_ID = "scanner-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

export function masterPath(companyId: string, platformId: string) {
  return `companies/${companyId}/platforms/${platformId}/master.xlsx`;
}

export function masterPathXls(companyId: string, platformId: string) {
  return `companies/${companyId}/platforms/${platformId}/master.xls`;
}

// ── Web Worker for XLSX parsing ──────────────────────────────────────────────
//
// XLSX.read + sheet_to_json can block the main thread for several seconds on
// large files. We offload ALL parsing to a dedicated worker so the UI never
// freezes. One shared worker instance handles tasks sequentially.

let _worker: Worker | null = null;
let _reqId = 0;
const _pending = new Map<number, {
  resolve: (rows: MasterRow[]) => void;
  reject: (e: Error) => void;
}>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL("../workers/xlsxWorker.ts", import.meta.url),
      { type: "module" },
    );
    _worker.onmessage = (
      e: MessageEvent<{ id: number; ok: boolean; rows?: MasterRow[]; error?: string }>,
    ) => {
      const { id, ok, rows, error } = e.data;
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      if (ok) p.resolve(rows!);
      else p.reject(new Error(error ?? "Worker parse error"));
    };
    _worker.onerror = (e) => {
      // Reject all pending on fatal worker crash
      for (const [, p] of _pending) p.reject(new Error(e.message));
      _pending.clear();
      _worker = null; // allow recreation on next call
    };
  }
  return _worker;
}

/**
 * Parse an XLSX ArrayBuffer off the main thread via a Web Worker.
 * The ArrayBuffer is *transferred* (zero-copy) to the worker.
 * Falls back to inline (synchronous) parsing if running server-side.
 */
async function parseInWorker(arrayBuffer: ArrayBuffer): Promise<MasterRow[]> {
  // SSR guard — should never happen in practice since readMasterRows is
  // only called from browser useEffect hooks.
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<MasterRow>(sheet, { defval: "" });
  }

  const id = ++_reqId;
  const worker = getWorker();
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    // Transfer ownership of the ArrayBuffer — avoids an expensive memory copy.
    worker.postMessage({ id, arrayBuffer }, [arrayBuffer]);
  });
}

// ── Download helper ──────────────────────────────────────────────────────────

async function downloadArrayBuffer(storagePath: string): Promise<{ arrayBuffer: ArrayBuffer; resolvedPath: string }> {
  const tryFetch = async (path: string) => {
    const url = await getDownloadURL(ref(storage, path));
    const res = await fetch(url);
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: "storage/unknown" });
    return res.arrayBuffer();
  };

  try {
    console.log("[master] fetching:", storagePath);
    const arrayBuffer = await tryFetch(storagePath);
    console.log("[master] fetched OK:", storagePath);
    return { arrayBuffer, resolvedPath: storagePath };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "storage/object-not-found" && storagePath.endsWith(".xlsx")) {
      const fallback = storagePath.replace(/\.xlsx$/, ".xls");
      console.log("[master] .xlsx not found, trying fallback:", fallback);
      const arrayBuffer = await tryFetch(fallback);
      console.log("[master] fetched OK (fallback):", fallback);
      return { arrayBuffer, resolvedPath: fallback };
    }
    console.error("[master] fetch error:", code, e);
    throw e;
  }
}

// ── masterSync version lookup ────────────────────────────────────────────────
//
// Both this app and the report panel write masterSync/{companyId}_{platformId}
// on every master-file save. Comparing that version against what's stored in
// IDB tells us whether a cached copy is still current.

function syncDocId(storagePath: string): string | null {
  const parts = storagePath.split("/"); // companies/{cid}/platforms/{pid}/master.xlsx
  const companyId = parts[1];
  const platformId = parts[3];
  return companyId && platformId ? `${companyId}_${platformId}` : null;
}

/** One Firestore read covering every platform's current version — use this
 *  before a batch load so each file's readMasterRows() call can skip its own
 *  per-file version lookup. */
export async function fetchSyncVersions(): Promise<Map<string, number>> {
  try {
    const snap = await getDocs(masterSyncCollection);
    const map = new Map<string, number>();
    snap.docs.forEach((d) => {
      const data = d.data() as { updatedAt?: { toMillis?: () => number } };
      map.set(d.id, data.updatedAt?.toMillis?.() ?? 0);
    });
    return map;
  } catch {
    return new Map();
  }
}

async function fetchSyncVersion(storagePath: string): Promise<number> {
  const id = syncDocId(storagePath);
  if (!id) return 0;
  try {
    const snap = await getDoc(doc(masterSyncCollection, id));
    const data = snap.data() as { updatedAt?: { toMillis?: () => number } } | undefined;
    return data?.updatedAt?.toMillis?.() ?? 0;
  } catch {
    return 0;
  }
}

// ── readMasterRows ───────────────────────────────────────────────────────────
//
// Load order (fastest first):
//   1. IndexedDB  — persistent, survives page reload, no network or parse cost.
//      Used only when its stored version matches the current masterSync
//      version — a file nobody has touched in months is never redownloaded
//      just because time passed. Callers that don't know the version yet
//      (opts.version omitted) get one extra Firestore read to look it up;
//      pass it in (e.g. from a batched fetchSyncVersions() call) to skip that.
//   2. Network + Worker parse — download from Firebase Storage, parse off-thread
//   3. IDB write  — store result (with its version) for next time

export async function readMasterRows(
  storagePath: string,
  opts?: { fresh?: boolean; version?: number },
): Promise<MasterRow[]> {
  // fresh: merge-before-write reads MUST see the latest Storage content —
  // an IDB hit here can be a pre-merge snapshot, and merging onto it would
  // erase every row another flush already wrote.
  if (!opts?.fresh) {
    // 1. IndexedDB hit — instant, no parsing, IF the version still matches
    const cached = await idbGet(storagePath);
    if (cached) {
      const knownVersion = opts?.version ?? await fetchSyncVersion(storagePath);
      if (knownVersion === 0 || cached.version === knownVersion) {
        console.log("[master] IDB cache hit:", storagePath, `(${cached.rows.length} rows, v${cached.version})`);
        return cached.rows as MasterRow[];
      }
      console.log("[master] cache stale, redownloading:", storagePath, `(cached v${cached.version}, current v${knownVersion})`);
    }
  }

  // 2. Download + parse in worker
  const { arrayBuffer, resolvedPath } = await downloadArrayBuffer(storagePath);
  const rows = await parseInWorker(arrayBuffer);

  // Log AWB column info (fast, main-thread safe)
  logAwbInfo(rows, resolvedPath);

  // 3. Persist to IDB so next load is instant — but never cache a fresh
  // merge-read: it holds the pre-merge base and would go stale the moment
  // the merged file is uploaded.
  if (!opts?.fresh) {
    const version = opts?.version ?? await fetchSyncVersion(storagePath);
    idbSet(storagePath, rows, version).catch(() => {}); // fire-and-forget
  }

  return rows;
}

function logAwbInfo(rows: MasterRow[], resolvedPath: string) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const awbKey = detectAwbKey(headers);
  const allAwbKeys = headers.filter((k) => {
    const n = k.toLowerCase().trim().replace(/\s+/g, " ");
    return AWB_PATTERNS.some((p) => p.test(n));
  });

  console.log(
    `[master] loaded ${rows.length} rows from "${resolvedPath}"`,
    "\n  columns:", headers,
    "\n  AWB column detected (primary):", awbKey ?? "(none — will scan all columns)",
    "\n  All AWB-like columns:", allAwbKeys,
  );

  if (allAwbKeys.length > 0) {
    const preview: Record<string, unknown[]> = {};
    for (const key of allAwbKeys) {
      preview[key] = rows.slice(0, 3).map((r) => ({ raw: r[key], type: typeof r[key], normalized: normalize(r[key]) }));
    }
    console.log("[master] AWB column value samples:", preview);
  }
}

export async function writeMasterRows(storagePath: string, rows: MasterRow[]): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Master Data");

  await new Promise((r) => setTimeout(r, 0));

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, buffer as ArrayBuffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // Notify the report app that this master file changed.
  const parts = storagePath.split("/");
  const companyId = parts[1];
  const platformId = parts[3];
  if (companyId && platformId) {
    try {
      await setDoc(
        doc(db, "masterSync", `${companyId}_${platformId}`),
        { storagePath, companyId, platformId, clientId: CLIENT_ID, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch { /* sync signal is best-effort */ }
  }

  // Bust IDB cache for this path so next open re-downloads the updated file
  const { idbDelete } = await import("./idbCache");
  idbDelete(storagePath).catch(() => {});
}

// ── AWB column detection ─────────────────────────────────────────────────────

const AWB_PATTERNS: RegExp[] = [
  /^awb$/,
  /^awb[\s._-]*(no|num|number)\.?$/,
  /^air[\s._-]*way[\s._-]*bill[\s._-]*(no|num|number)?\.?$/,
  /^airway[\s._-]*bill[\s._-]*(no|num|number)?\.?$/,
  /^tracking[\s._-]*(no|num|number|id|code)?\.?$/,
  /^track[\s._-]*(no|num|number|id|code)?\.?$/,
  /^waybill[\s._-]*(no|num|number)?\.?$/,
  /^connote[\s._-]*(no|num|number)?\.?$/,
  /^barcode[\s._-]*(no|num|number)?\.?$/,
  /^shipment[\s._-]*(no|num|number|id)?\.?$/,
  /^courier[\s._-]*(no|num|number|id)?\.?$/,
  /^ref[\s._-]*(no|num|number|id)?\.?$/,
  /^resi$/,
  /^no[\s._-]*resi$/,
];

function detectAwbKey(keys: string[]): string | undefined {
  return keys.find((k) => {
    const n = k.toLowerCase().trim().replace(/\s+/g, " ");
    return AWB_PATTERNS.some((p) => p.test(n));
  });
}

// ── Normalize ────────────────────────────────────────────────────────────────

export const normalize = (s: unknown): string => {
  if (s === null || s === undefined) return "";
  if (typeof s === "number") {
    return Number.isInteger(s) ? String(Math.trunc(s)) : String(s);
  }
  return String(s).trim().toLowerCase();
};

// ── findRowByAwb ─────────────────────────────────────────────────────────────

// Some carriers' barcodes decode with a spurious leading zero relative to the
// human-readable / master-file AWB (e.g. scanned "0123456789" vs stored
// "123456789"). Treat two purely-numeric AWBs as equal if they only differ
// by leading zeros — narrow enough that unrelated values can't collide.
function awbEquals(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return a.replace(/^0+(?=\d)/, "") === b.replace(/^0+(?=\d)/, "");
  }
  return false;
}

// GS1 mod-10 check digit (weight 3 on positions odd-from-the-right, weight 1
// on even) — the standard check digit scheme behind EAN/UPC/ITF-14 barcodes.
function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const posFromRight = digits.length - i;
    sum += Number(digits[i]) * (posFromRight % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

// Some carriers (confirmed on an Amazon/SHIPEASO label) print an ITF barcode
// encoding [AWB] + [GS1 check digit], padded with a leading zero when that
// total length is odd (ITF requires an even digit count). Scanned "AWB"
// "03709197471828" for a real system AWB of "370919747182" — the trailing
// "8" is the verified GS1 check digit for "370919747182", and the leading
// zero is the parity pad (awbEquals above already ignores it).
// Only strip the last digit when it's actually a *valid* check digit for the
// rest — this is a verified property of the barcode grammar, not a guess, so
// it can't cause two unrelated AWBs to collide.
function stripValidCheckDigit(s: string): string | null {
  if (!/^\d{2,}$/.test(s)) return null;
  const body = s.slice(0, -1);
  const check = Number(s[s.length - 1]);
  return gs1CheckDigit(body) === check ? body : null;
}

// Last-resort fallback for scan noise that isn't explained by the verified GS1
// check-digit grammar above — e.g. a genuine 1-character misread introduced by
// the camera decoder (glare, print smudge, downsampled frame) at either edge of
// the barcode, unrelated to any real barcode-encoding artifact. Candidates are
// only ever accepted when they resolve to exactly one row in the whole file —
// an ambiguous trim is worse than a failed scan, so a tie is left as "not found".
function fuzzyEdgeCandidates(s: string): string[] {
  if (s.length < 8) return [];
  return [s.slice(1), s.slice(0, -1), s.slice(1, -1)];
}

// Both fallbacks below exist because of Amazon return labels specifically (verified
// GS1 check-digit grammar, then a last-resort edge-trim for unverified camera misreads).
// Gate them on the courier so other platforms — where scans are already 1:1 with the
// stored AWB — keep exact-only matching and can't be affected by this leniency at all.
export function findRowByAwb(rows: MasterRow[], awb: string, opts?: { isAmazon?: boolean }): number {
  if (!rows.length) return -1;
  const isAmazon = opts?.isAmazon ?? false;

  const needle = normalize(awb);
  if (!needle) return -1;
  const needleNoCheckDigit = isAmazon ? stripValidCheckDigit(needle) : null;

  const matchesNeedle = (value: unknown): boolean => {
    const v = normalize(value);
    if (awbEquals(v, needle)) return true;
    return needleNoCheckDigit !== null && awbEquals(v, needleNoCheckDigit);
  };

  const headers = Object.keys(rows[0]);
  const allAwbKeys = headers.filter((k) => {
    const n = k.toLowerCase().trim().replace(/\s+/g, " ");
    return AWB_PATTERNS.some((p) => p.test(n));
  });

  console.log(`[awb] looking for "${needle}" (length=${needle.length}), AWB columns: ${JSON.stringify(allAwbKeys)}`);

  for (const key of allAwbKeys) {
    const idx = rows.findIndex((r) => matchesNeedle(r[key]));
    if (idx !== -1) {
      console.log(`[awb] FOUND at row ${idx} via column "${key}"`);
      return idx;
    }
  }

  const idx = rows.findIndex((r) =>
    Object.values(r).some((v) => matchesNeedle(v)),
  );
  if (idx !== -1) {
    console.log(`[awb] FOUND at row ${idx} via full-column scan`);
    return idx;
  }

  const edgeCandidates = isAmazon ? fuzzyEdgeCandidates(needle) : [];
  if (edgeCandidates.length) {
    const searchKeys = allAwbKeys.length ? allAwbKeys : headers;
    const hitRows = new Set<number>();
    rows.forEach((r, i) => {
      if (searchKeys.some((k) => edgeCandidates.includes(normalize(r[k])))) hitRows.add(i);
    });
    if (hitRows.size === 1) {
      const [only] = hitRows;
      console.log(`[awb] FOUND at row ${only} via edge-trim fallback (needle="${needle}")`);
      return only;
    }
    if (hitRows.size > 1) {
      console.warn(`[awb] edge-trim fallback ambiguous for "${needle}" — ${hitRows.size} candidate rows, refusing to guess`);
    }
  }

  console.warn(`[awb] NOT FOUND: "${needle}" (length=${needle.length})`);
  return -1;
}

// The value actually scanned (e.g. an Amazon barcode with a padding zero + check
// digit) is NOT the row's real AWB — it's only good for finding the row once. Every
// downstream write (pending-change tracking, the Firestore return doc, and the
// re-lookup during doUpload's fresh-file merge) must key off the row's own stored
// AWB instead, or that re-lookup — done with plain exact matching, no leniency —
// silently fails to find the row again and the status update never gets merged in.
export function resolveCanonicalAwb(row: MasterRow, fallback: string): string {
  const headers = Object.keys(row);
  const awbKeys = headers.filter((k) => {
    const n = k.toLowerCase().trim().replace(/\s+/g, " ");
    return AWB_PATTERNS.some((p) => p.test(n));
  });
  for (const k of awbKeys) {
    const v = normalize(row[k]);
    if (v) return String(row[k]);
  }
  return fallback;
}

export function getField(row: MasterRow, name: string): string {
  const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name.toLowerCase());
  return key ? String(row[key] ?? "") : "";
}

export function setField(row: MasterRow, name: string, value: string): MasterRow {
  const key =
    Object.keys(row).find((k) => k.toLowerCase().trim() === name.toLowerCase()) ?? name;
  return { ...row, [key]: value };
}
