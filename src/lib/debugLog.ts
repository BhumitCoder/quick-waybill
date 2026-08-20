// In-memory ring buffer mirroring console output, so it can be viewed on-screen
// on a phone that has no way to open devtools. Patches console methods once,
// at import time — this module must be imported before anything that logs.

export type LogEntry = { level: "log" | "warn" | "error"; text: string; at: number };

const MAX_ENTRIES = 500;
const buffer: LogEntry[] = [];
const subscribers = new Set<(entries: LogEntry[]) => void>();

// ZXing logs this on every single camera frame where no barcode is found —
// several times a second while the camera is pointed at anything. It's already
// filtered from the real console (see useScanner.ts's suppressZxingConsoleSpam),
// but this capture wraps console.error OUTSIDE that filter, so without this
// check it floods the ring buffer and evicts every actually-useful log line
// (file fetch, AWB match attempt) within seconds of the camera turning on.
function isKnownNoise(args: unknown[]): boolean {
  return typeof args[0] === "string" && args[0].startsWith("MultiFormatReader:");
}

function push(level: LogEntry["level"], args: unknown[]) {
  if (isKnownNoise(args)) return;
  const text = args
    .map((a) => (typeof a === "string" ? a : safeStringify(a)))
    .join(" ");
  buffer.push({ level, text, at: Date.now() });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  for (const fn of subscribers) fn(buffer);
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

let patched = false;
export function installDebugLogCapture() {
  if (patched) return;
  patched = true;
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...args: unknown[]) => { push("log", args); orig.log(...args); };
  console.warn = (...args: unknown[]) => { push("warn", args); orig.warn(...args); };
  console.error = (...args: unknown[]) => { push("error", args); orig.error(...args); };
}

export function getDebugLog(): LogEntry[] {
  return buffer;
}

export function subscribeDebugLog(fn: (entries: LogEntry[]) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function clearDebugLog() {
  buffer.length = 0;
  for (const fn of subscribers) fn(buffer);
}
