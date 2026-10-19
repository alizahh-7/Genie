import Link from "next/link";
import type { ReactNode } from "react";
export const LABEL = { told: "Told by family", likely: "Likely from their era and region", reacted: "They reacted to this", "ai-only": "Suggested by AI, not in Qloo" } as const;
const NAV: [string, string][] = [["portrait", "Portrait"], ["wishes", "Wishes"], ["reaction", "Reaction"], ["bedside-kit", "Bedside Kit"], ["compare", "Compare"], ["wish-book", "Wish Book"]];
export function Shell({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="noprint border-b border-dusk/15 px-5 py-4">
        <nav className="mx-auto max-w-3xl flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href="/" className="font-serif text-2xl text-dusk">Genie</Link>
          {id && NAV.map(([p, l]) => <Link key={p} href={`/person/${id}/${p}`} className="text-base text-dusk/70 hover:text-dusk">{l}</Link>)}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
      <footer className="noprint border-t border-dusk/15 px-5 py-4 text-sm text-dusk/70 text-center">Genie is not a medical service. For questions about care, please speak with the care team.</footer>
    </div>
  );
}
export const Card = ({ children }: { children: ReactNode }) => <div className="rounded-xl bg-lamp border border-brass/30 p-5 mb-4">{children}</div>;
export const Tag = ({ children }: { children: ReactNode }) => <span className="inline-block rounded-md bg-dusk/10 text-dusk text-sm px-2.5 py-0.5 mr-2 mb-1">{children}</span>;
export const Sample = () => <span className="rounded-md border border-brass text-brass text-sm px-2 py-0.5 ml-2">Sample</span>;
export function Btn({ href, onClick, children, quiet, disabled }: { href?: string; onClick?: () => void; children: ReactNode; quiet?: boolean; disabled?: boolean }) {
  const c = `inline-block rounded-lg px-6 py-3 text-lg ${quiet ? "border border-dusk/40 text-dusk" : "bg-dusk text-white"} ${disabled ? "opacity-40" : ""}`;
  return href ? <Link href={href} className={c}>{children}</Link> : <button onClick={onClick} disabled={disabled} className={c}>{children}</button>;
}
export const Loading = ({ id }: { id?: string }) => <Shell id={id}><p className="text-dusk/70">Gathering their story...</p></Shell>;
