import { useEffect, useState } from "react";
import { readMasterRows, masterPath } from "@/lib/masterService";
import { idbDelete } from "@/lib/idbCache";
import { setMaster, invalidate, useAppDispatch } from "@/store";
import { store } from "@/store";
import type { Company } from "@/components/SetupScreen";

export type PrefetchProgress = {
  loaded: number;
  total: number;
  done: boolean;
};

// ── Module-level singleton ───────────────────────────────────────────────────
// Lives outside React so it survives component unmount/remount (navigation).
// The prefetch runs exactly ONCE per actual page load.

let _started = false;
let _progress: PrefetchProgress = { loaded: 0, total: 0, done: true };
const _subscribers = new Set<(p: PrefetchProgress) => void>();

// ── Persistent failed-path tracking ─────────────────────────────────────────
// Paths that 404'd are saved to localStorage so they are never retried on the
// next page load — avoids two wasted Firebase round-trips per bad path.

const FAILED_LS_KEY = "awb-scanner-failed-paths";

function loadFailedFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(FAILED_LS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveFailedToStorage() {
  try { localStorage.setItem(FAILED_LS_KEY, JSON.stringify([..._failed])); } catch {}
}

const _failed: Set<string> = loadFailedFromStorage();

/** Returns true if this path has ever permanently failed (404 / no file in Storage). */
export function isFailedPath(path: string): boolean {
  return _failed.has(path);
}

function broadcast(p: PrefetchProgress) {
  _progress = p;
  for (const fn of _subscribers) fn(p);
}

async function runPrefetch(companies: Company[], dispatch: ReturnType<typeof useAppDispatch>) {
  const currentCache = store.getState().master.cache;
  const paths = companies
    .flatMap((c) => c.platforms.map((p) => masterPath(c.id, p.id)))
    // Skip paths already in Redux cache OR known-failed (no file in Storage)
    .filter((path) => !currentCache[path] && !_failed.has(path));

  if (!paths.length) {
    broadcast({ loaded: 0, total: 0, done: true });
    return;
  }

  broadcast({ loaded: 0, total: paths.length, done: false });

  // Run ALL paths fully in parallel — no artificial concurrency limit.
  // IDB reads are local (no network bottleneck). Firebase downloads are
  // naturally throttled by the browser's per-host connection limit (~6).
  let completed = 0;
  await Promise.all(
    paths.map(async (path) => {
      try {
        const rows = await readMasterRows(path);
        dispatch(setMaster({ path, rows }));
      } catch {
        _failed.add(path);
        saveFailedToStorage();
      }
      completed++;
      broadcast({ loaded: completed, total: paths.length, done: completed === paths.length });
    }),
  );
}

/**
 * Force-reload all files from Firebase Storage (bypasses IDB cache).
 * Call this when the user explicitly taps the refresh button in the header.
 */
export async function refreshAllFiles(
  companies: Company[],
  dispatch: ReturnType<typeof useAppDispatch>,
) {
  // Clear persisted failures so every file gets a fresh attempt
  _failed.clear();
  saveFailedToStorage();

  // Reset module state so runPrefetch re-runs
  _started = false;
  broadcast({ loaded: 0, total: companies.flatMap(c => c.platforms).length, done: false });

  // Clear Redux + IDB caches for every path
  const paths = companies.flatMap((c) =>
    c.platforms.map((p) => masterPath(c.id, p.id))
  );
  for (const path of paths) {
    dispatch(invalidate({ path }));
    idbDelete(path).catch(() => {});
  }

  _started = true;
  await runPrefetch(companies, dispatch);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribes to the module-level prefetch singleton.
 * The prefetch starts once per page load (not per component mount),
 * so navigating away and back never re-triggers the fetch.
 */
export function useBackgroundPrefetch(companies: Company[]): PrefetchProgress {
  const dispatch = useAppDispatch();
  const [progress, setProgress] = useState<PrefetchProgress>(_progress);

  // Subscribe to future broadcasts so this component re-renders on updates
  useEffect(() => {
    _subscribers.add(setProgress);
    setProgress(_progress); // sync in case progress changed while unmounted
    return () => { _subscribers.delete(setProgress); };
  }, []);

  // Start the prefetch only on the very first call with a non-empty companies list
  useEffect(() => {
    if (!companies.length || _started) return;
    _started = true;
    runPrefetch(companies, dispatch);
  }, [companies.length > 0, dispatch]);

  return progress;
}
