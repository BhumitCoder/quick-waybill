import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { Toaster } from "sonner";
import { SetupScreen, type SetupSelection } from "@/components/SetupScreen";
import { store } from "@/store";
import { useTheme } from "@/hooks/useTheme";

// Lazy-load the scanner screen so its heavy dependencies (ZXing ~1 MB,
// scanner logic) are not downloaded or parsed until the user actually
// taps "Start Scanning". This is the single biggest win for initial
// mobile load time.
const ScannerScreen = lazy(() =>
  import("@/components/ScannerScreen").then((m) => ({ default: m.ScannerScreen })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AWB Scanner — Bulk status updates" },
      { name: "description", content: "Scan AWB barcodes to bulk-update order statuses in your master files." },
      { property: "og:title", content: "AWB Scanner" },
      { property: "og:description", content: "Scan AWB barcodes to bulk-update order statuses." },
      { name: "theme-color", content: "#f8fafc" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Scanner" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", href: "/icon-192.png" },
    ],
  }),
  component: Index,
});

function Index() {
  const [selection, setSelection] = useState<SetupSelection | null>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <Provider store={store}>
      <div className="mx-auto max-w-[480px] bg-background text-foreground antialiased">
        {selection ? (
          <Suspense
            fallback={
              <div className="flex h-dvh items-center justify-center bg-[#080a0f]">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
                  <p className="text-[12px] text-white/30">Loading scanner…</p>
                </div>
              </div>
            }
          >
            <ScannerScreen selection={selection} onExit={() => setSelection(null)} />
          </Suspense>
        ) : (
          <SetupScreen onStart={setSelection} />
        )}
        <Toaster
          theme={isDark ? "dark" : "light"}
          position="top-center"
          richColors
          toastOptions={{ style: { marginTop: "env(safe-area-inset-top)" } }}
        />
      </div>
    </Provider>
  );
}
