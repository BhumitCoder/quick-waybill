/** How this device reads barcodes — chosen on the setup screen, remembered per device. */
export type ScanInput = "camera" | "scanner";

const KEY = "awb_scan_input";
const LEGACY_CAMERA_KEY = "awb_camera_enabled"; // "0" = camera turned off (hardware scanner)

export function readScanInput(): ScanInput {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "camera" || v === "scanner") return v;
    return localStorage.getItem(LEGACY_CAMERA_KEY) === "0" ? "scanner" : "camera";
  } catch {
    return "camera";
  }
}

export function writeScanInput(v: ScanInput): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable — the choice lasts this session only */
  }
}
