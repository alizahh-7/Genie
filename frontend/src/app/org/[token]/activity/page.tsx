"use client";
import { useCallback, useEffect, useState } from "react";
import { orgApi } from "@/lib/api";
import { Card } from "@/components/ui";
import { PortalError, useOrg } from "@/components/OrgFrame";

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const when = (v: unknown) => { const s = S(v); if (!s) return ""; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString(); };

export default function Activity() {
  const { token, home } = useOrg();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(true);
  const load = useCallback(async () => { setBusy(true); setErr(null); try { const r = await orgApi<unknown>(token, "/audit"); const a = Array.isArray(r) ? r : r && typeof r === "object" && Array.isArray((r as { events?: unknown }).events) ? (r as { events: unknown[] }).events : []; setRows(a.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")); } catch (e) { setErr(e); } finally { setBusy(false); } }, [token]);
  useEffect(() => { if (home.role === "coordinator") void load(); else setBusy(false); }, [load, home.role]);
  if (home.role !== "coordinator") return <Card data-forbidden><p className="font-serif text-2xl">Your role doesn&apos;t allow this.</p><p className="mt-2 text-ivory/75">Only coordinators can see the activity log.</p></Card>;
  return (
    <div className="space-y-4" data-org-activity><h2 className="text-3xl">Activity</h2>
      {busy ? <p role="status" className="text-ivory/70">Loading…</p> : err ? <PortalError error={err} onRetry={load} /> : rows.length === 0 ? <Card><p>No activity recorded yet.</p></Card> : <ul className="space-y-2">{rows.map((r, i) => <li key={i} className="glass rounded-2xl px-4 py-3"><p>{S(r.action) ?? S(r.event) ?? "Activity"}{S(r.detail) ? ` — ${S(r.detail)}` : ""}</p><p className="text-sm text-ivory/60">{[S(r.actor) ?? S(r.member_name) ?? S(r.member), when(r.created_at ?? r.at)].filter(Boolean).join(" · ")}</p></li>)}</ul>}
    </div>
  );
}
