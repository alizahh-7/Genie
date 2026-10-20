"use client";
import { useState } from "react";
import { DOMAINS } from "@/lib/format";
import type { Fav } from "@/lib/types";
const F = "rounded-xl border border-navy/20 bg-white px-4 py-3";
export default function FavouriteEditor({ items, onChange }: { items: Fav[]; onChange: (f: Fav[]) => void }) {
  const [domain, setDomain] = useState("music"); const [name, setName] = useState("");
  const add = () => { const n = name.trim(); if (!n || items.length >= 30) return; onChange([...items, { domain, name: n.slice(0, 120) }]); setName(""); };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Kind" className={F} value={domain} onChange={e => setDomain(e.target.value)}>{DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}</select>
        <input aria-label="Name" className={`${F} min-w-0 flex-1`} placeholder="A song, dish, film or place they loved" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="rounded-full border border-navy/30 px-5 py-3 hover:bg-navy/5">Add</button>
      </div>
      {items.length === 0 ? <p className="mt-3 text-sm text-navy/60">Nothing added yet. Even one favourite is enough, and skipping is fine.</p> : (
        <ul className="mt-4 flex flex-wrap gap-2">{items.map((f, i) => (
          <li key={i} className="flex items-center gap-2 rounded-full bg-sage/20 py-1 pl-4 pr-2 text-base">
            <span>{f.name}<span className="ml-2 text-sm text-navy/60">{f.domain}</span></span>
            <button aria-label={`Remove ${f.name}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="h-7 w-7 rounded-full hover:bg-navy/10">×</button>
          </li>))}
        </ul>)}
    </div>
  );
}
