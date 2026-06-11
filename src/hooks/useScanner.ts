import { useEffect, useRef, useState, useCallback } from "react";

type Controls = { stop: () => void };

export type ScannerHandle = {
  errorRef: React.MutableRefObject<string | null>;
  hasTorch: boolean;
  torchOn: boolean;
  toggleTorch: () => void;
};

// ── Native BarcodeDetector ───────────────────────────────────────────────────

const NATIVE_FORMATS = [
  "code_128", "code_39", "code_93", "codabar",
  "ean_13", "ean_8", "itf", "upc_a", "upc_e",
  "qr_code", "data_matrix", "aztec", "pdf417",
];

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
    };
  }
}

async function hasNativeDetector(): Promise<boolean> {
  if (typeof window === "undefined" || !window.BarcodeDetector) return false;
  try {
    new window.BarcodeDetector({ formats: ["code_128"] });
    return true;
  } catch {
    return false;
  }
}

function startNativeDetector(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
): Controls {
  const detector = new window.BarcodeDetector!({ formats: NATIVE_FORMATS });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let running = true;

  function tick() {
    if (!running) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      detector
        .detect(canvas)
        .then((codes) => {
          if (codes.length > 0 && running) onResult(codes[0].rawValue);
        })
        .catch(() => {})
        .finally(() => {
          if (running) requestAnimationFrame(tick);
        });
    } else {
      // Video not ready yet — wait and retry
      setTimeout(() => { if (running) requestAnimationFrame(tick); }, 50);
    }
  }

  requestAnimationFrame(tick);
  return { stop: () => { running = false; } };
}

// ── ZXing fallback ───────────────────────────────────────────────────────────

async function startZxingScanner(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
): Promise<Controls> {
  const [{ BrowserMultiFormatReader }, lib] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);

  const hints = new Map<number, unknown>();
  hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [
    lib.BarcodeFormat.CODE_128,
    lib.BarcodeFormat.CODE_39,
    lib.BarcodeFormat.CODE_93,
    lib.BarcodeFormat.EAN_13,
    lib.BarcodeFormat.EAN_8,
    lib.BarcodeFormat.ITF,
    lib.BarcodeFormat.UPC_A,
    lib.BarcodeFormat.UPC_E,
    lib.BarcodeFormat.QR_CODE,
    lib.BarcodeFormat.DATA_MATRIX,
    lib.BarcodeFormat.PDF_417,
    lib.BarcodeFormat.AZTEC,
  ]);
  hints.set(lib.DecodeHintType.TRY_HARDER, true);

  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 20,
    delayBetweenScanSuccess: 300,
  });

  // ZXing manages the camera stream internally — do NOT open the stream
  // yourself before calling this or it will conflict.
  const controls = await reader.decodeFromConstraints(
    {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    video,
    (result) => {
      if (result) onResult(result.getText().trim());
    },
  );

  return { stop: () => controls.stop() };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onDecode: (text: string) => void,
  enabled: boolean,
): ScannerHandle {
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const errorRef = useRef<string | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  // Only used in the native path where we own the stream
  const ownStreamRef = useRef<MediaStream | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const dedupe = useCallback(
    (text: string) => {
      if (!text) return;
      const now = Date.now();
      if (lastRef.current.text === text && now - lastRef.current.at < 500) return;
      lastRef.current = { text, at: now };
      onDecode(text);
    },
    [onDecode],
  );

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await (track as MediaStreamTrack & {
        applyConstraints(c: { advanced: { torch: boolean }[] }): Promise<void>;
      }).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      /* torch not supported */
    }
  }, [torchOn]);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;

    let controls: Controls | null = null;
    let cancelled = false;

    (async () => {
      try {
        const useNative = await hasNativeDetector();
        if (cancelled) return;

        const video = videoRef.current!;

        if (useNative) {
          // ── Native path: we own the stream ───────────────────────────────
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 3840 },
              height: { ideal: 2160 },
            },
          });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

          ownStreamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          if (track) {
            trackRef.current = track;
            try {
              const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
              setHasTorch(!!caps.torch);
            } catch { /* getCapabilities not available in all browsers */ }
          }

          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => {});
          if (cancelled) return;

          controls = startNativeDetector(video, dedupe);
        } else {
          // ── ZXing path: ZXing owns the stream ────────────────────────────
          // Important: do NOT set video.srcObject before this call.
          // ZXing calls getUserMedia internally and sets it itself.
          controls = await startZxingScanner(video, dedupe);
          if (cancelled) { controls.stop(); return; }

          // Grab stream reference for torch after ZXing has opened the camera
          if (video.srcObject instanceof MediaStream) {
            const track = video.srcObject.getVideoTracks()[0];
            if (track) {
              trackRef.current = track;
              try {
                const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
                setHasTorch(!!caps.torch);
              } catch { /* ignore */ }
            }
          }
        }

        if (cancelled) controls?.stop();
      } catch (e) {
        if (!cancelled) {
          errorRef.current = (e as Error).message;
          console.error("Scanner init failed", e);
        }
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
      // Only stop streams we opened ourselves (native path)
      ownStreamRef.current?.getTracks().forEach((t) => t.stop());
      ownStreamRef.current = null;
      trackRef.current = null;
      setTorchOn(false);
      setHasTorch(false);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled, videoRef, dedupe]);

  return { errorRef, hasTorch, torchOn, toggleTorch };
}
