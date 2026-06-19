import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  Loader2, RefreshCw, CloudUpload, Zap, Hash, Flashlight, FlashlightOff, Send, Lock,
  ThumbsUp, PackageX,
} from "lucide-react";
import { useScanner } from "@/hooks/useScanner";
import {
  findRowByAwb, getField, masterPath, readMasterRows,
  setField, writeMasterRows, type MasterRow,
} from "@/lib/masterService";
import { beep, errorBeep, vibrate, unlockAudio } from "@/lib/scanner";
import type { SetupSelection } from "./SetupScreen";
import { invalidate, markScanned, setMaster, store, updateRow, useAppDispatch, useAppSelector } from "@/store";

type ScanResult = {
  id: string; awb: string; timestamp: Date; success: boolean;
  warning?: boolean;
  orderInfo?: { orderId: string; productName: string; previousStatus: string };
  error?: string;
};


const STATUS_COLOR: Record<string, { bg: string; text: string; glow: string }> = {
  pickup:     { bg: "bg-sky-500/20",     text: "text-sky-300",     glow: "#0ea5e9" },
  returned:   { bg: "bg-orange-500/20",  text: "text-orange-300",  glow: "#f97316" },
  cancelled:  { bg: "bg-rose-500/20",    text: "text-rose-300",    glow: "#f43f5e" },
  // legacy colours kept so older scanned data renders correctly
  pending:    { bg: "bg-amber-500/20",   text: "text-amber-300",   glow: "#f59e0b" },
  processing: { bg: "bg-blue-500/20",    text: "text-blue-300",    glow: "#3b82f6" },
  shipped:    { bg: "bg-cyan-500/20",    text: "text-cyan-300",    glow: "#06b6d4" },
  delivered:  { bg: "bg-emerald-500/20", text: "text-emerald-300", glow: "#10b981" },
  lost:       { bg: "bg-red-500/20",     text: "text-red-300",     glow: "#ef4444" },
  manifest:   { bg: "bg-violet-500/20",  text: "text-violet-300",  glow: "#8b5cf6" },
  future:     { bg: "bg-indigo-500/20",  text: "text-indigo-300",  glow: "#6366f1" },
};

