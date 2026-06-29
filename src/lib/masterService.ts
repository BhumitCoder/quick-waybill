import { ref, getDownloadURL, uploadBytes } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "./firebase";
import { idbGet, idbSet } from "./idbCache";

export type MasterRow = Record<string, unknown>;

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

// ── readMasterRows ───────────────────────────────────────────────────────────
//
// Load order (fastest first):
//   1. IndexedDB  — persistent, survives page reload, no network or parse cost
//   2. Network + Worker parse — download from Firebase Storage, parse off-thread
//   3. IDB write  — store result for next time

export async function readMasterRows(storagePath: string): Promise<MasterRow[]> {
  // 1. IndexedDB hit — instant, no parsing
  const cached = await idbGet(storagePath);
  if (cached) {
    console.log("[master] IDB cache hit:", storagePath, `(${cached.length} rows)`);
    return cached as MasterRow[];
  }

  // 2. Download + parse in worker
  const { arrayBuffer, resolvedPath } = await downloadArrayBuffer(storagePath);
  const rows = await parseInWorker(arrayBuffer);

  // Log AWB column info (fast, main-thread safe)
  logAwbInfo(rows, resolvedPath);

  // 3. Persist to IDB so next load is instant
  idbSet(storagePath, rows).catch(() => {}); // fire-and-forget

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
        { storagePath, companyId, platformId, updatedAt: serverTimestamp() },
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

export function findRowByAwb(rows: MasterRow[], awb: string): number {
  if (!rows.length) return -1;

  const needle = normalize(awb);
  if (!needle) return -1;

  const headers = Object.keys(rows[0]);
  const allAwbKeys = headers.filter((k) => {
    const n = k.toLowerCase().trim().replace(/\s+/g, " ");
    return AWB_PATTERNS.some((p) => p.test(n));
  });

  console.log(`[awb] looking for "${needle}" (length=${needle.length}), AWB columns: ${JSON.stringify(allAwbKeys)}`);

  for (const key of allAwbKeys) {
    const idx = rows.findIndex((r) => normalize(r[key]) === needle);
    if (idx !== -1) {
      console.log(`[awb] FOUND at row ${idx} via column "${key}"`);
      return idx;
    }
  }

  const idx = rows.findIndex((r) =>
    Object.values(r).some((v) => normalize(v) === needle),
  );
  if (idx !== -1) {
    console.log(`[awb] FOUND at row ${idx} via full-column scan`);
  } else {
    console.warn(`[awb] NOT FOUND: "${needle}" (length=${needle.length})`);
  }
  return idx;
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
