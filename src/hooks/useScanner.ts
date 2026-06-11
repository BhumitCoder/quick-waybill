import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export function useScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onDecode: (text: string) => void,
  enabled: boolean,
) {
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (!result) return;
            const text = result.getText();
            const now = Date.now();
            if (lastRef.current.text === text && now - lastRef.current.at < 1500) return;
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