export function ScannerScreen({ selection, onExit }: { selection: SetupSelection; onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dispatch = useAppDispatch();

  // Single-platform mode path (empty string when scanAll)
  const path = useMemo(() =>
    selection.scanAll ? '' : masterPath(selection.company!.id, selection.platform!.id),
  [selection]);
  const cacheEntry = useAppSelector((s) => path ? s.master.cache[path] : undefined);
  const rowsRef = useRef<MasterRow[] | null>(!selection.scanAll && cacheEntry?.rows ? [...cacheEntry.rows] : null);
  const scannedRef = useRef<Set<string>>(new Set(!selection.scanAll ? (cacheEntry?.scannedAwbs ?? []) : []));

  // Prevent the same barcode firing repeatedly while it stays in camera view
  const SCAN_COOLDOWN_MS = 2500;
  const lastDecodedRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  // Debounced upload — accumulate dirty paths, flush once after DEBOUNCE_MS of silence
  const DEBOUNCE_MS = 3000;
  const dirtyPathsRef = useRef<Set<string>>(new Set());
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scan-all mode: map of path → { company, platform, rows }
  type MasterEntry = { company: NonNullable<typeof selection.company>; platform: NonNullable<typeof selection.platform>; rows: MasterRow[] };
  const allMastersRef = useRef<Map<string, MasterEntry>>(new Map());
  const [scanAllStatus, setScanAllStatus] = useState<{ total: number; loaded: number } | null>(
    selection.scanAll ? { total: 0, loaded: 0 } : null
  );
  const [collision, setCollision] = useState<{
    awb: string;
    candidates: Array<{ path: string; entry: MasterEntry; index: number }>;
  } | null>(null);

  const [loadingMaster, setLoadingMaster] = useState(selection.scanAll ? true : !cacheEntry);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [flashType, setFlashType] = useState<"success" | "error" | null>(null);
  const [pickupConflict, setPickupConflict] = useState<{ awb: string; company: string; platform: string } | null>(null);
  type ReturnConditionPending = { awb: string; targetPath: string; entry: MasterEntry; idx: number; updatedRow: MasterRow };
  const [returnConditionPending, setReturnConditionPending] = useState<ReturnConditionPending | null>(null);

  // Single-platform load
  useEffect(() => {
    if (selection.scanAll) return;
    if (cacheEntry) {
      rowsRef.current = [...cacheEntry.rows];
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
  }, [path, selection.scanAll]);

  // Scan-all: load every company × platform master file in parallel
  useEffect(() => {
    if (!selection.scanAll) return;
    const entries = (selection.allCompanies ?? []).flatMap(c =>
      c.platforms.map(p => ({ company: c, platform: p, path: masterPath(c.id, p.id) }))
    );
    setScanAllStatus({ total: entries.length, loaded: 0 });
    setLoadingMaster(true);
    allMastersRef.current.clear();
    let cancelled = false;
    let done = 0;
    Promise.all(entries.map(async ({ company, platform, path: p }) => {
      const cached = store.getState().master.cache[p];
      if (cached) {
        allMastersRef.current.set(p, { company, platform, rows: [...cached.rows] });
      } else {
        try {
          const rows = await readMasterRows(p);
          if (!cancelled) {
            allMastersRef.current.set(p, { company, platform, rows });
            dispatch(setMaster({ path: p, rows }));
          }
        } catch { /* skip files that don't exist yet */ }
      }
      done++;
      if (!cancelled) setScanAllStatus(prev => prev ? { ...prev, loaded: done } : null);
    })).finally(() => { if (!cancelled) setLoadingMaster(false); });
    return () => { cancelled = true; };
  }, [selection.scanAll, (selection.allCompanies ?? []).length, dispatch]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true); setMasterError(null);
    if (selection.scanAll) {
      allMastersRef.current.clear();
      const entries = (selection.allCompanies ?? []).flatMap(c =>
        c.platforms.map(p => ({ company: c, platform: p, path: masterPath(c.id, p.id) }))
      );
      setScanAllStatus({ total: entries.length, loaded: 0 });
      setLoadingMaster(true);
      let done = 0;
      await Promise.all(entries.map(async ({ company, platform, path: p }) => {
        dispatch(invalidate({ path: p }));
        try {
          const rows = await readMasterRows(p);
          allMastersRef.current.set(p, { company, platform, rows });
          dispatch(setMaster({ path: p, rows }));
        } catch { /* skip */ }
        done++;
        setScanAllStatus(prev => prev ? { ...prev, loaded: done } : null);
      }));
      setLoadingMaster(false);
      scannedRef.current = new Set();
      toast.success("All master files reloaded");
      setRefreshing(false);
      return;
    }
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
  }, [dispatch, path, selection.scanAll, selection.allCompanies]);

  const flash = useCallback((type: "success" | "error") => {
    setFlashType(type);
    setTimeout(() => setFlashType(null), 400);
  }, []);

  // Flush all dirty paths to Storage in one pass
  const doUpload = useCallback(async () => {
    if (uploadTimerRef.current) { clearTimeout(uploadTimerRef.current); uploadTimerRef.current = null; }
    const paths = [...dirtyPathsRef.current];
    dirtyPathsRef.current.clear();
    if (!paths.length) return;
    setPendingUpload(false);
    setUploading(true);
    try {
      await Promise.all(paths.map(async (p) => {
        const rows = selection.scanAll
          ? allMastersRef.current.get(p)?.rows
          : rowsRef.current;
        if (rows) await writeMasterRows(p, rows);
      }));
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }, [selection.scanAll]);

  // Mark a path dirty and reset the debounce timer
  const scheduleUpload = useCallback((targetPath: string) => {
    dirtyPathsRef.current.add(targetPath);
    setPendingUpload(true);
    if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    uploadTimerRef.current = setTimeout(doUpload, DEBOUNCE_MS);
  }, [doUpload]);

  // Shared update logic — works for both single-platform and scan-all
  const applyUpdate = useCallback(async (
    awb: string,
    targetPath: string,
    entry: MasterEntry,
    idx: number,
  ) => {
    const key = awb.toLowerCase();
    const row = entry.rows[idx];
    const previousStatus = getField(row, "status") || "—";

    // Pickup lock: once an order is picked up, only "return" is allowed
    if (previousStatus.toLowerCase() === "pickup" && selection.status.toLowerCase() !== "return") {
      errorBeep(); vibrate(30); flash("error");
      setPickupConflict({ awb, company: entry.company.name, platform: entry.platform.name });
      const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, error: "Pickup order — only Return allowed" };
      setLastScan(r); setResults((p) => [r, ...p].slice(0, 200));
      return;
    }
    const orderId = getField(row, "order_id") || getField(row, "orderId") || getField(row, "Order ID") || "";
    const productName = getField(row, "product_name") || getField(row, "productName") || getField(row, "Product Name") || getField(row, "product") || "";

    const updated = setField(row, "status", selection.status);
    const newRows = entry.rows.slice();
    newRows[idx] = updated;
    entry.rows = newRows;

    scannedRef.current.add(key);
    dispatch(updateRow({ path: targetPath, index: idx, row: updated }));
    dispatch(markScanned({ path: targetPath, awb: key }));

    beep(); vibrate(50); flash("success");

    const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: true, orderInfo: { orderId, productName, previousStatus } };
    setLastScan(r);
    setResults((p) => [r, ...p].slice(0, 200));

    const suffix = selection.scanAll ? ` · ${entry.company.name} › ${entry.platform.name}` : "";
    toast.success(`Marked as ${selection.status}`, { description: (productName || orderId || awb) + suffix });

    if (selection.status.toLowerCase() === 'returned') {
      setReturnConditionPending({ awb, targetPath, entry, idx, updatedRow: updated });
    } else {
      scheduleUpload(targetPath);
    }
  }, [dispatch, flash, scheduleUpload, selection.scanAll, selection.status]);

  const applyReturnCondition = useCallback((condition: 'good' | 'damaged' | null) => {
    if (!returnConditionPending) return;
    const { targetPath, entry, idx, updatedRow } = returnConditionPending;
    setReturnConditionPending(null);
    if (condition) {
      const withCondition = setField(updatedRow, 'return_condition', condition);
      const newRows = entry.rows.slice();
      newRows[idx] = withCondition;
      entry.rows = newRows;
      dispatch(updateRow({ path: targetPath, index: idx, row: withCondition }));
    }
    scheduleUpload(targetPath);
  }, [returnConditionPending, dispatch, scheduleUpload]);

  const handleDecode = useCallback(async (text: string) => {
    const awb = text.trim();
    if (!awb) return;

    // Ignore QR codes that contain URLs — AWB numbers are never URLs
    if (/^https?:\/\//i.test(awb)) return;

    const key = awb.toLowerCase();

    // Silently drop repeated reads of the same barcode while it stays in frame
    const now = Date.now();
    if (lastDecodedRef.current.text === key && now - lastDecodedRef.current.at < SCAN_COOLDOWN_MS) return;
    lastDecodedRef.current = { text: key, at: now };

    if (scannedRef.current.has(key)) {
      vibrate(30); flash("error");
      const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, warning: true, error: "Already scanned this session" };
      setLastScan(r); setResults((p) => [r, ...p].slice(0, 200));
      toast.warning("Already scanned", { description: awb });
      return;
    }

    // ── Scan-all: search across every loaded master file ──
    if (selection.scanAll) {
      const matches: Array<{ path: string; entry: MasterEntry; index: number }> = [];
      allMastersRef.current.forEach((entry, p) => {
        const idx = findRowByAwb(entry.rows, awb);
        if (idx !== -1) matches.push({ path: p, entry, index: idx });
      });

      if (matches.length === 0) {
        errorBeep(); vibrate(30); flash("error");
        const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, error: `Not found in any platform` };
        setLastScan(r); setResults((p) => [r, ...p].slice(0, 200));
        toast.error("AWB not found", { description: `Searched ${allMastersRef.current.size} platforms` });
        return;
      }

      if (matches.length === 1) {
        await applyUpdate(awb, matches[0].path, matches[0].entry, matches[0].index);
        return;
      }

      // Collision — multiple platforms have this AWB
      vibrate(80);
      setCollision({ awb, candidates: matches });
      return;
    }

    // ── Single-platform ──
    if (!rowsRef.current) return;
    const idx = findRowByAwb(rowsRef.current, awb);
    if (idx === -1) {
      errorBeep(); vibrate(30); flash("error");
      const r: ScanResult = { id: `${Date.now()}-${awb}`, awb, timestamp: new Date(), success: false, error: `Not found in master file` };
      setLastScan(r); setResults((p) => [r, ...p].slice(0, 200));
      toast.error("AWB not found", { description: `Scanned: ${awb}` });
      return;
    }
    // Wrap single-platform rows in a MasterEntry shape so applyUpdate can handle it uniformly
    const singleEntry: MasterEntry = {
      company: selection.company!,
      platform: selection.platform!,
      rows: rowsRef.current,
    };
    await applyUpdate(awb, path, singleEntry, idx);
    rowsRef.current = singleEntry.rows; // applyUpdate mutates entry.rows
  }, [applyUpdate, dispatch, flash, path, selection]);

  const [manualAwb, setManualAwb] = useState("");

  const handleManualSubmit = useCallback(() => {
    const val = manualAwb.trim();
    if (!val) return;
    setManualAwb("");
    handleDecode(val);
  }, [manualAwb, handleDecode]);

  const { cameraError, hasTorch, torchOn, toggleTorch } = useScanner(videoRef, handleDecode, true);

  const masterRowCount = selection.scanAll
    ? (scanAllStatus ? `${scanAllStatus.loaded}/${scanAllStatus.total} files` : null)
    : (rowsRef.current?.length ?? null);

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
            {selection.scanAll
              ? "All Platforms"
              : `${selection.company?.name} · ${selection.platform?.name}`}
            {masterRowCount !== null && (
              <span className="ml-1.5 text-white/20">· {masterRowCount}{typeof masterRowCount === "number" ? " rows" : ""}</span>
            )}
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
            {(uploading || pendingUpload) && (
              <span className="flex items-center gap-1 text-[10px] text-sky-400">
                <CloudUpload className="h-3 w-3 animate-pulse" />
                {uploading ? 'syncing' : 'pending'}
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
        {(loadingMaster || masterError || cameraError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-black/80 px-6 py-5 ring-1 ring-white/10">
              {loadingMaster ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-white/60" />
                  <p className="text-[13px] font-semibold text-white/70">
                    {selection.scanAll && scanAllStatus
                      ? `Loading files… ${scanAllStatus.loaded}/${scanAllStatus.total}`
                      : "Loading master file…"}
                  </p>
                </>
              ) : cameraError ? (
                <>
                  <AlertTriangle className="h-7 w-7 text-rose-400" />
                  <p className="text-[13px] font-semibold text-white/80">Camera Error</p>
                  <p className="text-[11px] text-white/50 text-center max-w-[200px]">{cameraError}</p>
                  <p className="text-[10px] text-white/35 text-center">Allow camera permission and reload the page</p>
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

        {/* Manual AWB input + Done bar */}
        <div className="border-t border-white/5 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] space-y-2">
          {/* Manual entry row */}
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter AWB number manually…"
              value={manualAwb}
              onChange={(e) => setManualAwb(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              disabled={!scanning}
              className="flex-1 h-11 rounded-xl bg-white/6 border border-white/10 px-3 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 focus:bg-white/8 disabled:opacity-30 transition-all"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!scanning || !manualAwb.trim()}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl bg-white/8 text-white/50 hover:bg-white/14 hover:text-white active:scale-95 disabled:opacity-25 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={async () => {
              if (!pendingUpload && !uploading) { onExit(); return; }
              setExiting(true);
              if (uploadTimerRef.current) { clearTimeout(uploadTimerRef.current); uploadTimerRef.current = null; }
              await doUpload();
              onExit();
            }}
            className="w-full h-[48px] rounded-2xl bg-white/8 text-[15px] font-bold text-white/80 hover:bg-white/12 active:scale-[0.98] transition-all"
          >
            {exiting ? 'Saving…' : ok > 0 ? `Done · ${ok} updated` : "Done"}
          </button>
        </div>
      </div>

      {/* ── Pickup conflict notification ── */}
      {pickupConflict && (
        <div className="absolute inset-x-0 bottom-0 z-40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] bg-[#0d1117] border-t border-rose-500/30">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-rose-500/15">
              <Lock className="h-4 w-4 text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-rose-300">Status Locked — Pickup Order</p>
              <p className="text-[11px] text-white/40 mt-0.5 leading-snug">
                AWB {pickupConflict.awb} ({pickupConflict.company} · {pickupConflict.platform}) is already Pickup.
                Set scanner status to <span className="text-white/60 font-semibold">Return</span> to update.
              </p>
            </div>
            <button
              onClick={() => setPickupConflict(null)}
              className="shrink-0 text-[11px] font-semibold text-white/30 hover:text-white/60 px-2 py-1 rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Return condition sheet ── */}
      {returnConditionPending && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm">
          <div className="w-full rounded-t-3xl border-t border-white/10 bg-[#0d1117] px-5 pt-5 pb-[max(env(safe-area-inset-bottom),24px)]">
            <div className="mb-1 text-center">
              <span className="inline-block rounded-full bg-orange-500/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-orange-400">Return Scanned</span>
            </div>
            <p className="mb-1 text-center font-mono text-[18px] font-bold text-white">{returnConditionPending.awb}</p>
            <p className="mb-5 text-center text-[12px] text-white/40">What condition did the product come back in?</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                onClick={() => applyReturnCondition('good')}
                className="flex flex-col items-center justify-center gap-2 h-24 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 active:scale-95 transition-all"
              >
                <ThumbsUp className="h-7 w-7" />
                <span className="text-[15px] font-bold">Good</span>
              </button>
              <button
                onClick={() => applyReturnCondition('damaged')}
                className="flex flex-col items-center justify-center gap-2 h-24 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-400 active:scale-95 transition-all"
              >
                <PackageX className="h-7 w-7" />
                <span className="text-[15px] font-bold">Damaged</span>
              </button>
            </div>

            <button
              onClick={() => applyReturnCondition(null)}
              className="w-full py-3 text-[13px] font-medium text-white/30 hover:text-white/50 transition-colors"
            >
              Skip — don't record condition
            </button>
          </div>
        </div>
      )}

      {/* ── Collision resolver ── */}
      {collision && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm">
          <div className="w-full rounded-t-3xl border-t border-white/10 bg-[#0d1117] px-5 pt-5 pb-[max(env(safe-area-inset-bottom),24px)]">
            <div className="mb-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Multiple Matches</p>
              <p className="mt-1 font-mono text-[18px] font-bold text-white">{collision.awb}</p>
              <p className="mt-0.5 text-[12px] text-white/40">
                Found in {collision.candidates.length} platforms — tap to update one
              </p>
            </div>

            <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
              {collision.candidates.map((c, i) => {
                const row = c.entry.rows[c.index];
                const prod = getField(row, "productName") || getField(row, "product_name") || getField(row, "Product Name") || "";
                const orderId = getField(row, "orderId") || getField(row, "order_id") || getField(row, "Order ID") || "";
                const curStatus = getField(row, "status") || "—";
                return (
                  <button
                    key={i}
                    onClick={async () => {
                      setCollision(null);
                      await applyUpdate(collision.awb, c.path, c.entry, c.index);
                    }}
                    className="w-full flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-left transition-all hover:bg-white/10 active:scale-[0.98]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-white">
                        {c.entry.company.name} <span className="text-white/40">›</span> {c.entry.platform.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/40">{prod || orderId || "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white/8 px-2 py-1 text-[10px] font-medium capitalize text-white/50">
                      {curStatus}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCollision(null)}
              className="w-full h-11 rounded-2xl bg-white/5 text-[14px] font-semibold text-white/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
