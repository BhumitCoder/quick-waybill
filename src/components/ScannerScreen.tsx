import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Loader2, ScanLine, Package, RefreshCw, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanner } from "@/hooks/useScanner";
import { useTheme } from "@/hooks/useTheme";
import {
  findRowByAwb,
  getField,
  masterPath,
  readMasterRows,
  setField,
  writeMasterRows,
  type MasterRow,
} from "@/lib/masterService";
import { beep, errorBeep, vibrate } from "@/lib/scanner";
import type { SetupSelection } from "./SetupScreen";
import {
  invalidate,
  markScanned,
  setMaster,
  updateRow,
  useAppDispatch,
  useAppSelector,
} from "@/store";

type ScanResult = {
  id: string;
  awb: string;
  timestamp: Date;
  success: boolean;
  warning?: boolean;
  orderInfo?: { orderId: string; productName: string; previousStatus: string };
  error?: string;
};

export function ScannerScreen({ selection, onExit }: { selection: SetupSelection; onExit: () => void }) {
  const { isDark, toggle } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const dispatch = useAppDispatch();

  const path = useMemo(
    () => masterPath(selection.company.id, selection.platform.id),
    [selection],
  );

  const cacheEntry = useAppSelector((s) => s.master.cache[path]);
  const rowsRef = useRef<MasterRow[] | null>(cacheEntry?.rows ?? null);
  const scannedAwbsRef = useRef<Set<string>>(new Set(cacheEntry?.scannedAwbs ?? []));
  const uploadingRef = useRef(false);

  const [loadingMaster, setLoadingMaster] = useState(!cacheEntry);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load master only if not cached
  useEffect(() => {
    if (cacheEntry) {
      rowsRef.current = cacheEntry.rows;
      scannedAwbsRef.current = new Set(cacheEntry.scannedAwbs);
      setLoadingMaster(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMaster(true);
      try {
        const rows = await readMasterRows(path);
        if (cancelled) return;
        rowsRef.current = rows;
        dispatch(setMaster({ path, rows }));
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message;
        setMasterError(
          msg.includes("object-not-found")
            ? "No master file found for this platform"
            : msg,
        );
      } finally {
        if (!cancelled) setLoadingMaster(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setMasterError(null);
    try {
      dispatch(invalidate({ path }));
      const rows = await readMasterRows(path);
      rowsRef.current = rows;
      scannedAwbsRef.current = new Set();
      dispatch(setMaster({ path, rows }));
      toast.success("Master file reloaded");
    } catch (e) {
      setMasterError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, path]);

  const pushResult = useCallback((r: ScanResult) => {
    setResults((prev) => [r, ...prev].slice(0, 200));
  }, []);

  const handleDecode = useCallback(
    async (text: string) => {
      const awb = text.trim();
      if (!awb || !rowsRef.current) return;

      const key = awb.toLowerCase();
      if (scannedAwbsRef.current.has(key)) {
        vibrate(30);
        toast.warning("Already updated this session", { description: awb });
        pushResult({
          id: `${Date.now()}-${awb}`,
          awb,
          timestamp: new Date(),
          success: false,
          warning: true,
          error: "Already scanned",
        });
        return;
      }

      const idx = findRowByAwb(rowsRef.current, awb);
      if (idx === -1) {
        errorBeep();
        vibrate(30);
        toast.error("AWB not found", { description: awb });
        pushResult({
          id: `${Date.now()}-${awb}`,
          awb,
          timestamp: new Date(),
          success: false,
          error: "Not in master",
        });
        return;
      }

      const row = rowsRef.current[idx];
      const previousStatus = getField(row, "status") || "—";
      const orderId = getField(row, "order_id") || getField(row, "orderId") || getField(row, "Order ID");
      const productName =
        getField(row, "product_name") ||
        getField(row, "productName") ||
        getField(row, "Product Name") ||
        getField(row, "product");

      // Optimistic UI + cache update
      const updated = setField(row, "status", selection.status);
      rowsRef.current[idx] = updated;
      scannedAwbsRef.current.add(key);
      dispatch(updateRow({ path, index: idx, row: updated }));
      dispatch(markScanned({ path, awb: key }));

      beep();
      vibrate(50);
      pushResult({
        id: `${Date.now()}-${awb}`,
        awb,
        timestamp: new Date(),
        success: true,
        orderInfo: { orderId, productName, previousStatus },
      });
      toast.success(`→ ${selection.status}`, {
        description: productName || orderId || awb,
      });

      // Coalesce uploads
      if (!uploadingRef.current) {
        uploadingRef.current = true;
        setUploading(true);
        try {
          await new Promise((r) => setTimeout(r, 600));
          await writeMasterRows(path, rowsRef.current!);
        } catch (e) {
          toast.error("Upload failed", { description: (e as Error).message });
        } finally {
          uploadingRef.current = false;
          setUploading(false);
        }
      }
    },
    [dispatch, path, pushResult, selection.status],
  );

  useScanner(videoRef, handleDecode, !loadingMaster && !masterError);


  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success && !r.warning).length;

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border bg-card/80 px-3 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur">
        <Button
          onClick={onExit}
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span className="truncate">{selection.platform.name}</span>
            <span>›</span>
            <span className="truncate capitalize text-primary">{selection.status}</span>
          </div>
          <h1 className="truncate text-sm font-bold">{selection.company.name}</h1>
        </div>
        <Button
          onClick={handleRefresh}
          variant="ghost"
          size="icon"
          disabled={refreshing || loadingMaster}
          className="h-10 w-10 rounded-xl"
          title="Reload master file"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
        <div className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>{successCount}</span>
          {failedCount > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <XCircle className="h-3.5 w-3.5 text-rose-400" />
              <span>{failedCount}</span>
            </>
          )}
        </div>
      </header>

      {/* Camera */}
      <div className="relative aspect-square w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {/* Overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-2/3 w-4/5">
            {/* corners */}
            <Corner className="left-0 top-0 border-l-4 border-t-4" />
            <Corner className="right-0 top-0 border-r-4 border-t-4" />
            <Corner className="bottom-0 left-0 border-b-4 border-l-4" />
            <Corner className="bottom-0 right-0 border-b-4 border-r-4" />
            {/* scan line */}
            <div className="absolute inset-x-2 top-1/2 h-0.5 animate-scan bg-gradient-to-r from-transparent via-primary to-transparent shadow-glow" />
          </div>
        </div>

        {/* Status badges */}
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          {loadingMaster && (
            <Badge tone="info">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading master…
            </Badge>
          )}
          {uploading && (
            <Badge tone="info">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing
            </Badge>
          )}
          {masterError && (
            <Badge tone="error">
              <AlertTriangle className="h-3 w-3" /> {masterError}
            </Badge>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/80 drop-shadow">
          Align AWB barcode inside the frame
        </div>
      </div>

      {/* Scan log */}
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scan history
          </h2>
          <span className="text-[11px] text-muted-foreground">{results.length} total</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {results.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <ScanLine className="h-8 w-8 opacity-40" />
              <p className="text-sm">Scans will appear here</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {results.map((r) => (
                <LogRow key={r.id} r={r} />
              ))}
            </ul>
          )}
        </div>

        {/* Bottom action */}
        <div className="border-t border-border bg-card px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
          <Button
            onClick={onExit}
            variant="secondary"
            className="h-14 w-full rounded-2xl text-base font-bold"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <div
      className={`absolute h-8 w-8 rounded-md border-primary ${className}`}
      style={{ boxShadow: "0 0 12px var(--color-primary)" }}
    />
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "info" | "error";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "bg-destructive/90 text-destructive-foreground"
      : "bg-black/60 text-white backdrop-blur";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function LogRow({ r }: { r: ScanResult }) {
  const time = r.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (r.success) {
    return (
      <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.awb}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {r.orderInfo?.productName ? (
              <>
                <Package className="mr-1 inline h-3 w-3" />
                {r.orderInfo.productName}
              </>
            ) : (
              r.orderInfo?.orderId || "Updated"
            )}
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">{time}</span>
      </li>
    );
  }
  const Icon = r.warning ? AlertTriangle : XCircle;
  const tone = r.warning
    ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
    : "border-rose-500/20 bg-rose-500/5 text-rose-400";
  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2.5 ${tone}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{r.awb}</p>
        <p className="truncate text-[11px] text-muted-foreground">{r.error}</p>
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">{time}</span>
    </li>
  );
}
