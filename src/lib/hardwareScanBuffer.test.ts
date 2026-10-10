import { describe, it, expect } from "vitest";
import { HardwareScanBuffer, SCAN_TIMING } from "./hardwareScanBuffer";

/** Feed `text` one char at a time, `gap` ms apart, starting at `start`. Returns the last timestamp. */
function type(buf: HardwareScanBuffer, text: string, gap: number, start = 1000): number {
  let t = start;
  for (const ch of text) {
    buf.push(ch, t);
    t += gap;
  }
  return t - gap;
}

describe("HardwareScanBuffer", () => {
  it("accepts a fast scanner burst", () => {
    const b = new HardwareScanBuffer();
    type(b, "SF1234567890", 8);
    expect(b.take()).toBe("SF1234567890");
  });

  it("tolerates Bluetooth jitter as long as the average stays scanner-fast", () => {
    const b = new HardwareScanBuffer();
    let t = 1000;
    for (const [i, ch] of [..."1490812345678"].entries()) {
      b.push(ch, t);
      t += i === 5 ? 150 : 10;
    }
    expect(b.take()).toBe("1490812345678");
  });

  it("rejects human-speed typing", () => {
    const b = new HardwareScanBuffer();
    type(b, "123456789", 140);
    expect(b.take()).toBeNull();
  });

  it("rejects codes shorter than the minimum", () => {
    const b = new HardwareScanBuffer();
    type(b, "1".repeat(SCAN_TIMING.minLength - 1), 5);
    expect(b.take()).toBeNull();
  });

  it("starts a fresh burst after an idle pause, dropping stray earlier keys", () => {
    const b = new HardwareScanBuffer();
    b.push("x", 0);
    const last = type(b, "AWB98765432", 6, 0 + SCAN_TIMING.idleMs + 50);
    expect(last).toBeGreaterThan(0);
    expect(b.take()).toBe("AWB98765432");
  });

  it("is empty after take, so two scans never merge", () => {
    const b = new HardwareScanBuffer();
    type(b, "11111111", 5);
    expect(b.take()).toBe("11111111");
    expect(b.length).toBe(0);
    type(b, "22222222", 5, 2000);
    expect(b.take()).toBe("22222222");
  });

  it("rejects runaway input longer than any real code", () => {
    const b = new HardwareScanBuffer();
    type(b, "9".repeat(100), 2);
    expect(b.take()).toBeNull();
  });

  it("keeps letters and case exactly as scanned", () => {
    const b = new HardwareScanBuffer();
    type(b, "Zx-12AB/34", 4);
    expect(b.take()).toBe("Zx-12AB/34");
  });
});
