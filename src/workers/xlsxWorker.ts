import * as XLSX from "xlsx";

type Request = { id: number; arrayBuffer: ArrayBuffer };
type Response = { id: number; ok: true; rows: Record<string, unknown>[] } | { id: number; ok: false; error: string };

addEventListener("message", (e: MessageEvent<Request>) => {
  const { id, arrayBuffer } = e.data;
  try {
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    postMessage({ id, ok: true, rows } satisfies Response);
  } catch (err) {
    postMessage({ id, ok: false, error: String(err) } satisfies Response);
  }
});
