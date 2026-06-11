import { useEffect, useState } from "react";
import { getDocs } from "firebase/firestore";
import { ScanLine, Building2, Layers, Tag, Loader2, Sun, Moon } from "lucide-react";
import { companiesCollection } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstallPrompt } from "./InstallPrompt";
import { useTheme } from "@/hooks/useTheme";
import {
  setCompany as setCompanyAction,
  setPlatform as setPlatformAction,
  setStatus as setStatusAction,
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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  processing: "bg-blue-500/15 text-blue-400",
  shipped: "bg-cyan-500/15 text-cyan-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-rose-500/15 text-rose-400",
  returned: "bg-orange-500/15 text-orange-400",
  lost: "bg-red-500/15 text-red-400",
  manifest: "bg-violet-500/15 text-violet-400",
};

export type SetupSelection = {
  company: Company;
  platform: Platform;
  status: string;
};

export function SetupScreen({ onStart }: { onStart: (s: SetupSelection) => void }) {
  const dispatch = useAppDispatch();
  const setup = useAppSelector((s) => s.setup);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const companyId = setup.companyId;
  const platformId = setup.platformId;
  const status = setup.status;

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

  // Resolve current company/platform from fresh fetch, fall back to persisted snapshot
  const company =
    companies.find((c) => c.id === companyId) ?? setup.companySnapshot ?? undefined;
  const platform =
    company?.platforms.find((p) => p.id === platformId) ??
    setup.platformSnapshot ??
    undefined;
  const canStart = !!company && !!platform && !!status;

  const handleCompany = (id: string) => {
    const c = companies.find((x) => x.id === id) ?? null;
    dispatch(setCompanyAction(c));
  };
  const handlePlatform = (id: string) => {
    const p = company?.platforms.find((x) => x.id === id) ?? null;
    dispatch(setPlatformAction(p));
  };
  const handleStatus = (s: string) => dispatch(setStatusAction(s));

  const handleStart = () => {
    if (!canStart) return;
    onStart({ company: company!, platform: platform!, status });
  };


  return (
    <div className="flex min-h-dvh flex-col bg-background px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
      {/* Header */}
      <header className="flex items-center justify-between pb-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-glow">
            <ScanLine className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">AWB Scanner</h1>
            <p className="text-xs text-muted-foreground">Bulk status updates</p>
          </div>
        </div>
        <InstallPrompt />
      </header>

      {/* Hero card */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-secondary/30 p-5 shadow-card">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Ready to scan
        </p>
        <h2 className="mt-1 text-2xl font-bold leading-tight">
          Pick a platform.
          <br />
          <span className="text-primary">Start scanning.</span>
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Scans update the master file in real time.
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col gap-4">
        <Field
          icon={<Building2 className="h-4 w-4" />}
          label="Company"
          step="1"
        >
          <Select value={companyId} onValueChange={handleCompany}>
            <SelectTrigger className="h-14 rounded-2xl border-border bg-card text-base">
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

        <Field
          icon={<Layers className="h-4 w-4" />}
          label="Platform"
          step="2"
          disabled={!company}
        >
          <Select value={platformId} onValueChange={handlePlatform} disabled={!company}>
            <SelectTrigger className="h-14 rounded-2xl border-border bg-card text-base disabled:opacity-50">
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

        <Field
          icon={<Tag className="h-4 w-4" />}
          label="Status to apply"
          step="3"
        >
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleStatus(s)}
                className={`flex h-12 items-center justify-center rounded-2xl border text-sm font-semibold capitalize transition-all active:scale-95 ${
                  status === s
                    ? "border-primary bg-primary text-primary-foreground shadow-glow"
                    : `border-border bg-card text-foreground ${STATUS_COLORS[s] ?? ""}`
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="sticky bottom-0 mt-6 pt-3">
        <Button
          onClick={handleStart}
          disabled={!canStart || loading}
          className="h-16 w-full rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-base font-bold shadow-glow disabled:from-muted disabled:to-muted disabled:shadow-none"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ScanLine className="mr-2 h-5 w-5" />
              Start Scanning
            </>
          )}
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
    <div className={disabled ? "opacity-60" : ""}>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
          {step}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
