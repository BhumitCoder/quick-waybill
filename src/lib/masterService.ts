import { ref, getDownloadURL, uploadBytes } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "./firebase";

export type MasterRow = Record<string, unknown>;

export function masterPath(companyId: string, platformId: string) {
  return `companies/${companyId}/platforms/${platformId}/master.xlsx`;
}

export function masterPathXls(companyId: string, platformId: string) {
  return `companies/${companyId}/platforms/${platformId}/master.xls`;
}

// xlsx is ~850 KB — import dynamically so it never blocks the initial page load.
async function getXLSX() {
  return import("xlsx");
}

export async function readMasterRows(storagePath: string): Promise<MasterRow[]> {
  const XLSX = await getXLSX();

  // Try the given path first; if not found and it ends in .xlsx, also try .xls
  // so that files manually uploaded to Firebase with the old .xls extension work.
  // Uses getDownloadURL() + fetch() — getBytes() is blocked by CORS in production.
  let resolvedPath = storagePath;
  let arrayBuffer: ArrayBuffer;
  try {
    console.log("[master] fetching:", storagePath);
    const url = await getDownloadURL(ref(storage, storagePath));
    const res = await fetch(url);
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: "storage/unknown" });
    arrayBuffer = await res.arrayBuffer();
    console.log("[master] fetched OK:", storagePath);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "storage/object-not-found" && storagePath.endsWith(".xlsx")) {
      resolvedPath = storagePath.replace(/\.xlsx$/, ".xls");
      console.log("[master] .xlsx not found, trying fallback:", resolvedPath);
      const url = await getDownloadURL(ref(storage, resolvedPath));
      const res = await fetch(url);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: "storage/unknown" });
      arrayBuffer = await res.arrayBuffer();
      console.log("[master] fetched OK (fallback):", resolvedPath);
    } else {
      console.error("[master] fetch error:", code, e);
      throw e;
    }
  }

  // Yield to the event loop so the UI stays responsive before heavy parsing.
  await new Promise((r) => setTimeout(r, 0));

  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Use raw: true (default) — returns actual JS values, not formatted strings.
  // raw: false would convert large numeric AWBs to scientific notation
  // ("1.53955E+14") which never matches the scanned barcode string.
  const rows = XLSX.utils.sheet_to_json<MasterRow>(sheet, { defval: "" });

  const headers = rows.length ? Object.keys(rows[0]) : [];
  const awbKey = detectAwbKey(headers);

  // Log ALL columns that look like AWB columns (not just the first match)
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

  // Show first 3 values for every AWB-like column so we can see which has the barcodes
  if (allAwbKeys.length > 0) {
    const preview: Record<string, unknown[]> = {};
    for (const key of allAwbKeys) {
      preview[key] = rows.slice(0, 3).map((r) => ({ raw: r[key], type: typeof r[key], normalized: normalize(r[key]) }));
    }
    console.log("[master] AWB column value samples:", preview);
  }

  return rows;
}

export async function writeMasterRows(storagePath: string, rows: MasterRow[]): Promise<void> {
  const XLSX = await getXLSX();
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
  // path format: companies/{companyId}/platforms/{platformId}/master.xlsx
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
    } catch { /* sync signal is best-effort — never block a scan */ }
  }
}

// ── AWB column detection ────────────────────────────────────────────────────
//
// Common column header names for air-waybill / tracking numbers.
// All checked case-insensitively after collapsing whitespace.

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

// ── Normalize ───────────────────────────────────────────────────────────────

export const normalize = (s: unknown): string => {
  if (s === null || s === undefined) return "";
  // Numbers: use integer string for whole numbers (avoids "1.5e14" notation).
  if (typeof s === "number") {
    return Number.isInteger(s) ? String(Math.trunc(s)) : String(s);
  }
  return String(s).trim().toLowerCase();
};

// ── findRowByAwb ─────────────────────────────────────────────────────────────
//
// Returns the index of the first row whose AWB column matches `awb`.
//
// Strategy:
//   1. Detect the AWB column by matching the header against known patterns.
//   2. Exact-match the normalized scanned value against the detected column.
//   3. If no AWB column header is recognised, scan EVERY column for an exact
//      match — handles custom / non-standard column names.

export function findRowByAwb(rows: MasterRow[], awb: string): number {
  if (!rows.length) return -1;

  const needle = normalize(awb);
  if (!needle) return -1;

  const headers = Object.keys(rows[0]);
  // Collect ALL columns that look like AWB columns — not just the first one.
  // This handles files where "awb" is an internal ID but "AWB No" has the barcode.
  const allAwbKeys = headers.filter((k) => {
    const n = k.toLowerCase().trim().replace(/\s+/g, " ");
    return AWB_PATTERNS.some((p) => p.test(n));
  });
  const awbKey = allAwbKeys[0]; // primary (first match, for logging)

  console.log(`[awb] looking for "${needle}" (length=${needle.length}), AWB columns: ${JSON.stringify(allAwbKeys)}`);

  // 1. Search in every recognised AWB column (fast path)
  for (const key of allAwbKeys) {
    const idx = rows.findIndex((r) => normalize(r[key]) === needle);
    if (idx !== -1) {
      console.log(`[awb] FOUND at row ${idx} via column "${key}"`);
      return idx;
    }
    console.log(`[awb] not in column "${key}", sample:`, rows.slice(0, 3).map((r) => ({ raw: r[key], normalized: normalize(r[key]) })));
  }

  // 2. Fallback — scan every column for an exact match.
  const idx = rows.findIndex((r) =>
    Object.values(r).some((v) => normalize(v) === needle),
  );
  if (idx !== -1) {
    console.log(`[awb] FOUND at row ${idx} via full-column scan`);
  } else {
    console.warn(
      `[awb] NOT FOUND: "${needle}" (length=${needle.length})`,
      "\n  scanned chars:", [...needle].map((c) => `${c}(${c.charCodeAt(0)})`).join(" "),
      "\n  first 3 rows (all AWB cols):", rows.slice(0, 3).map((r) =>
        Object.fromEntries(allAwbKeys.map((k) => [k, { raw: r[k], normalized: normalize(r[k]) }]))
      ),
    );
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
