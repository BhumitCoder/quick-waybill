import { ref, getBytes, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

export type MasterRow = Record<string, unknown>;

export function masterPath(companyId: string, platformId: string) {
  return `companies/${companyId}/platforms/${platformId}/master.xlsx`;
}

// xlsx is ~850 KB — import it dynamically so it never blocks the initial page
// load / paint on mobile.
async function getXLSX() {
  return import("xlsx");
}

export async function readMasterRows(storagePath: string): Promise<MasterRow[]> {
  const [XLSX, fileRef] = await Promise.all([
    getXLSX(),
    Promise.resolve(ref(storage, storagePath)),
  ]);
  const bytes = await getBytes(fileRef);

  // XLSX.read is synchronous and can freeze the main thread on large files.
  // Yield to the event loop first so the UI stays responsive.
  await new Promise((r) => setTimeout(r, 0));

  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
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

export const normalize = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function findRowByAwb(rows: MasterRow[], awb: string): number {
  const n = normalize(awb);
  return rows.findIndex((r) => {
    const keys = Object.keys(r);
    const awbKey = keys.find((k) => k.toLowerCase().trim() === "awb");
    return awbKey ? normalize(r[awbKey]) === n : false;
  });
}

export function getField(row: MasterRow, name: string): string {
  const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name.toLowerCase());
  return key ? String(row[key] ?? "") : "";
}

export function setField(row: MasterRow, name: string, value: string): MasterRow {
  const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name.toLowerCase()) ?? name;
  return { ...row, [key]: value };
}
