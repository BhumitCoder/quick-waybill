import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua));
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const handler = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed) return null;

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      setOpen(false);
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <Button
        onClick={handleInstall}
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
        title="Install App"
      >
        <Download className="h-[18px] w-[18px]" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg">Install AWB Scanner</DialogTitle>
            <DialogDescription>
              Add to your home screen for the best scanning experience.
            </DialogDescription>
          </DialogHeader>
          <ol className="mt-1 space-y-3">
            {isIOS ? (
              <>
                <Step n={1}><>Tap the <Share className="inline mx-0.5 h-4 w-4 align-middle" /> Share button in Safari</></Step>
                <Step n={2}><>Choose <Plus className="inline mx-0.5 h-4 w-4 align-middle" /> "Add to Home Screen"</></Step>
                <Step n={3}>Tap "Add" to confirm</Step>
              </>
            ) : (
              <>
                <Step n={1}>Open the browser menu (⋮)</Step>
                <Step n={2}>Tap "Install app" or "Add to Home screen"</Step>
                <Step n={3}>Confirm to install</Step>
              </>
            )}
          </ol>
          <Button onClick={() => setOpen(false)} variant="secondary" className="mt-2 h-12 w-full rounded-2xl font-semibold">
            <X className="mr-2 h-4 w-4" /> Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{n}</span>
      <span className="text-foreground/80 leading-relaxed">{children}</span>
    </li>
  );
}
