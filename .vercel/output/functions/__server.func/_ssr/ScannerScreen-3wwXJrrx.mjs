import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { u as useAppDispatch, m as masterPath, a as useAppSelector, r as readMasterRows, s as setMaster, i as invalidate, f as findRowByAwb, g as getField, b as setField, c as updateRow, d as markScanned, w as writeMasterRows } from "./index-DQAxBpZX.mjs";
import "../_libs/firebase__firestore.mjs";
import "../_libs/firebase.mjs";
import "../_libs/firebase__storage.mjs";
import { A as ArrowLeft, h as CloudUpload, F as Flashlight, i as FlashlightOff, R as RefreshCw, b as LoaderCircle, T as TriangleAlert, H as Hash, Z as Zap, c as CircleCheck, j as CircleX } from "../_libs/lucide-react.mjs";
import "../_libs/react-dom.mjs";
import "async_hooks";
import "stream";
import "util";
import "crypto";
import "../_libs/react-redux.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/radix-ui__react-select.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-collection.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-focus-guards.mjs";
import "../_libs/radix-ui__react-focus-scope.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-portal.mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/aria-hidden.mjs";
import "../_libs/react-remove-scroll.mjs";
import "tslib";
import "../_libs/react-remove-scroll-bar.mjs";
import "../_libs/react-style-singleton.mjs";
import "../_libs/get-nonce.mjs";
import "../_libs/use-sidecar.mjs";
import "../_libs/use-callback-ref.mjs";
import "../_libs/radix-ui__react-dialog.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/reduxjs__toolkit.mjs";
import "../_libs/redux.mjs";
import "../_libs/immer.mjs";
import "../_libs/redux-thunk.mjs";
import "../_libs/firebase__app.mjs";
import "../_libs/firebase__component.mjs";
import "../_libs/firebase__util.mjs";
import "../_libs/firebase__logger.mjs";
import "../_libs/idb.mjs";
import "../_libs/firebase__webchannel-wrapper.mjs";
import "../_libs/@grpc/grpc-js.mjs";
import "process";
import "tls";
import "fs";
import "os";
import "net";
import "events";
import "http2";
import "http";
import "url";
import "dns";
import "zlib";
import "../_libs/@grpc/proto-loader.mjs";
import "path";
import "../_libs/lodash.camelcase.mjs";
import "../_libs/protobufjs.mjs";
import "../_libs/protobufjs__aspromise.mjs";
import "../_libs/protobufjs__base64.mjs";
import "../_libs/protobufjs__eventemitter.mjs";
import "../_libs/protobufjs__float.mjs";
import "../_libs/@protobufjs/inquire.mjs";
import "../_libs/protobufjs__utf8.mjs";
import "../_libs/protobufjs__pool.mjs";
import "../_libs/long.mjs";
import "../_libs/protobufjs__codegen.mjs";
import "../_libs/protobufjs__fetch.mjs";
import "../_libs/protobufjs__path.mjs";
const NATIVE_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "qr_code",
  "data_matrix",
  "aztec",
  "pdf417"
];
async function hasNativeDetector() {
  if (typeof window === "undefined" || !window.BarcodeDetector) return false;
  try {
    new window.BarcodeDetector({ formats: ["code_128"] });
    return true;
  } catch {
    return false;
  }
}
function startNativeDetector(video, onResult) {
  const detector = new window.BarcodeDetector({ formats: NATIVE_FORMATS });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let running = true;
  function tick() {
    if (!running) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      detector.detect(canvas).then((codes) => {
        if (codes.length > 0 && running) onResult(codes[0].rawValue);
      }).catch(() => {
      }).finally(() => {
        if (running) requestAnimationFrame(tick);
      });
    } else {
      setTimeout(() => {
        if (running) requestAnimationFrame(tick);
      }, 50);
    }
  }
  requestAnimationFrame(tick);
  return { stop: () => {
    running = false;
  } };
}
async function startZxingScanner(video, onResult) {
  const [{ BrowserMultiFormatReader }, lib] = await Promise.all([
    import("../_libs/zxing__browser.mjs"),
    import("../_libs/zxing__library.mjs")
  ]);
  const hints = /* @__PURE__ */ new Map();
  hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [
    lib.BarcodeFormat.CODE_128,
    lib.BarcodeFormat.CODE_39,
    lib.BarcodeFormat.CODE_93,
    lib.BarcodeFormat.EAN_13,
    lib.BarcodeFormat.EAN_8,
    lib.BarcodeFormat.ITF,
    lib.BarcodeFormat.UPC_A,
    lib.BarcodeFormat.UPC_E,
    lib.BarcodeFormat.QR_CODE,
    lib.BarcodeFormat.DATA_MATRIX,
    lib.BarcodeFormat.PDF_417,
    lib.BarcodeFormat.AZTEC
  ]);
  hints.set(lib.DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 20,
    delayBetweenScanSuccess: 300
  });
  const controls = await reader.decodeFromConstraints(
    {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    },
    video,
    (result) => {
      if (result) onResult(result.getText().trim());
    }
  );
  return { stop: () => controls.stop() };
}
function useScanner(videoRef, onDecode, enabled) {
  const lastRef = reactExports.useRef({ text: "", at: 0 });
  const errorRef = reactExports.useRef(null);
  const trackRef = reactExports.useRef(null);
  const ownStreamRef = reactExports.useRef(null);
  const [hasTorch, setHasTorch] = reactExports.useState(false);
  const [torchOn, setTorchOn] = reactExports.useState(false);
  const dedupe = reactExports.useCallback(
    (text) => {
      if (!text) return;
      const now = Date.now();
      if (lastRef.current.text === text && now - lastRef.current.at < 500) return;
      lastRef.current = { text, at: now };
      onDecode(text);
    },
    [onDecode]
  );
  const toggleTorch = reactExports.useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
    }
  }, [torchOn]);
  reactExports.useEffect(() => {
    if (!enabled || !videoRef.current) return;
    let controls = null;
    let cancelled = false;
    (async () => {
      try {
        const useNative = await hasNativeDetector();
        if (cancelled) return;
        const video = videoRef.current;
        if (useNative) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 3840 },
              height: { ideal: 2160 }
            }
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          ownStreamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          if (track) {
            trackRef.current = track;
            try {
              const caps = track.getCapabilities();
              setHasTorch(!!caps.torch);
            } catch {
            }
          }
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => {
          });
          if (cancelled) return;
          controls = startNativeDetector(video, dedupe);
        } else {
          controls = await startZxingScanner(video, dedupe);
          if (cancelled) {
            controls.stop();
            return;
          }
          if (video.srcObject instanceof MediaStream) {
            const track = video.srcObject.getVideoTracks()[0];
            if (track) {
              trackRef.current = track;
              try {
                const caps = track.getCapabilities();
                setHasTorch(!!caps.torch);
              } catch {
              }
            }
          }
        }
        if (cancelled) controls?.stop();
      } catch (e) {
        if (!cancelled) {
          errorRef.current = e.message;
          console.error("Scanner init failed", e);
        }
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
      ownStreamRef.current?.getTracks().forEach((t) => t.stop());
      ownStreamRef.current = null;
      trackRef.current = null;
      setTorchOn(false);
      setHasTorch(false);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled, videoRef, dedupe]);
  return { errorRef, hasTorch, torchOn, toggleTorch };
}
let audioCtx = null;
let unlocked = false;
function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  return audioCtx;
}
function unlockAudio() {
  if (unlocked) return;
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
      });
    }
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch {
  }
}
function beep(freq = 1046, durationMs = 100) {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {
    });
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 5e-3);
    gain.gain.setValueAtTime(0.25, ctx.currentTime + durationMs / 1e3 - 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1e3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1e3 + 0.01);
  } catch {
  }
}
function vibrate(ms = 50) {
  try {
    navigator.vibrate?.(ms);
  } catch {
  }
}
function errorBeep() {
  beep(280, 180);
  setTimeout(() => beep(220, 180), 210);
}
const STATUS_COLOR = {
  pending: { bg: "bg-amber-500/20", text: "text-amber-300", glow: "#f59e0b" },
  processing: { bg: "bg-blue-500/20", text: "text-blue-300", glow: "#3b82f6" },
  shipped: { bg: "bg-cyan-500/20", text: "text-cyan-300", glow: "#06b6d4" },
  delivered: { bg: "bg-emerald-500/20", text: "text-emerald-300", glow: "#10b981" },
  cancelled: { bg: "bg-rose-500/20", text: "text-rose-300", glow: "#f43f5e" },
  returned: { bg: "bg-orange-500/20", text: "text-orange-300", glow: "#f97316" },
  lost: { bg: "bg-red-500/20", text: "text-red-300", glow: "#ef4444" },
  manifest: { bg: "bg-violet-500/20", text: "text-violet-300", glow: "#8b5cf6" }
};
function ScannerScreen({ selection, onExit }) {
  const videoRef = reactExports.useRef(null);
  const dispatch = useAppDispatch();
  const path = reactExports.useMemo(() => masterPath(selection.company.id, selection.platform.id), [selection]);
  const cacheEntry = useAppSelector((s) => s.master.cache[path]);
  const rowsRef = reactExports.useRef(cacheEntry?.rows ?? null);
  const scannedRef = reactExports.useRef(new Set(cacheEntry?.scannedAwbs ?? []));
  const uploadingRef = reactExports.useRef(false);
  const [loadingMaster, setLoadingMaster] = reactExports.useState(!cacheEntry);
  const [masterError, setMasterError] = reactExports.useState(null);
  const [results, setResults] = reactExports.useState([]);
  const [uploading, setUploading] = reactExports.useState(false);
  const [refreshing, setRefreshing] = reactExports.useState(false);
  const [lastScan, setLastScan] = reactExports.useState(null);
  const [flashType, setFlashType] = reactExports.useState(null);
  reactExports.useEffect(() => {
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
        const msg = e.message;
        setMasterError(msg.includes("object-not-found") ? "No master file found" : msg);
      } finally {
        if (!cancelled) setLoadingMaster(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);
  const handleRefresh = reactExports.useCallback(async () => {
    setRefreshing(true);
    setMasterError(null);
    try {
      dispatch(invalidate({ path }));
      const rows = await readMasterRows(path);
      rowsRef.current = rows;
      scannedRef.current = /* @__PURE__ */ new Set();
      dispatch(setMaster({ path, rows }));
      toast.success("Master file reloaded");
    } catch (e) {
      setMasterError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, path]);
  const flash = reactExports.useCallback((type) => {
    setFlashType(type);
    setTimeout(() => setFlashType(null), 400);
  }, []);
  const handleDecode = reactExports.useCallback(async (text) => {
    const awb = text.trim();
    if (!awb || !rowsRef.current) return;
    const key = awb.toLowerCase();
    if (scannedRef.current.has(key)) {
      vibrate(30);
      flash("error");
      const r2 = { id: `${Date.now()}-${awb}`, awb, timestamp: /* @__PURE__ */ new Date(), success: false, warning: true, error: "Already scanned this session" };
      setLastScan(r2);
      setResults((p) => [r2, ...p].slice(0, 200));
      toast.warning("Already scanned", { description: awb });
      return;
    }
    const idx = findRowByAwb(rowsRef.current, awb);
    if (idx === -1) {
      errorBeep();
      vibrate(30);
      flash("error");
      const r2 = { id: `${Date.now()}-${awb}`, awb, timestamp: /* @__PURE__ */ new Date(), success: false, error: "AWB not in master file" };
      setLastScan(r2);
      setResults((p) => [r2, ...p].slice(0, 200));
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
    beep();
    vibrate(50);
    flash("success");
    const r = { id: `${Date.now()}-${awb}`, awb, timestamp: /* @__PURE__ */ new Date(), success: true, orderInfo: { orderId, productName, previousStatus } };
    setLastScan(r);
    setResults((p) => [r, ...p].slice(0, 200));
    toast.success(`Marked as ${selection.status}`, { description: productName || orderId || awb });
    if (!uploadingRef.current) {
      uploadingRef.current = true;
      setUploading(true);
      try {
        await new Promise((r2) => setTimeout(r2, 500));
        await writeMasterRows(path, rowsRef.current);
      } catch (e) {
        toast.error("Upload failed", { description: e.message });
      } finally {
        uploadingRef.current = false;
        setUploading(false);
      }
    }
  }, [dispatch, flash, path, selection.status]);
  const { hasTorch, torchOn, toggleTorch } = useScanner(videoRef, handleDecode, !loadingMaster && !masterError);
  const ok = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success && !r.warning).length;
  const warn = results.filter((r) => !!r.warning).length;
  const total = results.length;
  const statusColor = STATUS_COLOR[selection.status] ?? { bg: "bg-white/10", text: "text-white/70", glow: "#ffffff" };
  const scanning = !loadingMaster && !masterError;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-dvh flex-col bg-[#080a0f]", onPointerDown: unlockAudio, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: "env(safe-area-inset-top)" } }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center gap-2 px-3 py-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onExit,
          className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white active:scale-95 transition-all",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "h-4.5 w-4.5" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "truncate text-[10px] font-medium text-white/30 tracking-wide uppercase", children: [
          selection.company.name,
          " · ",
          selection.platform.name
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 mt-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize tracking-wide ${statusColor.bg} ${statusColor.text}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: "h-1.5 w-1.5 rounded-full animate-pulse",
                    style: { backgroundColor: statusColor.glow, boxShadow: `0 0 4px ${statusColor.glow}` }
                  }
                ),
                selection.status
              ]
            }
          ),
          uploading && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-[10px] text-sky-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CloudUpload, { className: "h-3 w-3 animate-pulse" }),
            " syncing"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
        ok > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(StatBadge, { value: ok, color: "emerald" }),
        fail > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(StatBadge, { value: fail, color: "rose" }),
        warn > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(StatBadge, { value: warn, color: "amber" })
      ] }),
      hasTorch && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: toggleTorch,
          className: `flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition-all active:scale-95 ${torchOn ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40" : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"}`,
          children: torchOn ? /* @__PURE__ */ jsxRuntimeExports.jsx(Flashlight, { className: "h-4 w-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FlashlightOff, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: handleRefresh,
          disabled: refreshing || loadingMaster,
          className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white active:scale-95 transition-all disabled:opacity-30",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: `h-4 w-4 ${refreshing ? "animate-spin" : ""}` })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "relative w-full shrink-0 overflow-hidden",
        style: { height: "clamp(230px, 58vw, 340px)", background: "#000" },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("video", { ref: videoRef, className: "h-full w-full object-cover", playsInline: true, muted: true, autoPlay: true }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "pointer-events-none absolute inset-0 transition-opacity duration-300",
              style: {
                opacity: flashType ? 1 : 0,
                backgroundColor: flashType === "success" ? "rgba(16,185,129,0.28)" : "rgba(239,68,68,0.28)"
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pointer-events-none absolute inset-0", style: { background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.72) 100%)" } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ScanFrame, { active: scanning, glowColor: statusColor.glow, flashType }),
          (loadingMaster || masterError) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col items-center gap-3 rounded-3xl bg-black/80 px-6 py-5 ring-1 ring-white/10", children: loadingMaster ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-7 w-7 animate-spin text-white/60" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[13px] font-semibold text-white/70", children: "Loading master file…" })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-7 w-7 text-rose-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[13px] font-semibold text-white/80", children: masterError }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: handleRefresh,
                className: "mt-1 rounded-xl bg-white/10 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-white/20 transition-colors",
                children: "Retry"
              }
            )
          ] }) }) }),
          scanning && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "absolute inset-x-0 bottom-2 text-center text-[10px] font-medium tracking-widest text-white/30 uppercase", children: "Align barcode in frame" })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(LastScanBanner, { result: lastScan, status: selection.status }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-0 flex-1 flex-col bg-[#0d1117]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/5 px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold tracking-widest text-white/25 uppercase", children: "Scan Log" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-[10px] text-white/30", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-emerald-500" }),
            ok,
            " ok"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-rose-500" }),
            fail,
            " err"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { className: "h-3 w-3" }),
            total
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto px-3 py-2 space-y-1.5", children: results.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyLog, { scanning }) : results.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsx(LogRow, { r }, r.id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-white/5 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onExit,
          className: "w-full h-[52px] rounded-2xl bg-white/8 text-[15px] font-bold text-white/80 hover:bg-white/12 active:scale-[0.98] transition-all",
          children: ok > 0 ? `Done · ${ok} updated` : "Done"
        }
      ) })
    ] })
  ] });
}
function StatBadge({ value, color }) {
  const cls = {
    emerald: "bg-emerald-500/15 text-emerald-400",
    rose: "bg-rose-500/15 text-rose-400",
    amber: "bg-amber-500/15 text-amber-400"
  }[color];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `flex min-w-[28px] items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold tabular-nums ${cls}`, children: value });
}
function ScanFrame({ active, glowColor, flashType }) {
  const frameColor = flashType === "success" ? "#10b981" : flashType === "error" ? "#ef4444" : glowColor;
  const W = "72%";
  const H = "80%";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
      style: { width: W, height: H },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "absolute inset-0 rounded-2xl",
            style: { boxShadow: `0 0 0 9999px rgba(0,0,0,0.58)` }
          }
        ),
        ["tl", "tr", "bl", "br"].map((pos) => /* @__PURE__ */ jsxRuntimeExports.jsx(CornerBracket, { pos, color: frameColor }, pos)),
        active && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "absolute inset-x-2 h-[2px] rounded-full animate-scan",
            style: {
              background: `linear-gradient(90deg, transparent, ${frameColor}, transparent)`,
              boxShadow: `0 0 8px 2px ${frameColor}55`
            }
          }
        ),
        active && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-px h-px w-4 rounded-full", style: { backgroundColor: `${frameColor}60` } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute left-1/2 top-1/2 -translate-x-px -translate-y-1/2 w-px h-4 rounded-full", style: { backgroundColor: `${frameColor}60` } })
        ] })
      ]
    }
  );
}
function CornerBracket({ pos, color }) {
  const base = "absolute h-7 w-7";
  const style = {
    boxShadow: `0 0 8px 1px ${color}55`
  };
  const cls = {
    tl: "top-0 left-0 rounded-tl-2xl border-t border-l",
    tr: "top-0 right-0 rounded-tr-2xl border-t border-r",
    bl: "bottom-0 left-0 rounded-bl-2xl border-b border-l",
    br: "bottom-0 right-0 rounded-br-2xl border-b border-r"
  }[pos];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: `${base} ${cls}`,
      style: { borderColor: color, borderWidth: "2.5px", ...style }
    }
  );
}
function LastScanBanner({ result, status }) {
  if (!result) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 border-b border-white/5 bg-[#0d1117] px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "h-4 w-4 text-white/20" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-white/25 font-medium", children: "Waiting for first scan…" })
    ] });
  }
  if (result.success) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 border-b border-emerald-500/15 bg-emerald-500/5 px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-4 w-4 text-emerald-400" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-[13px] font-bold text-emerald-300 tabular-nums", children: result.awb }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-emerald-400/60 mt-0.5", children: result.orderInfo?.productName || result.orderInfo?.orderId ? result.orderInfo.productName || `#${result.orderInfo.orderId}` : `→ ${status}` })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-emerald-400/40", children: result.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })
    ] });
  }
  const isWarn = !!result.warning;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-3 border-b px-4 py-3 ${isWarn ? "border-amber-500/15 bg-amber-500/5" : "border-rose-500/15 bg-rose-500/5"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isWarn ? "bg-amber-500/15" : "bg-rose-500/15"}`, children: isWarn ? /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-4 w-4 text-amber-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "h-4 w-4 text-rose-400" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `truncate text-[13px] font-bold tabular-nums ${isWarn ? "text-amber-300" : "text-rose-300"}`, children: result.awb }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-[10px] mt-0.5 ${isWarn ? "text-amber-400/60" : "text-rose-400/60"}`, children: result.error })
    ] })
  ] });
}
function EmptyLog({ scanning }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-2 py-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-white/4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "h-6 w-6 text-white/15" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] font-semibold text-white/20", children: scanning ? "Ready to scan" : "Scanner not ready" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-white/12", children: "Results appear instantly" })
  ] });
}
function LogRow({ r }) {
  const time = r.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (r.success) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5 rounded-xl border border-emerald-500/12 bg-emerald-500/4 px-3 py-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-3.5 w-3.5 shrink-0 text-emerald-500" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-[12px] font-semibold tabular-nums text-white/80", children: r.awb }),
        (r.orderInfo?.productName || r.orderInfo?.orderId) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-[10px] text-white/30", children: r.orderInfo.productName || `#${r.orderInfo.orderId}` })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[9px] tabular-nums text-white/20", children: time })
    ] });
  }
  const isWarn = !!r.warning;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-2.5 rounded-xl border px-3 py-2 ${isWarn ? "border-amber-500/12 bg-amber-500/4" : "border-rose-500/12 bg-rose-500/4"}`, children: [
    isWarn ? /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3.5 w-3.5 shrink-0 text-amber-500" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "h-3.5 w-3.5 shrink-0 text-rose-500" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-[12px] font-semibold tabular-nums text-white/60", children: r.awb }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-[10px] text-white/25", children: r.error })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[9px] tabular-nums text-white/20", children: time })
  ] });
}
export {
  ScannerScreen
};
