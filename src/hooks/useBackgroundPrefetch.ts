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

const CONCURRENCY = 3;

let _started = false;
let _progress: PrefetchProgress = { loaded: 0, total: 0, done: true };
const _subscribers = new Set<(p: PrefetchProgress) => void>();

// Paths that returned 404 / permanent error — never retry these this session
const _failed = new Set<string>();

/** Returns true if this path was attempted and permanently failed (e.g. no file in Storage). */
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
    .filter((path) => !currentCache[path]);

  if (!paths.length) {
    broadcast({ loaded: 0, total: 0, done: true });
    return;
  }

  broadcast({ loaded: 0, total: paths.length, done: false });

  let completed = 0;
  let nextIdx = 0;
  let active = 0;

  const pump = () => {
    while (active < CONCURRENCY && nextIdx < paths.length) {
      const path = paths[nextIdx++];
      active++;
      readMasterRows(path)
        .then((rows) => dispatch(setMaster({ path, rows })))
        .catch(() => { _failed.add(path); /* missing file — skip silently */ })
        .finally(() => {
          active--;
          completed++;
          const done = completed === paths.length;
          broadcast({ loaded: completed, total: paths.length, done });
          if (!done) pump();
        });
    }
  };

  pump();
}

/**
 * Force-reload all files from Firebase Storage (bypasses IDB cache).
 * Call this when the user explicitly taps the refresh button in the header.
 */
export async function refreshAllFiles(
  companies: Company[],
  dispatch: ReturnType<typeof useAppDispatch>,
) {
  // Reset module state so runPrefetch re-runs
  _started = false;
  _failed.clear();
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
