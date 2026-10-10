import { useEffect, useRef } from "react";
import { HardwareScanBuffer, SCAN_TIMING } from "@/lib/hardwareScanBuffer";

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * Listen for a hardware barcode scanner (TVS etc., USB or Bluetooth paired as
 * a keyboard) anywhere on the page — no input needs focus. Calls `onScan` with
 * each complete code. While a text field (the manual AWB box) has focus, the
 * scanner's keystrokes are left to that field, whose Enter already submits.
 */
export function useHardwareScanner(onScan: (code: string) => void): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const buffer = new HardwareScanBuffer();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      const code = buffer.take();
      if (code) onScanRef.current(code);
      return code;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextField(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;

      if (e.key === "Enter" || e.key === "Tab") {
        // Only swallow the key when it ends a scan — otherwise Enter must still
        // activate a focused button and Tab must still move focus.
        if (buffer.isScan()) {
          e.preventDefault();
          e.stopPropagation();
          flush();
        } else {
          buffer.reset();
        }
        return;
      }

      if (e.key.length !== 1 || e.repeat) return; // Shift, CapsLock, arrows, …
      // A focused button would treat a scanned space as a click
      e.preventDefault();
      buffer.push(e.key, performance.now());
      // Scanners set to "no suffix" never send Enter — flush once the burst goes quiet
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(flush, SCAN_TIMING.idleMs);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);
}
