import { useEffect, useState } from "react";
import { readMasterRows, masterPath, fetchSyncVersions } from "@/lib/masterService";
import { idbGet, idbDelete } from "@/lib/idbCache";
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

function syncKey(path: string): string | null {
  // companies/{cid}/platforms/{pid}/master.xlsx
  const parts = path.split("/");
  return parts[1] && parts[3] ? `${parts[1]}_${parts[3]}` : null;
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

  // One Firestore read covers every platform's version — each readMasterRows()
  // call below then skips its own per-file version lookup and, when the
  // version matches what's already in IDB, needs no network at all.
  const versions = await fetchSyncVersions();

  // Run ALL paths fully in parallel — no artificial concurrency limit.
  // IDB reads are local (no network bottleneck). Firebase downloads are
  // naturally throttled by the browser's per-host connection limit (~6).
  let completed = 0;
  await Promise.all(
    paths.map(async (path) => {
      try {
        const key = syncKey(path);
        const version = key ? versions.get(key) ?? 0 : 0;
        const rows = await readMasterRows(path, { version });
        dispatch(setMaster({ path, rows }));
      } catch (e) {
        // Only a CONFIRMED missing file (404) is worth remembering forever —
        // a network blip or a large file's worker parse struggling under
        // mobile memory pressure throws too, but blacklisting on those
        // permanently excludes a real, existing platform from every future
        // scan on this device until someone notices and manually clears it.
        if ((e as { code?: string })?.code === "storage/object-not-found") {
          _failed.add(path);
          saveFailedToStorage();
        }
      }
      completed++;
      broadcast({ loaded: completed, total: paths.length, done: completed === paths.length });
    }),
  );
}

/**
 * Check every platform's masterSync version against the local cache and
 * only re-download the ones that actually changed — tapping "refresh" with
 * nothing new on the server should cost zero network requests, not a full
 * blind re-download of every file. Also retries any path that previously
 * 404'd, in case it exists now.
 * Call this when the user explicitly taps the refresh button in the header.
 */
export async function refreshAllFiles(
  companies: Company[],
  dispatch: ReturnType<typeof useAppDispatch>,
) {
  // Give previously-404'd paths a fresh chance
  _failed.clear();
  saveFailedToStorage();

  _started = false;
  const paths = companies.flatMap((c) => c.platforms.map((p) => masterPath(c.id, p.id)));
  broadcast({ loaded: 0, total: paths.length, done: false });

  const versions = await fetchSyncVersions();
  let completed = 0;
  await Promise.all(
    paths.map(async (path) => {
      try {
        const key = syncKey(path);
        const version = key ? versions.get(key) ?? 0 : 0;
        const cached = await idbGet(path);
        const isCurrent = cached && (version === 0 || cached.version === version);

        if (isCurrent) {
          // Already fresh — no download needed. Just make sure Redux has it
          // (covers the case where Redux was cleared but IDB wasn't, e.g. a
          // full page reload right before the user tapped refresh).
          if (!store.getState().master.cache[path]) {
            dispatch(setMaster({ path, rows: cached!.rows }));
          }
        } else {
          // Version changed (or unknown) — this file needs a real re-download
          dispatch(invalidate({ path }));
          const rows = await readMasterRows(path, { version });
          dispatch(setMaster({ path, rows }));
        }
      } catch (e) {
        // See runPrefetch's identical check above — only a confirmed 404 is
        // worth remembering forever.
        if ((e as { code?: string })?.code === "storage/object-not-found") {
          _failed.add(path);
          saveFailedToStorage();
        }
      }
      completed++;
      broadcast({ loaded: completed, total: paths.length, done: completed === paths.length });
    }),
  );

  _started = true;
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
