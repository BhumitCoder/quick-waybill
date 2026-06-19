import { useEffect, useRef, useState } from "react";
import { getDocs } from "firebase/firestore";
import {
  ScanLine, Building2, Layers, Sun, Moon,
  CheckCircle2, AlertTriangle, Loader2, ChevronRight, Globe,
} from "lucide-react";
import { companiesCollection } from "@/lib/firebase";
import { readMasterRows, masterPath } from "@/lib/masterService";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InstallPrompt } from "./InstallPrompt";
import { useTheme } from "@/hooks/useTheme";
import {
  setCompany as setCompanyAction,
  setPlatform as setPlatformAction,
  setStatus as setStatusAction,
  setScanAll as setScanAllAction,
  setMaster,
  useAppDispatch,
  useAppSelector,
} from "@/store";

export type Platform = { id: string; name: string };
export type Company = { id: string; name: string; platforms: Platform[] };

export type SetupSelection = {
  company: Company | null;
  platform: Platform | null;
  status: string;
  scanAll: boolean;
  allCompanies: Company[];
};

const STATUSES = [
  { id: "pickup",    label: "Pickup",    dot: "bg-sky-400",     pill: "bg-sky-50     border-sky-200     text-sky-700     dark:bg-sky-500/10    dark:border-sky-500/30    dark:text-sky-400"    },
  { id: "returned",  label: "Returned",  dot: "bg-orange-400",  pill: "bg-orange-50  border-orange-200  text-orange-700  dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-400"  },
  { id: "cancelled", label: "Cancelled", dot: "bg-rose-400",    pill: "bg-rose-50    border-rose-200    text-rose-700    dark:bg-rose-500/10   dark:border-rose-500/30   dark:text-rose-400"   },
] as const;

type PrefetchStatus = "idle" | "loading" | "ready" | "error";

