import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  Loader2, ScanLine, Package, RefreshCw, Sun, Moon, CloudUpload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanner } from "@/hooks/useScanner";
import { useTheme } from "@/hooks/useTheme";
import {
  findRowByAwb, getField, masterPath, readMasterRows,
  setField, writeMasterRows, type MasterRow,
} from "@/lib/masterService";
import { beep, errorBeep, vibrate, unlockAudio } from "@/lib/scanner";
import type { SetupSelection } from "./SetupScreen";
import { invalidate, markScanned, setMaster, updateRow, useAppDispatch, useAppSelector } from "@/store";

type ScanResult = {
  id: string; awb: string; timestamp: Date; success: boolean;
  warning?: boolean;
  orderInfo?: { orderId: string; productName: string; previousStatus: string };
  error?: string;
};

const STATUS_CHIP: Record<string, string> = {
  pending:    "bg-amber-500/20 text-amber-300",
  processing: "bg-blue-500/20 text-blue-300",
  shipped:    "bg-cyan-500/20 text-cyan-300",
  delivered:  "bg-emerald-500/20 text-emerald-300",
  cancelled:  "bg-rose-500/20 text-rose-300",
  returned:   "bg-orange-500/20 text-orange-300",
  lost:       "bg-red-500/20 text-red-300",
  manifest:   "bg-violet-500/20 text-violet-300",
};

