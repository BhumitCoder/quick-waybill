import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  Loader2, RefreshCw, CloudUpload, Zap, Hash, Flashlight, FlashlightOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanner } from "@/hooks/useScanner";
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

const STATUS_COLOR: Record<string, { bg: string; text: string; glow: string }> = {
  pending:    { bg: "bg-amber-500/20",   text: "text-amber-300",   glow: "#f59e0b" },
  processing: { bg: "bg-blue-500/20",    text: "text-blue-300",    glow: "#3b82f6" },
  shipped:    { bg: "bg-cyan-500/20",    text: "text-cyan-300",    glow: "#06b6d4" },
  delivered:  { bg: "bg-emerald-500/20", text: "text-emerald-300", glow: "#10b981" },
  cancelled:  { bg: "bg-rose-500/20",    text: "text-rose-300",    glow: "#f43f5e" },
  returned:   { bg: "bg-orange-500/20",  text: "text-orange-300",  glow: "#f97316" },
  lost:       { bg: "bg-red-500/20",     text: "text-red-300",     glow: "#ef4444" },
  manifest:   { bg: "bg-violet-500/20",  text: "text-violet-300",  glow: "#8b5cf6" },
};

export function ScannerScreen({ selection, onExit }: { selection: SetupSelection; onExit: () => void }) {
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
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [flashType, setFlashType] = useState<"success" | "error" | null>(null);

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

  const flash = useCallback((type: "success" | "error") => {
    setFlashType(type);
    setTimeout(() => setFlashType(null), 400);
  }, []);

  const handleDecode = useCallback(async (text: string) => {
    const awb = text.trim();
    if (!awb || !rowsRef.current) return;
    const key = awb.toLowerCase();

    if (scannedRef.current.has(key)) {
      vibrate(30);
      flash("error");
      const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, warning: true, error: "Already scanned this session" };
      setLastScan(r);
      setResults((p) => [r, ...p].slice(0, 200));
      toast.warning("Already scanned", { description: awb });
      return;
    }

    const idx = findRowByAwb(rowsRef.current, awb);
    if (idx === -1) {
      errorBeep(); vibrate(30);
      flash("error");
      const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, error: "AWB not in master file" };
      setLastScan(r);
      setResults((p) => [r, ...p].slice(0, 200));
      toast.error("AWB not found", { description: awb });
      return;
    }

    const row = rowsRef.current[idx];
    const previousStatus = getField(row, "status") || "—";
    const orderId = getField(row, "order_id") || getField(row, "orderId") || getField(row, "Order ID") || "";
    const productName = getField(row, "product_name") || getField(row, "productName") || getField(row, "Product Name") || getField(row, "product") || "";

    const updated = setField(row, "status", selection.status);
    rowsRef.current[idx] = updated;
    scannedRef.current.add(key);
    dispatch(updateRow({ path, index: idx, row: updated }));
    dispatch(markScanned({ path, awb: key }));

    beep(); vibrate(50);
    flash("success");

    const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: true, orderInfo: { orderId, productName, previousStatus } };
    setLastScan(r);
    setResults((p) => [r, ...p].slice(0, 200));
    toast.success(`Marked as ${selection.status}`, { description: productName || orderId || awb });

    if (!uploadingRef.current) {
      uploadingRef.current = true; setUploading(true);
      try {
        await new Promise((r) => setTimeout(r, 500));
        await writeMasterRows(path, rowsRef.current!);
      } catch (e) {
        toast.error("Upload failed", { description: (e as Error).message });
      } finally { uploadingRef.current = false; setUploading(false); }
    }
  }, [dispatch, flash, path, selection.status]);

  const { hasTorch, torchOn, toggleTorch } = useScanner(videoRef, handleDecode, !loadingMaster && !masterError);

  const ok   = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success && !r.warning).length;
  const warn = results.filter((r) => !!r.warning).length;
  const total = results.length;

  const statusColor = STATUS_COLOR[selection.status] ?? { bg: "bg-white/10", text: "text-white/70", glow: "#ffffff" };
  const scanning = !loadingMaster && !masterError;

  return (
    <div className="flex h-dvh flex-col bg-[#080a0f]" onPointerDown={unlockAudio}>
      {/* Safe-area top */}
      <div style={{ height: "env(safe-area-inset-top)" }} />

      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={onExit}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white active:scale-95 transition-all"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="truncate text-[10px] font-medium text-white/30 tracking-wide uppercase">
            {selection.company.name} · {selection.platform.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize tracking-wide ${statusColor.bg} ${statusColor.text}`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: statusColor.glow, boxShadow: `0 0 4px ${statusColor.glow}` }}
              />
              {selection.status}
            </span>
            {uploading && (
              <span className="flex items-center gap-1 text-[10px] text-sky-400">
                <CloudUpload className="h-3 w-3 animate-pulse" /> syncing
              </span>
            )}
          </div>
        </div>

        {/* Counts */}
        <div className="flex items-center gap-1">
          {ok > 0 && (
            <StatBadge value={ok} color="emerald" />
          )}
          {fail > 0 && (
            <StatBadge value={fail} color="rose" />
          )}
          {warn > 0 && (
            <StatBadge value={warn} color="amber" />
          )}
        </div>

        {hasTorch && (
          <button
            onClick={toggleTorch}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition-all active:scale-95 ${
              torchOn
                ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40"
                : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
            }`}
          >
            {torchOn
              ? <Flashlight className="h-4 w-4" />
              : <FlashlightOff className="h-4 w-4" />}
          </button>
        )}

        <button
          onClick={handleRefresh}
          disabled={refreshing || loadingMaster}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white active:scale-95 transition-all disabled:opacity-30"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* ── Camera viewport ── */}
      <div
        className="relative w-full shrink-0 overflow-hidden"
        style={{ height: "clamp(230px, 58vw, 340px)", background: "#000" }}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />

        {/* Flash overlay */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: flashType ? 1 : 0,
            backgroundColor: flashType === "success" ? "rgba(16,185,129,0.28)" : "rgba(239,68,68,0.28)",
          }}
        />

        {/* Dark vignette */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.72) 100%)" }} />

        {/* Scan frame */}
        <ScanFrame active={scanning} glowColor={statusColor.glow} flashType={flashType} />

        {/* Status overlay */}
        {(loadingMaster || masterError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-black/80 px-6 py-5 ring-1 ring-white/10">
              {loadingMaster ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-white/60" />
                  <p className="text-[13px] font-semibold text-white/70">Loading master file…</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-7 w-7 text-rose-400" />
                  <p className="text-[13px] font-semibold text-white/80">{masterError}</p>
                  <button
                    onClick={handleRefresh}
                    className="mt-1 rounded-xl bg-white/10 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-white/20 transition-colors"
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {scanning && (
          <p className="absolute inset-x-0 bottom-2 text-center text-[10px] font-medium tracking-widest text-white/30 uppercase">
            Align barcode in frame
          </p>
        )}
      </div>

      {/* ── Last scan result ── */}
      <LastScanBanner result={lastScan} status={selection.status} />

      {/* ── Scan log ── */}
      <div className="flex min-h-0 flex-1 flex-col bg-[#0d1117]">
        {/* Log header */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
          <span className="text-[10px] font-bold tracking-widest text-white/25 uppercase">Scan Log</span>
          <div className="flex items-center gap-3 text-[10px] text-white/30">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{ok} ok
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />{fail} err
            </span>
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />{total}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {results.length === 0 ? (
            <EmptyLog scanning={scanning} />
          ) : (
            results.map((r) => <LogRow key={r.id} r={r} />)
          )}
        </div>

        {/* Done bar */}
        <div className="border-t border-white/5 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
          <button
            onClick={onExit}
            className="w-full h-[52px] rounded-2xl bg-white/8 text-[15px] font-bold text-white/80 hover:bg-white/12 active:scale-[0.98] transition-all"
          >
            {ok > 0 ? `Done · ${ok} updated` : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ value, color }: { value: number; color: "emerald" | "rose" | "amber" }) {
  const cls = {
    emerald: "bg-emerald-500/15 text-emerald-400",
    rose:    "bg-rose-500/15 text-rose-400",
    amber:   "bg-amber-500/15 text-amber-400",
  }[color];
  return (
    <span className={`flex min-w-[28px] items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold tabular-nums ${cls}`}>
      {value}
    </span>
  );
}

function ScanFrame({ active, glowColor, flashType }: { active: boolean; glowColor: string; flashType: "success" | "error" | null }) {
  const frameColor = flashType === "success" ? "#10b981" : flashType === "error" ? "#ef4444" : glowColor;
  const W = "72%";
  const H = "80%";

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: W, height: H }}
    >
      {/* Cutout shadow */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{ boxShadow: `0 0 0 9999px rgba(0,0,0,0.58)` }}
      />

      {/* Corner brackets */}
      {(["tl","tr","bl","br"] as const).map((pos) => (
        <CornerBracket key={pos} pos={pos} color={frameColor} />
      ))}

      {/* Animated laser */}
      {active && (
        <div
          className="absolute inset-x-2 h-[2px] rounded-full animate-scan"
          style={{
            background: `linear-gradient(90deg, transparent, ${frameColor}, transparent)`,
            boxShadow: `0 0 8px 2px ${frameColor}55`,
          }}
        />
      )}

      {/* Center crosshair */}
      {active && (
        <>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-px h-px w-4 rounded-full" style={{ backgroundColor: `${frameColor}60` }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-px -translate-y-1/2 w-px h-4 rounded-full" style={{ backgroundColor: `${frameColor}60` }} />
        </>
      )}
    </div>
  );
}

