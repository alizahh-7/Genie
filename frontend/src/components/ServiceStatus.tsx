"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

type S = "checking" | "online" | "waking" | "offline";
const TEXT: Record<S, string> = { checking: "Checking the Genie service…", online: "Genie's service is online", waking: "Waking Genie up. The first request can take up to a minute.", offline: "Genie's service could not be reached just now" };
const DOT: Record<S, string> = { checking: "bg-ivory/40", online: "bg-[#7fdc9a]", waking: "bg-gold", offline: "bg-[#ff8f7e]" };

/** A real check of GET /health. It reports what happened and nothing more. */
export default function ServiceStatus() {
  const [s, setS] = useState<S>("checking");
  useEffect(() => {
    let live = true; const ctl = new AbortController();
    const slow = setTimeout(() => { if (live) setS(p => (p === "checking" ? "waking" : p)); }, 4000);
    const hard = setTimeout(() => ctl.abort(), 60000);
    fetch(`${API}/health`, { signal: ctl.signal }).then(r => { if (live) setS(r.ok ? "online" : "offline"); }).catch(() => { if (live) setS("offline"); }).finally(() => { clearTimeout(slow); clearTimeout(hard); });
    return () => { live = false; ctl.abort(); clearTimeout(slow); clearTimeout(hard); };
  }, []);
  return <p data-service-status={s} role="status" className="inline-flex items-center gap-2 rounded-full border border-ivory/20 bg-ivory/5 px-4 py-1.5 text-sm text-ivory/80"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />{TEXT[s]}</p>;
}
