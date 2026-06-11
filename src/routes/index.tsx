import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster } from "sonner";
import { SetupScreen, type SetupSelection } from "@/components/SetupScreen";
import { ScannerScreen } from "@/components/ScannerScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AWB Scanner — Bulk status updates" },
      { name: "description", content: "Scan AWB barcodes to bulk-update order statuses in your master files." },
      { property: "og:title", content: "AWB Scanner" },
      { property: "og:description", content: "Scan AWB barcodes to bulk-update order statuses." },
      { name: "theme-color", content: "#0f172a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
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

  return (
    <div className="dark mx-auto max-w-[480px] bg-background text-foreground antialiased">
      {selection ? (
        <ScannerScreen selection={selection} onExit={() => setSelection(null)} />
      ) : (
        <SetupScreen onStart={setSelection} />
      )}
      <Toaster
        theme="dark"
        position="top-center"
        richColors
        toastOptions={{ style: { marginTop: "env(safe-area-inset-top)" } }}
      />
    </div>
  );
}
