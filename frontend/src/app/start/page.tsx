"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, Btn } from "@/components/ui";
import { createPerson } from "@/lib/api";
const F = "w-full rounded-lg border border-dusk/30 bg-white px-4 py-3 mb-4";
export default function Start() {
  const r = useRouter(); const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ first_name: "", birth_year: "", region: "", language: "", favorites: "" });
  const set = (k: string) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  async function go() {
    setBusy(true);
    const id = await createPerson({ ...v, birth_year: v.birth_year ? Number(v.birth_year) : null, favorites: v.favorites.split("\n").map(s => s.trim()).filter(Boolean) });
    r.push(`/person/${id}/portrait`);
  }
  return (
    <Shell>
      <h1 className="text-3xl text-dusk mb-2">Who is this for?</h1>
      <p className="mb-6 text-dusk/80">A first name or nickname is enough. Everything here is optional, and skipping is always fine.</p>
      <label>First name or nickname<input className={F} value={v.first_name} onChange={set("first_name")} /></label>
      <label>Birth year<input className={F} inputMode="numeric" value={v.birth_year} onChange={set("birth_year")} /></label>
      <label>City or region<input className={F} value={v.region} onChange={set("region")} /></label>
      <label>Language<input className={F} value={v.language} onChange={set("language")} /></label>
      <label>Is there a song, dish, film or place they loved? One per line.<textarea rows={5} className={F} value={v.favorites} onChange={set("favorites")} /></label>
      <div className="flex gap-3"><Btn onClick={go} disabled={busy}>{busy ? "Gathering their story..." : "Continue"}</Btn><Btn href="/" quiet>Stop for now</Btn></div>
    </Shell>
  );
}
