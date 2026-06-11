import { ref, getBytes, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

export type MasterRow = Record<string, unknown>;

export function masterPath(companyId: string, platformId: string) {
  return `companies/${companyId}/platforms/${platformId}/master.xlsx`;
}

// xlsx is ~850 KB — import dynamically so it never blocks the initial page load.
async function getXLSX() {
  return import("xlsx");
}

export async function readMasterRows(storagePath: string): Promise<MasterRow[]> {
  const [XLSX, fileRef] = await Promise.all([
    getXLSX(),
    Promise.resolve(ref(storage, storagePath)),
  ]);
  const bytes = await getBytes(fileRef);

  // Yield to the event loop so the UI stays responsive before heavy parsing.
  await new Promise((r) => setTimeout(r, 0));

  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Use raw: true (default) — returns actual JS values, not formatted strings.
  // raw: false would convert large numeric AWBs to scientific notation
  // ("1.53955E+14") which never matches the scanned barcode string.
  return XLSX.utils.sheet_to_json<MasterRow>(sheet, { defval: "" });
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

  const awbKey = detectAwbKey(Object.keys(rows[0]));

  // 1. Known AWB column — exact match (fast path, covers 99% of cases)
  if (awbKey) {
    const idx = rows.findIndex((r) => normalize(r[awbKey]) === needle);
    if (idx !== -1) return idx;
  }

  // 2. No recognised AWB column header — scan every column for exact match.
  //    Handles custom / non-standard column names.
  if (!awbKey) {
    return rows.findIndex((r) =>
      Object.values(r).some((v) => normalize(v) === needle),
    );
  }

  return -1;
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
