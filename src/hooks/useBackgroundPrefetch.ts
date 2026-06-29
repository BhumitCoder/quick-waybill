import { useEffect, useRef, useState } from "react";
import { readMasterRows, masterPath } from "@/lib/masterService";
import { setMaster, useAppDispatch, useAppSelector } from "@/store";
import type { Company } from "@/components/SetupScreen";

const CONCURRENCY = 3;

export type PrefetchProgress = {
  loaded: number;
  total: number;
  done: boolean;
};

/**
 * Silently pre-loads every company/platform master file in the background.
 * Uses a concurrency limit of CONCURRENCY so we never hammer Firebase Storage.
 * Files already in the Redux cache are skipped entirely.
 * Returns live progress so the UI can show a subtle indicator.
 */
export function useBackgroundPrefetch(companies: Company[]): PrefetchProgress {
  const dispatch = useAppDispatch();
  const cache = useAppSelector((s) => s.master.cache);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const [progress, setProgress] = useState<PrefetchProgress>({ loaded: 0, total: 0, done: true });
  const startedRef = useRef(false);

  useEffect(() => {
    if (!companies.length) return;
    if (startedRef.current) return;
    startedRef.current = true;

    const paths = companies
      .flatMap((c) => c.platforms.map((p) => masterPath(c.id, p.id)))
      .filter((path) => !cacheRef.current[path]);

    if (!paths.length) {
      setProgress({ loaded: 0, total: 0, done: true });
      return;
    }

    setProgress({ loaded: 0, total: paths.length, done: false });

    let completed = 0;
    let nextIdx = 0;
    let active = 0;

    const pump = () => {
      while (active < CONCURRENCY && nextIdx < paths.length) {
        const path = paths[nextIdx++];
        active++;
        readMasterRows(path)
          .then((rows) => dispatch(setMaster({ path, rows })))
          .catch(() => { /* missing file — skip silently */ })
          .finally(() => {
            active--;
            completed++;
            const done = completed === paths.length;
            setProgress({ loaded: completed, total: paths.length, done });
            if (!done) pump();
          });
      }
    };

    pump();
    // no cleanup needed — we want these fetches to finish even if component re-renders
  }, [companies.length > 0, dispatch]);

  return progress;
}