function CornerBracket({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const base = "absolute h-7 w-7";
  const border = `3px solid ${color}`;
  const style: React.CSSProperties = {
    boxShadow: `0 0 8px 1px ${color}55`,
  };
  const cls = {
    tl: "top-0 left-0 rounded-tl-2xl border-t border-l",
    tr: "top-0 right-0 rounded-tr-2xl border-t border-r",
    bl: "bottom-0 left-0 rounded-bl-2xl border-b border-l",
    br: "bottom-0 right-0 rounded-br-2xl border-b border-r",
  }[pos];
  return (
    <div
      className={`${base} ${cls}`}
      style={{ borderColor: color, borderWidth: "2.5px", ...style }}
    />
  );
}

function LastScanBanner({ result, status }: { result: ScanResult | null; status: string }) {
  if (!result) {
    return (
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#0d1117] px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5">
          <Zap className="h-4 w-4 text-white/20" />
        </div>
        <p className="text-[12px] text-white/25 font-medium">Waiting for first scan…</p>
      </div>
    );
  }

  if (result.success) {
    return (
      <div className="flex items-center gap-3 border-b border-emerald-500/15 bg-emerald-500/5 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-emerald-300 tabular-nums">{result.awb}</p>
          <p className="text-[10px] text-emerald-400/60 mt-0.5">
            {result.orderInfo?.productName || result.orderInfo?.orderId
              ? (result.orderInfo.productName || `#${result.orderInfo.orderId}`)
              : `→ ${status}`}
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-emerald-400/40">
          {result.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    );
  }

  const isWarn = !!result.warning;
  return (
    <div className={`flex items-center gap-3 border-b px-4 py-3 ${isWarn ? "border-amber-500/15 bg-amber-500/5" : "border-rose-500/15 bg-rose-500/5"}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isWarn ? "bg-amber-500/15" : "bg-rose-500/15"}`}>
        {isWarn
          ? <AlertTriangle className="h-4 w-4 text-amber-400" />
          : <XCircle className="h-4 w-4 text-rose-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] font-bold tabular-nums ${isWarn ? "text-amber-300" : "text-rose-300"}`}>{result.awb}</p>
        <p className={`text-[10px] mt-0.5 ${isWarn ? "text-amber-400/60" : "text-rose-400/60"}`}>{result.error}</p>
      </div>
    </div>
  );
}

function EmptyLog({ scanning }: { scanning: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/4">
        <Zap className="h-6 w-6 text-white/15" />
      </div>
      <p className="text-[12px] font-semibold text-white/20">
        {scanning ? "Ready to scan" : "Scanner not ready"}
      </p>
      <p className="text-[11px] text-white/12">Results appear instantly</p>
    </div>
  );
}

function LogRow({ r }: { r: ScanResult }) {
  const time = r.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (r.success) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/12 bg-emerald-500/4 px-3 py-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold tabular-nums text-white/80">{r.awb}</p>
          {(r.orderInfo?.productName || r.orderInfo?.orderId) && (
            <p className="truncate text-[10px] text-white/30">
              {r.orderInfo.productName || `#${r.orderInfo.orderId}`}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[9px] tabular-nums text-white/20">{time}</span>
      </div>
    );
  }

  const isWarn = !!r.warning;
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${isWarn ? "border-amber-500/12 bg-amber-500/4" : "border-rose-500/12 bg-rose-500/4"}`}>
      {isWarn
        ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        : <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold tabular-nums text-white/60">{r.awb}</p>
        <p className="truncate text-[10px] text-white/25">{r.error}</p>
      </div>
      <span className="shrink-0 text-[9px] tabular-nums text-white/20">{time}</span>
    </div>
  );
}
