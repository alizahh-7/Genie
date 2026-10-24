"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { orgApi } from "@/lib/api";
import { ApiError, errorDetail } from "@/lib/errors";
import { LINK_INVALID, ORG_INVALID_CODE, parseHome, portalFailure, type OrgHomeView } from "@/lib/org";
import { Shell, Card, Btn, ErrorBox } from "@/components/ui";

interface Org { token: string; home: OrgHomeView }
const Ctx = createContext<Org | null>(null);
export const useOrg = (): Org => { const v = useContext(Ctx); if (!v) throw new Error("useOrg must be used inside the organisation portal"); return v; };

/** A portal failure shown the right way: 403 is a role restriction, never an "expired link"; 404 on a case is a missing case. */
export function PortalError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  if (portalFailure(status) === "forbidden") return <Card data-forbidden><p className="font-serif text-2xl">Your role doesn&apos;t allow this.</p><p className="mt-2 text-ivory/75">{errorDetail(error)}</p></Card>;
  return <ErrorBox message={errorDetail(error)} onRetry={onRetry} />;
}

export function OrgFrame({ token, children }: { token: string; children: ReactNode }) {
  const [home, setHome] = useState<OrgHomeView | null>(null); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setHome(parseHome(await orgApi<unknown>(token, "", { notFound: { message: LINK_INVALID, code: ORG_INVALID_CODE } }))); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const value = useMemo(() => (home ? { token, home } : null), [token, home]);

  if (busy) return <Shell><p role="status" className="py-24 text-center text-ivory/70">Opening the portal…</p></Shell>;
  if (err instanceof ApiError && err.code === ORG_INVALID_CODE) return <Shell><div data-invalid-link className="py-24 text-center"><h1 className="text-5xl">{LINK_INVALID}</h1><p className="mx-auto mb-8 mt-4 max-w-md text-ivory/70">Check that you opened the full private link you were sent. If you need a new one, ask your coordinator.</p><Btn href="/for-hospices" quiet>About Genie for organisations</Btn></div></Shell>;
  if (err || !home || !value) return <Shell><div className="py-12"><PortalError error={err} onRetry={load} /></div></Shell>;
  const base = `/org/${encodeURIComponent(token)}`; const coordinator = home.role === "coordinator";
  return (
    <Ctx.Provider value={value}>
      <Shell>
        <header className="pb-6 pt-8">
          <p className="text-sm uppercase tracking-[.2em] text-gold">Organisation portal</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">{home.orgName}{home.sample && <span title="Sample organisation" className="ml-3 inline-block rounded-full border border-gold/50 bg-gold/15 px-2.5 py-0.5 align-middle font-sans text-xs font-medium tracking-wide text-gold">Sample</span>}</h1>
          <p className="mt-2 text-ivory/70">{[home.kind, home.place, home.memberName && `Signed in as ${home.memberName}`, home.role].filter(Boolean).join(" · ")}{!home.canEdit && <span data-readonly-badge className="ml-3 inline-block rounded-full border border-ivory/35 px-2.5 py-0.5 text-xs">Read-only view</span>}</p>
          <nav aria-label="Portal" className="mt-5 flex flex-wrap gap-2 text-sm"><Btn quiet href={base}>Dashboard</Btn>{coordinator && <Btn quiet href={`${base}/team`}>Team</Btn>}{coordinator && <Btn quiet href={`${base}/activity`}>Activity</Btn>}</nav>
        </header>
        {children}
        <p className="mt-12 text-xs text-ivory/50">Genie is not a medical service. Use your own labels for stories, never medical record numbers. This page is private to people with the link.</p>
      </Shell>
    </Ctx.Provider>
  );
}
