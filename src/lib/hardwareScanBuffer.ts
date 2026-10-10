/**
 * Detects barcodes coming from a hardware scanner (TVS BS-series and similar)
 * in its default HID / "keyboard wedge" mode: the scanner "types" the whole
 * code as a burst of keystrokes a few ms apart, usually followed by Enter
 * (some are configured for Tab, or no suffix at all).
 *
 * Kept free of DOM/React so the timing rules can be unit-tested.
 */

/** Real scans are far shorter; anything this long is not an AWB. */
const MAX_LENGTH = 64;

export const SCAN_TIMING = {
  /** Shortest code accepted — Indian courier AWBs are 8–20 characters. */
  minLength: 5,
  /** Average gap between keys of one scan. Scanners: ~1–30ms. Humans: 100ms+. */
  maxAvgGapMs: 60,
  /** A pause this long ends the burst (flushes a suffix-less scan, or discards typing). */
  idleMs: 300,
} as const;

export class HardwareScanBuffer {
  private chars = "";
  private firstAt = 0;
  private lastAt = 0;

  get length(): number {
    return this.chars.length;
  }

  /** Add one printable character typed at `now` (ms). */
  push(char: string, now: number): void {
    if (this.chars && now - this.lastAt > SCAN_TIMING.idleMs) this.reset();
    if (!this.chars) this.firstAt = now;
    if (this.chars.length < MAX_LENGTH) this.chars += char;
    this.lastAt = now;
  }

  /** True when what's buffered looks like a scanner burst rather than human typing. */
  isScan(): boolean {
    const n = this.chars.trim().length;
    if (n < SCAN_TIMING.minLength || this.chars.length >= MAX_LENGTH) return false;
    const avgGap = (this.lastAt - this.firstAt) / Math.max(1, this.chars.length - 1);
    return avgGap <= SCAN_TIMING.maxAvgGapMs;
  }

  /** End the burst (Enter/Tab, or idle timeout). Returns the code if it was a scan. */
  take(): string | null {
    const code = this.isScan() ? this.chars.trim() : null;
    this.reset();
    return code;
  }

  reset(): void {
    this.chars = "";
    this.firstAt = 0;
    this.lastAt = 0;
  }
}