export function ScannerScreen({ selection, onExit }: { selection: SetupSelection; onExit: () => void }) {
  const { isDark, toggle } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const dispatch = useAppDispatch();

  const path = useMemo(() => masterPath(selection.company.id, selection.platform.id), [selection]);
  const cacheEntry = useAppSelector((s) => s.master.cache[path]);
  const rowsRef = useRef<MasterRow[] | null>(cacheEntry?.rows ?? null);
  const scannedRef = useRef<Set<string>>(new Set(cacheEntry?.scannedAwbs ?? []));
  const uploadingRef = useRef(false);

  const [loadingMaster, setLoadingMaster] = useState(!cacheEntry);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flashColor, setFlashColor] = useState<"green" | "red" | null>(null);

  useEffect(() => {
    if (cacheEntry) {
      rowsRef.current = cacheEntry.rows;
      scannedRef.current = new Set(cacheEntry.scannedAwbs);
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
        setMasterError(msg.includes("object-not-found") ? "No master file found" : msg);
      } finally {
        if (!cancelled) setLoadingMaster(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true); setMasterError(null);
    try {
      dispatch(invalidate({ path }));
      const rows = await readMasterRows(path);
      rowsRef.current = rows;
      scannedRef.current = new Set();
      dispatch(setMaster({ path, rows }));
      toast.success("Master file reloaded");
    } catch (e) {
      setMasterError((e as Error).message);
    } finally { setRefreshing(false); }
  }, [dispatch, path]);

  const pushResult = useCallback((r: ScanResult) => {
    setResults((p) => [r, ...p].slice(0, 200));
  }, []);

  const handleDecode = useCallback(async (text: string) => {
    const awb = text.trim();
    if (!awb || !rowsRef.current) return;
    const key = awb.toLowerCase();

    if (scannedRef.current.has(key)) {
      vibrate(30);
      setFlashColor("red");
      setTimeout(() => setFlashColor(null), 350);
      toast.warning("Already updated this session", { description: awb });
      pushResult({ id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, warning: true, error: "Already scanned" });
      return;
    }
    const idx = findRowByAwb(rowsRef.current, awb);
    if (idx === -1) {
      errorBeep(); vibrate(30);
      setFlashColor("red");
      setTimeout(() => setFlashColor(null), 350);
      toast.error("AWB not found", { description: awb });
      pushResult({ id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, error: "Not in master file" });
      return;
    }
    const row = rowsRef.current[idx];
    const previousStatus = getField(row, "status") || "—";
    const orderId = getField(row, "order_id") || getField(row, "orderId") || getField(row, "Order ID");
    const productName = getField(row, "product_name") || getField(row, "productName") || getField(row, "Product Name") || getField(row, "product");

    const updated = setField(row, "status", selection.status);
    rowsRef.current[idx] = updated;
    scannedRef.current.add(key);
    dispatch(updateRow({ path, index: idx, row: updated }));
    dispatch(markScanned({ path, awb: key }));

    beep(); vibrate(50);
    setFlashColor("green");
    setTimeout(() => setFlashColor(null), 350);
    pushResult({ id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: true, orderInfo: { orderId, productName, previousStatus } });
    toast.success(`→ ${selection.status}`, { description: productName || orderId || awb });

    if (!uploadingRef.current) {
      uploadingRef.current = true; setUploading(true);
      try {
        await new Promise((r) => setTimeout(r, 600));
        await writeMasterRows(path, rowsRef.current!);
      } catch (e) {
        toast.error("Upload failed", { description: (e as Error).message });
      } finally { uploadingRef.current = false; setUploading(false); }
    }
  }, [dispatch, path, pushResult, selection.status]);

  useScanner(videoRef, handleDecode, !loadingMaster && !masterError);

  const ok = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success && !r.warning).length;
  const warn = results.filter((r) => !!r.warning).length;
  const statusChipCls = STATUS_CHIP[selection.status] ?? "bg-white/10 text-white/70";

  return (
    <div className="flex h-dvh flex-col bg-black">
      {/* Safe area top */}
      <div style={{ height: "env(safe-area-inset-top)" }} className="bg-black" />

      {/* ── Header ── */}
      <header className="flex items-center gap-1.5 bg-black px-3 py-2">
        <Button onClick={onExit} variant="ghost" size="icon"
          className="h-9 w-9 shrink-0 rounded-xl text-white/60 hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1 min-w-0 px-1">
          <p className="truncate text-[11px] font-medium leading-none text-white/40">
            {selection.company.name} · {selection.platform.name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusChipCls}`}>
              {selection.status}
            </span>
            {loadingMaster && <Loader2 className="h-3 w-3 animate-spin text-white/40" />}
            {uploading && <CloudUpload className="h-3 w-3 text-sky-400 animate-pulse" />}
            {masterError && <AlertTriangle className="h-3 w-3 text-rose-400" />}
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex items-center gap-1">
          {ok > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />{ok}
            </span>
          )}
          {fail > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-bold text-rose-400">
              <XCircle className="h-3 w-3" />{fail}
            </span>
          )}
          {warn > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-bold text-amber-400">
              <AlertTriangle className="h-3 w-3" />{warn}
            </span>
          )}
        </div>

        <Button onClick={handleRefresh} variant="ghost" size="icon" disabled={refreshing || loadingMaster}
          className="h-9 w-9 shrink-0 rounded-xl text-white/50 hover:bg-white/10 hover:text-white">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
        <Button onClick={toggle} variant="ghost" size="icon"
          className="h-9 w-9 shrink-0 rounded-xl text-white/50 hover:bg-white/10 hover:text-white">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* ── Camera ── */}
      <div
        className="relative w-full shrink-0 overflow-hidden bg-black"
        style={{ height: "clamp(200px, 55vw, 310px)" }}
        onPointerDown={unlockAudio}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

        {/* Scan flash overlay */}
        {flashColor && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              backgroundColor: flashColor === "green" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
            }}
          />
        )}

        {/* Vignette outside frame */}
        <div className="pointer-events-none absolute inset-0 bg-black/50" />
        {/* Clear window */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl"
          style={{ width: "68%", height: "78%", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
        />

        {/* Frame corners */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: "68%", height: "78%" }}>
          {(["tl","tr","bl","br"] as const).map((p) => <Corner key={p} pos={p} />)}
          {/* Scan line */}
          {!loadingMaster && !masterError && (
            <div className="absolute inset-x-0 top-1/2 h-px animate-scan bg-gradient-to-r from-transparent via-primary to-transparent" style={{ filter: "drop-shadow(0 0 4px var(--color-primary))" }} />
          )}
        </div>

        {/* Center status */}
        {(loadingMaster || masterError) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/70 px-5 py-4 backdrop-blur">
              {loadingMaster ? (
                <><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="text-[13px] font-medium text-white/80">Loading master file…</p></>
              ) : (
                <><AlertTriangle className="h-6 w-6 text-rose-400" /><p className="text-[13px] font-medium text-white/80">{masterError}</p></>
              )}
            </div>
          </div>
        )}

        {/* Bottom hint */}
        {!loadingMaster && !masterError && (
          <p className="absolute inset-x-0 bottom-2.5 text-center text-[11px] font-medium text-white/50">
            Align AWB barcode inside the frame
          </p>
        )}
      </div>

      {/* ── Scan log ── */}
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Scan Log</h2>
          <span className="text-[11px] text-muted-foreground">{results.length} scanned</span>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {results.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10">
              <div className="grid h-14 w-14 place-items-center rounded-3xl bg-muted/60">
                <ScanLine className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">No scans yet</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground/60">Results appear here instantly</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {results.map((r) => <LogRow key={r.id} r={r} />)}
            </ul>
          )}
        </div>

        {/* Done bar */}
        <div className="border-t border-border/60 bg-card/60 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] backdrop-blur">
          <Button onClick={onExit} variant="secondary"
            className="h-14 w-full rounded-2xl text-[15px] font-bold">
            {ok > 0 ? `Done · ${ok} updated` : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "absolute h-6 w-6 border-primary/90";
  const variants = {
    tl: "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl",
    tr: "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl",
    bl: "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl",
    br: "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl",
  };
  return <div className={`${base} ${variants[pos]}`} style={{ filter: "drop-shadow(0 0 5px var(--color-primary))" }} />;
}

function LogRow({ r }: { r: ScanResult }) {
  const time = r.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (r.success) {
    return (
      <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold tabular-nums">{r.awb}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {r.orderInfo?.productName
              ? <><Package className="mr-0.5 inline h-3 w-3" />{r.orderInfo.productName}</>
              : r.orderInfo?.orderId ? `#${r.orderInfo.orderId}` : "Updated"}
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">{time}</span>
      </li>
    );
  }
  const Icon = r.warning ? AlertTriangle : XCircle;
  const style = r.warning
    ? "border-amber-500/20 bg-amber-500/5 [&_svg]:text-amber-500"
    : "border-rose-500/20 bg-rose-500/5 [&_svg]:text-rose-500";
  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2.5 ${style}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold tabular-nums text-foreground">{r.awb}</p>
        <p className="truncate text-[11px] text-muted-foreground">{r.error}</p>
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground/70">{time}</span>
    </li>
  );
}
