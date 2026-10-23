"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { personas } from "@/lib/api";
import type { Persona } from "@/lib/types";
import { Avatar } from "@/components/Avatar";

interface CardInfo { name: string; place: string; line: string; variant: "nani" | "sana"; href: string; tone: string }

/** Fixed copy used only until (or unless) the real demo personas load; it contains no results of any kind. */
const FALLBACK: { name: string; place: string; variant: "nani" | "sana" }[] = [
  { name: "Nani", place: "Hyderabad", variant: "nani" },
  { name: "Sana", place: "Seoul", variant: "sana" },
];
const TONES = { nani: "from-[#f4c970]/20 via-[#c47a5a]/10 to-transparent border-[#f4c970]/35", sana: "from-[#7fd3d0]/20 via-[#5a63b8]/15 to-transparent border-[#7fd3d0]/35" } as const;

function fromPersona(p: Persona, variant: "nani" | "sana"): CardInfo {
  return {
    name: p.first_name, place: p.region ?? "", variant, tone: TONES[variant],
    line: [p.birth_year && `Born ${p.birth_year}`, p.region, p.language].filter(Boolean).join(" · "),
    href: `/demo?who=${encodeURIComponent(p.first_name.trim().toLowerCase())}`,
  };
}

/** Two fictional demo people. Names and details come from GET /demo/personas when available. */
export default function DemoCards() {
  const [list, setList] = useState<Persona[] | null>(null);
  useEffect(() => { let live = true; personas().then(p => { if (live) setList(p); }).catch(() => {}); return () => { live = false; }; }, []);
  const byName = (n: string) => list?.find(p => p.first_name.trim().toLowerCase() === n.toLowerCase());
  const cards: CardInfo[] = FALLBACK.map(f => {
    const p = byName(f.name);
    return p ? fromPersona(p, f.variant) : { name: f.name, place: f.place, variant: f.variant, tone: TONES[f.variant], line: `${f.place} · a fictional demo person`, href: `/demo?who=${f.name.toLowerCase()}` };
  });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {cards.map((c, i) => (
        <Link key={c.variant} href={c.href} data-demo-card={c.variant} className={`rise group flex items-center gap-5 rounded-3xl border bg-gradient-to-br ${c.tone} p-6 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(244,201,112,.15)]`} style={{ animationDelay: `${700 + i * 120}ms` }}>
          <div className="drift-slow" style={{ animationDelay: `${i * 2}s` }}><Avatar variant={c.variant} label={`Illustrated avatar for ${c.name}`} /></div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[.2em] text-ivory/55">Fictional demo</p>
            <h3 className="text-4xl">{c.name}{c.place && <span className="text-ivory/60"> — {c.place}</span>}</h3>
            <p className="mt-1 text-sm text-ivory/65">{c.line}</p>
            <p className="mt-3 text-sm font-medium text-gold group-hover:underline">Meet {c.name} →</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
