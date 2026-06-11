import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Loader2,
  ScanLine, Package, RefreshCw, Sun, Moon, CloudUpload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanner } from "@/hooks/useScanner";
import { useTheme } from "@/hooks/useTheme";
import {
  findRowByAwb, getField, masterPath, readMasterRows,
  setField, writeMasterRows, type MasterRow,
} from "@/lib/masterService";
import { beep, errorBeep, vibrate } from "@/lib/scanner";
import type { SetupSelection } from "./SetupScreen";
import {
  invalidate, markScanned, setMaster, updateRow,
  useAppDispatch, useAppSelector,
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

  // Load master only if not cached (cache is pre-populated by SetupScreen)
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
          msg.includes("object-not-found") ? "No master file found for this platform" : msg,
        );
      } finally {
        if (!cancelled) setLoadingMaster(false);
      }
    })();
    return () => { cancelled = true; };
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
        pushResult({ id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, warning: true, error: "Already scanned" });
        return;
      }

      const idx = findRowByAwb(rowsRef.current, awb);
      if (idx === -1) {
        errorBeep();
        vibrate(30);
        toast.error("AWB not found", { description: awb });
        pushResult({ id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, error: "Not in master" });
        return;
      }

      const row = rowsRef.current[idx];
      const previousStatus = getField(row, "status") || "—";
      const orderId = getField(row, "order_id") || getField(row, "orderId") || getField(row, "Order ID");
      const productName =
        getField(row, "product_name") || getField(row, "productName") ||
        getField(row, "Product Name") || getField(row, "product");

      const updated = setField(row, "status", selection.status);
      rowsRef.current[idx] = updated;
      scannedAwbsRef.current.add(key);
      dispatch(updateRow({ path, index: idx, row: updated }));
      dispatch(markScanned({ path, awb: key }));

      beep();
      vibrate(50);
      pushResult({
        id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: true,
        orderInfo: { orderId, productName, previousStatus },
      });
      toast.success(`→ ${selection.status}`, { description: productName || orderId || awb });

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
  const failCount = results.filter((r) => !r.success && !r.warning).length;
  const warnCount = results.filter((r) => r.warning).length;

  return (
    <div className="flex h-dvh flex-col bg-black">
      {/* Header */}
      <header className="relative z-10 flex items-center gap-2 bg-black/80 px-3 pb-2.5 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-md">
        <Button onClick={onExit} variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl text-white/80 hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-white/50">
            {selection.company.name} · {selection.platform.name}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold capitalize text-white">{selection.status}</span>
            {loadingMaster && <Loader2 className="h-3 w-3 animate-spin text-white/50" />}
            {uploading && <CloudUpload className="h-3 w-3 text-sky-400 animate-pulse" />}
            {masterError && <AlertTriangle className="h-3 w-3 text-rose-400" />}
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-1.5">
          {successCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />{successCount}
            </span>
          )}
          {failCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
              <XCircle className="h-3 w-3" />{failCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
              <AlertTriangle className="h-3 w-3" />{warnCount}
            </span>
          )}
        </div>

        <Button onClick={handleRefresh} variant="ghost" size="icon" disabled={refreshing || loadingMaster}
          className="h-9 w-9 shrink-0 rounded-xl text-white/60 hover:bg-white/10 hover:text-white">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
        <Button onClick={toggle} variant="ghost" size="icon"
          className="h-9 w-9 shrink-0 rounded-xl text-white/60 hover:bg-white/10 hover:text-white">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* Camera */}
      <div className="relative w-full overflow-hidden bg-black" style={{ height: "min(60vw, 300px)" }}>
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

        {/* Dim overlay outside the scan frame */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
            style={{ width: "72%", height: "80%" }}
          />
        </div>

        {/* Scan frame */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative" style={{ width: "72%", height: "80%" }}>
            <FrameCorner pos="tl" />
            <FrameCorner pos="tr" />
            <FrameCorner pos="bl" />
            <FrameCorner pos="br" />
            <div className="absolute inset-x-0 top-1/2 h-px animate-scan bg-gradient-to-r from-transparent via-primary to-transparent shadow-glow" />
          </div>
        </div>

        {/* Bottom hint */}
        <p className="absolute inset-x-0 bottom-2 text-center text-[11px] font-medium text-white/60 drop-shadow">
          {loadingMaster ? "Loading master file…" : masterError ? masterError : "Align barcode inside the frame"}
        </p>
      </div>

      {/* Scan log */}
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Scan log
          </h2>
          <span className="text-[11px] text-muted-foreground">{results.length} total</span>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {results.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
              <div className="rounded-2xl bg-muted/50 p-4">
                <ScanLine className="h-7 w-7 text-muted-foreground opacity-50" />
              </div>
              <p className="text-sm text-muted-foreground">Scan results appear here</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {results.map((r) => (
                <LogRow key={r.id} r={r} />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border/60 bg-card/80 px-4 pb-[max(env(safe-area-inset-bottom),0.875rem)] pt-3 backdrop-blur">
          <Button onClick={onExit} variant="secondary" className="h-13 w-full rounded-2xl text-base font-bold">
            Done · {successCount} updated
          </Button>
        </div>
      </div>
    </div>
  );
}

function FrameCorner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const classes = {
    tl: "top-0 left-0 border-t-2 border-l-2 rounded-tl-xl",
    tr: "top-0 right-0 border-t-2 border-r-2 rounded-tr-xl",
    bl: "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl",
    br: "bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl",
  }[pos];
  return (
    <div
      className={`absolute h-7 w-7 border-primary ${classes}`}
      style={{ filter: "drop-shadow(0 0 6px var(--color-primary))" }}
    />
  );
}

function LogRow({ r }: { r: ScanResult }) {
  const time = r.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (r.success) {
    return (
      <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tabular-nums">{r.awb}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {r.orderInfo?.productName ? (
              <><Package className="mr-0.5 inline h-3 w-3" />{r.orderInfo.productName}</>
            ) : r.orderInfo?.orderId ? (
              `#${r.orderInfo.orderId}`
            ) : (
              "Updated"
            )}
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">{time}</span>
      </li>
    );
  }

  const Icon = r.warning ? AlertTriangle : XCircle;
  const tone = r.warning
    ? "border-amber-500/20 bg-amber-500/5"
    : "border-rose-500/20 bg-rose-500/5";
  const iconCls = r.warning ? "text-amber-400" : "text-rose-400";

  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2.5 ${tone}`}>
      <Icon className={`h-4 w-4 shrink-0 ${iconCls}`} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tabular-nums text-foreground">{r.awb}</p>
        <p className="truncate text-[11px] text-muted-foreground">{r.error}</p>
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">{time}</span>
    </li>
  );
}
