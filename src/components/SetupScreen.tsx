import { useEffect, useRef, useState } from "react";
import { getDocs } from "firebase/firestore";
import { ScanLine, Building2, Layers, Tag, Loader2, Sun, Moon, CheckCircle2, AlertTriangle } from "lucide-react";
import { companiesCollection } from "@/lib/firebase";
import { readMasterRows, masterPath } from "@/lib/masterService";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstallPrompt } from "./InstallPrompt";
import { useTheme } from "@/hooks/useTheme";
import {
  setCompany as setCompanyAction,
  setPlatform as setPlatformAction,
  setStatus as setStatusAction,
  setMaster,
  useAppDispatch,
  useAppSelector,
} from "@/store";

export type Platform = { id: string; name: string };
export type Company = { id: string; name: string; platforms: Platform[] };

const STATUS_OPTIONS = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "lost",
  "manifest",
] as const;

const STATUS_META: Record<string, { color: string; dot: string }> = {
  pending:    { color: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",   dot: "bg-amber-500" },
  processing: { color: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",       dot: "bg-blue-500" },
  shipped:    { color: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",       dot: "bg-cyan-500" },
  delivered:  { color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  cancelled:  { color: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",       dot: "bg-rose-500" },
  returned:   { color: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  lost:       { color: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",           dot: "bg-red-500" },
  manifest:   { color: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
};

export type SetupSelection = {
  company: Company;
  platform: Platform;
  status: string;
};

type PrefetchStatus = "idle" | "loading" | "ready" | "error";

export function SetupScreen({ onStart }: { onStart: (s: SetupSelection) => void }) {
  const { isDark, toggle } = useTheme();
  const dispatch = useAppDispatch();
  const setup = useAppSelector((s) => s.setup);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prefetchStatus, setPrefetchStatus] = useState<PrefetchStatus>("idle");
  const [starting, setStarting] = useState(false);
  const pendingPrefetchRef = useRef<Promise<void> | null>(null);

  const companyId = setup.companyId;
  const platformId = setup.platformId;
  const status = setup.status;

  // Load companies from Firestore
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(companiesCollection);
        const list: Company[] = snap.docs.map((d) => {
          const data = d.data() as { name?: string; platforms?: Platform[] };
          return {
            id: d.id,
            name: data.name ?? d.id,
            platforms: Array.isArray(data.platforms) ? data.platforms : [],
          };
        });
        setCompanies(list);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const company = companies.find((c) => c.id === companyId) ?? setup.companySnapshot ?? undefined;
  const platform =
    company?.platforms.find((p) => p.id === platformId) ?? setup.platformSnapshot ?? undefined;
  const canStart = !!company && !!platform && !!status;

  // Pre-fetch the master file as soon as company + platform are both selected
  const masterCacheEntry = useAppSelector((s) => {
    if (!company || !platform) return undefined;
    return s.master.cache[masterPath(company.id, platform.id)];
  });

  useEffect(() => {
    if (!company || !platform) {
      setPrefetchStatus("idle");
      pendingPrefetchRef.current = null;
      return;
    }

    if (masterCacheEntry) {
      setPrefetchStatus("ready");
      return;
    }

    setPrefetchStatus("loading");
    let cancelled = false;
    const path = masterPath(company.id, platform.id);

    const p = (async () => {
      try {
        const rows = await readMasterRows(path);
        if (cancelled) return;
        dispatch(setMaster({ path, rows }));
        if (!cancelled) setPrefetchStatus("ready");
      } catch {
        if (!cancelled) setPrefetchStatus("error");
      }
    })();

    pendingPrefetchRef.current = p;
    return () => { cancelled = true; };
  }, [company?.id, platform?.id, !!masterCacheEntry, dispatch]);

  const handleCompany = (id: string) => {
    const c = companies.find((x) => x.id === id) ?? null;
    dispatch(setCompanyAction(c));
  };
  const handlePlatform = (id: string) => {
    const p = company?.platforms.find((x) => x.id === id) ?? null;
    dispatch(setPlatformAction(p));
  };
  const handleStatus = (s: string) => dispatch(setStatusAction(s));

  const handleStart = async () => {
    if (!canStart || starting) return;

    if (prefetchStatus === "loading" && pendingPrefetchRef.current) {
      setStarting(true);
      try {
        await pendingPrefetchRef.current;
      } finally {
        setStarting(false);
      }
    }

    onStart({ company: company!, platform: platform!, status });
  };

  const btnLabel = () => {
    if (starting) return <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading master file…</>;
    if (canStart && prefetchStatus === "loading") return <><Loader2 className="mr-2 h-4 w-4 animate-spin opacity-70" /> Start Scanning</>;
    return <><ScanLine className="mr-2 h-5 w-5" /> Start Scanning</>;
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background px-5 pb-8 pt-[max(env(safe-area-inset-top),1.25rem)]">
      {/* Header */}
      <header className="flex items-center justify-between pb-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-glow">
            <ScanLine className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight leading-tight">AWB Scanner</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">Bulk status updates</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} className="h-9 w-9 rounded-xl">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <InstallPrompt />
        </div>
      </header>

      {/* Form */}
      <div className="flex flex-1 flex-col gap-5">
        <Field icon={<Building2 className="h-3.5 w-3.5" />} label="Company" step="1">
          <Select value={companyId} onValueChange={handleCompany}>
            <SelectTrigger className="h-13 rounded-2xl border-border bg-card text-base">
              <SelectValue placeholder={loading ? "Loading…" : "Select company"} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id} className="py-3 text-base">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field icon={<Layers className="h-3.5 w-3.5" />} label="Platform" step="2" disabled={!company}>
          <Select value={platformId} onValueChange={handlePlatform} disabled={!company}>
            <SelectTrigger className="h-13 rounded-2xl border-border bg-card text-base disabled:opacity-50">
              <SelectValue placeholder={company ? "Select platform" : "Pick company first"} />
            </SelectTrigger>
            <SelectContent>
              {(company?.platforms ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id} className="py-3 text-base">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field icon={<Tag className="h-3.5 w-3.5" />} label="Status to apply" step="3">
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((s) => {
              const meta = STATUS_META[s];
              const isSelected = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleStatus(s)}
                  className={`flex h-11 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold capitalize transition-all active:scale-95 ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground shadow-glow"
                      : `${meta?.color ?? "border-border bg-card text-foreground"}`
                  }`}
                >
                  {!isSelected && meta && (
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  )}
                  {s}
                </button>
              );
            })}
          </div>
        </Field>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Pre-fetch status indicator */}
      {canStart && (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {prefetchStatus === "loading" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Loading master file in background…</span>
            </>
          )}
          {prefetchStatus === "ready" && (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Master file ready</span>
            </>
          )}
          {prefetchStatus === "error" && (
            <>
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-[11px] text-amber-600 dark:text-amber-400">File not found — will retry on start</span>
            </>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="sticky bottom-0 mt-4 pt-2">
        <Button
          onClick={handleStart}
          disabled={!canStart || loading || starting}
          className="h-14 w-full rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-base font-bold shadow-glow disabled:from-muted disabled:to-muted disabled:shadow-none transition-all"
        >
          {btnLabel()}
        </Button>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  step,
  disabled,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  step: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
          {step}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