export function SetupScreen({ onStart }: { onStart: (s: SetupSelection) => void }) {
  const { isDark, toggle } = useTheme();
  const dispatch = useAppDispatch();
  const setup = useAppSelector((s) => s.setup);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [prefetch, setPrefetch] = useState<PrefetchStatus>("idle");
  const [starting, setStarting] = useState(false);
  const pendingRef = useRef<Promise<void> | null>(null);

  const { companyId, platformId, status, scanAll } = setup;

  useEffect(() => {
    getDocs(companiesCollection)
      .then((snap) => {
        setCompanies(snap.docs.map((d) => {
          const data = d.data() as { name?: string; platforms?: Platform[] };
          return { id: d.id, name: data.name ?? d.id, platforms: Array.isArray(data.platforms) ? data.platforms : [] };
        }));
      })
      .catch((e) => setFetchError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const company = companies.find((c) => c.id === companyId) ?? setup.companySnapshot ?? undefined;
  const platform = company?.platforms.find((p) => p.id === platformId) ?? setup.platformSnapshot ?? undefined;
  const canStart = !!status && (scanAll || (!!company && !!platform));

  const cachedEntry = useAppSelector((s) =>
    company && platform ? s.master.cache[masterPath(company.id, platform.id)] : undefined
  );

  useEffect(() => {
    if (!company || !platform) { setPrefetch("idle"); return; }
    if (cachedEntry) { setPrefetch("ready"); return; }
    setPrefetch("loading");
    let cancelled = false;
    const path = masterPath(company.id, platform.id);
    const p = (async () => {
      try {
        const rows = await readMasterRows(path);
        if (cancelled) return;
        dispatch(setMaster({ path, rows }));
        if (!cancelled) setPrefetch("ready");
      } catch {
        if (!cancelled) setPrefetch("error");
      }
    })();
    pendingRef.current = p;
    return () => { cancelled = true; };
  }, [company?.id, platform?.id, !!cachedEntry, dispatch]);

  const handleStart = async () => {
    if (!canStart || starting) return;
    if (!scanAll && prefetch === "loading" && pendingRef.current) {
      setStarting(true);
      try { await pendingRef.current; } finally { setStarting(false); }
    }
    onStart({
      company: scanAll ? null : company!,
      platform: scanAll ? null : platform!,
      status,
      scanAll,
      allCompanies: companies,
    });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Safe-area top spacer */}
      <div style={{ height: "env(safe-area-inset-top)" }} />

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-5 pt-3 pb-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-primary to-primary-glow shadow-glow">
          <ScanLine className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-bold leading-none tracking-tight">AWB Scanner</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Bulk status updates</p>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle} className="h-9 w-9 rounded-xl text-muted-foreground">
          {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>
        <InstallPrompt />
      </header>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">

        {/* Scan All toggle */}
        <div>
          <SectionLabel>Mode</SectionLabel>
          <button
            type="button"
            onClick={() => dispatch(setScanAllAction(!scanAll))}
            className={`w-full flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
              scanAll
                ? "border-primary bg-primary/10"
                : "border-border/70 bg-card"
            }`}
          >
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${scanAll ? "bg-primary/20" : "bg-muted"}`}>
              <Globe className={`h-4.5 w-4.5 ${scanAll ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[15px] font-semibold ${scanAll ? "text-primary" : "text-foreground"}`}>Scan All Platforms</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {scanAll ? "AWB will be searched across every company and platform" : "Search across all companies & platforms automatically"}
              </p>
            </div>
            <div className={`h-5 w-9 rounded-full transition-colors relative ${scanAll ? "bg-primary" : "bg-muted"}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${scanAll ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </button>
        </div>

        {/* Company + Platform card */}
        <div className={scanAll ? "opacity-40 pointer-events-none" : ""}>
          <SectionLabel>Destination {scanAll && <span className="normal-case font-normal text-muted-foreground/60">(not needed in scan-all mode)</span>}</SectionLabel>
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            {/* Company */}
            <Select value={companyId} onValueChange={(id) => {
              const c = companies.find((x) => x.id === id) ?? null;
              dispatch(setCompanyAction(c));
            }}>
              <SelectTrigger className="h-auto w-full cursor-pointer items-center gap-0 rounded-none border-0 bg-transparent px-4 py-0 focus:ring-0 focus:ring-offset-0 [&>span]:line-clamp-none [&>[aria-hidden]]:hidden">
                <div className="flex w-full items-center gap-3.5 py-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Company</p>
                    <p className={`mt-0.5 text-[15px] font-medium leading-tight truncate ${!company ? "text-muted-foreground/60" : "text-foreground"}`}>
                      {loading ? "Loading…" : <SelectValue placeholder="Select company" />}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="py-3 text-base">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mx-4 h-px bg-border/60" />

            {/* Platform */}
            <Select value={platformId} onValueChange={(id) => {
              const p = company?.platforms.find((x) => x.id === id) ?? null;
              dispatch(setPlatformAction(p));
            }} disabled={!company}>
              <SelectTrigger className="h-auto w-full cursor-pointer items-center gap-0 rounded-none border-0 bg-transparent px-4 py-0 focus:ring-0 focus:ring-offset-0 disabled:opacity-50 [&>span]:line-clamp-none [&>[aria-hidden]]:hidden">
                <div className="flex w-full items-center gap-3.5 py-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary/10">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Platform</p>
                    <p className={`mt-0.5 text-[15px] font-medium leading-tight truncate ${!platform ? "text-muted-foreground/60" : "text-foreground"}`}>
                      {company
                        ? <SelectValue placeholder="Select platform" />
                        : "Pick company first"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {(company?.platforms ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id} className="py-3 text-base">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Status grid */}
        <div>
          <SectionLabel>Status to Apply</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map(({ id, label, dot, pill }) => {
              const selected = status === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => dispatch(setStatusAction(id))}
                  className={`relative flex h-[52px] items-center gap-3 rounded-2xl border px-4 text-left text-[14px] font-semibold transition-all active:scale-[0.96] ${
                    selected
                      ? "border-primary bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow"
                      : pill
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${selected ? "bg-white/60" : dot}`} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {fetchError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {fetchError}
          </div>
        )}
      </div>

      {/* ── Bottom CTA ── */}
      <div className="border-t border-border/50 bg-background px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]">
        {/* Prefetch pill */}
        <div className="mb-2.5 flex h-5 items-center justify-center gap-1.5">
          {scanAll && canStart && (
            <><Globe className="h-3 w-3 text-primary" />
            <span className="text-[11px] font-medium text-primary">All platforms — files load on start</span></>
          )}
          {!scanAll && canStart && prefetch === "loading" && (
            <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Loading master file…</span></>
          )}
          {!scanAll && canStart && prefetch === "ready" && (
            <><CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Master file ready</span></>
          )}
          {!scanAll && canStart && prefetch === "error" && (
            <><AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="text-[11px] text-amber-600 dark:text-amber-400">File not found — will retry on start</span></>
          )}
        </div>

        <Button
          onClick={handleStart}
          disabled={!canStart || loading || starting}
          className="h-14 w-full rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-[15px] font-bold tracking-wide shadow-glow transition-all active:scale-[0.98] disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          {starting ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Preparing…</>
          ) : prefetch === "loading" && canStart ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin opacity-60" /><ScanLine className="mr-1.5 h-5 w-5" />Start Scanning</>
          ) : (
            <><ScanLine className="mr-2 h-5 w-5" />Start Scanning</>
          )}
        </Button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}
