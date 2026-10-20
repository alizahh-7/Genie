"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { MEDICAL_FALLBACK, pickMedical } from "@/lib/format";

export function Shell({ children }: { children: ReactNode }) {
  const [med, setMed] = useState(MEDICAL_FALLBACK);
  useEffect(() => { api<unknown>("/meta/notices", { timeout: 20000 }).then(n => { const m = pickMedical(n); if (m) setMed(m); }).catch(() => {}); }, []);
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <header>
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-serif text-3xl text-navy">Genie</Link>
          <div className="flex gap-6 text-base text-navy/70"><Link href="/demo" className="hover:text-navy">Demo</Link><Link href="/start" className="hover:text-navy">Start</Link><Link href="/makers/apply" className="hover:text-navy">Become a Wish Maker</Link></div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20">{children}</main>
      <footer className="border-t border-navy/10 px-6 py-6 text-center text-sm text-navy/60">{med}</footer>
    </div>
  );
}
export function Btn({ href, onClick, children, quiet, disabled }: { href?: string; onClick?: () => void; children: ReactNode; quiet?: boolean; disabled?: boolean }) {
  const c = `inline-block rounded-full px-7 py-3 text-lg transition ${quiet ? "border border-navy/30 text-navy hover:bg-navy/5" : "bg-navy text-ivory hover:bg-navy/90"} ${disabled ? "pointer-events-none opacity-40" : ""}`;
  return href ? <Link href={href} className={c}>{children}</Link> : <button onClick={onClick} disabled={disabled} className={c}>{children}</button>;
}
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`rounded-2xl border border-navy/10 bg-paper p-6 ${className}`}>{children}</div>;
export function Gathering({ slow, title = "Gathering their story…" }: { slow: boolean; title?: string }) {
  return (
    <div role="status" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ivory/95 px-6 text-center">
      <div className="relative mb-8 h-24 w-24"><div className="breathe absolute inset-0 rounded-full bg-sage/40" /><div className="breathe absolute inset-5 rounded-full bg-navy/20" style={{ animationDelay: "1.2s" }} /></div>
      <h2 className="font-serif text-4xl">{title}</h2>
      <p className="mt-3 max-w-sm text-navy/70">{slow ? "Waking Genie up… the first request can take up to a minute. Nothing is lost while you wait." : "This usually takes a few moments."}</p>
    </div>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Card className="my-6 border-sagedeep/30 bg-sand/50"><p className="mb-3">{message}</p>{onRetry && <Btn quiet onClick={onRetry}>Try again</Btn>}</Card>;
}
export function Disclosure({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [o, setO] = useState(false);
  return (
    <div className="mb-4 rounded-2xl border border-navy/10 bg-paper">
      <button aria-expanded={o} onClick={() => setO(!o)} className="flex w-full items-center justify-between px-6 py-4 text-left">
        <span><span className="font-serif text-2xl">{title}</span>{hint && <span className="block text-sm text-navy/60">{hint}</span>}</span>
        <span className={`text-xl transition ${o ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {o && <div className="border-t border-navy/10 px-6 py-4">{children}</div>}
    </div>
  );
}
