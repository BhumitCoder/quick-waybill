import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader, BrowserCodeReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";

const BARCODE_FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.PDF_417,
];

function buildReader() {
  const hintsMap = new Map<unknown, unknown>();
  hintsMap.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS);
  hintsMap.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hintsMap as never, {
    delayBetweenScanAttempts: 50,
    delayBetweenScanSuccess: 500,
  });
}

async function getBestCamera(): Promise<string | undefined> {
  try {
    const devices = await BrowserCodeReader.listVideoInputDevices();
    const back = devices.find((d: MediaDeviceInfo) =>
      /back|rear|environment/i.test(d.label),
    );
    return back?.deviceId ?? devices[devices.length - 1]?.deviceId;
  } catch {
    return undefined;
  }
}

export function useScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onDecode: (text: string) => void,
  enabled: boolean,
) {
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;

    const reader = buildReader();
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const deviceId = await getBestCamera();

        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };

        if (deviceId) {
          videoConstraints.deviceId = { exact: deviceId };
        } else {
          videoConstraints.facingMode = { ideal: "environment" };
        }

        controls = await reader.decodeFromConstraints(
          { video: videoConstraints },
          videoRef.current!,
          (result: unknown) => {
            if (!result) return;
            const text = (result as { getText(): string }).getText().trim();
            if (!text) return;
            const now = Date.now();
            if (lastRef.current.text === text && now - lastRef.current.at < 600)
              return;
            lastRef.current = { text, at: now };
            onDecode(text);
          },
        );

        if (cancelled) controls?.stop();
      } catch (e) {
        errorRef.current = (e as Error).message;
        console.error("Scanner init failed", e);
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [enabled, videoRef, onDecode]);

  return errorRef;
}
