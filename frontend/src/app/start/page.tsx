"use client";
import { useEffect, useState } from "react";
import { Shell, Card, Btn } from "@/components/ui";
import FavouriteEditor from "@/components/FavouriteEditor";
import { clearUnfinished, LiveLearn, readUnfinished, type LiveForm } from "@/components/LiveLearn";
import type { Fav } from "@/lib/types";
const F = "mb-5 w-full rounded-xl border border-navy/20 bg-white px-4 py-3";
export default function Start() {
  const [f, setF] = useState({ first_name: "", birth_year: "", region: "", language: "" });
  const [favs, setFavs] = useState<Fav[]>([]);
  const [run, setRun] = useState<{ form: LiveForm; favs: Fav[]; resumeId: string | null; portraitDone?: boolean } | null>(null);
  const [unfinished, setUnfinished] = useState<{ personId: string; favs: Fav[]; portraitDone?: boolean } | null>(null);
  useEffect(() => { setUnfinished(readUnfinished()); }, []);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const yearOk = !f.birth_year || /^\d{4}$/.test(f.birth_year); const nameOk = f.first_name.trim().length >= 1 && f.first_name.trim().length <= 40;
  const begin = () => setRun({ form: { first_name: f.first_name.trim(), birth_year: f.birth_year ? Number(f.birth_year) : undefined, region: f.region.trim() || undefined, language: f.language.trim() || undefined }, favs, resumeId: null });
  if (run) return <Shell><LiveLearn form={run.form} favs={run.favs} resumeId={run.resumeId} resumePortraitDone={run.portraitDone} /></Shell>;
  return (
    <Shell>
      <h1 className="rise pt-8 text-5xl">Who is this for?</h1>
      <p className="rise mb-8 mt-3 max-w-xl text-navy/75">A first name or nickname is enough. Everything else is optional, and skipping is always fine.</p>
      {unfinished && <Card className="rise mb-6 border-gold/30"><p>A story you started here did not finish.</p><div className="mt-3 flex flex-wrap gap-3"><Btn onClick={() => setRun({ form: { first_name: "" }, favs: unfinished.favs, resumeId: unfinished.personId, portraitDone: unfinished.portraitDone })}>Continue where it stopped</Btn><Btn quiet onClick={() => { clearUnfinished(); setUnfinished(null); }}>Discard it</Btn></div></Card>}
      <Card className="rise mb-6">
        <label className="block">First name or nickname<input maxLength={40} className={F} value={f.first_name} onChange={set("first_name")} /></label>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <label>Birth year<input inputMode="numeric" maxLength={4} className={F} value={f.birth_year} onChange={set("birth_year")} />{!yearOk && <span className="-mt-3 mb-4 block text-sm text-navy/60">Please enter a four digit year, or leave it empty.</span>}</label>
          <label>City<input className={F} value={f.region} onChange={set("region")} /></label>
          <label>Language<input className={F} value={f.language} onChange={set("language")} /></label>
        </div>
      </Card>
      <Card className="rise mb-6"><h2 className="mb-4 text-3xl">What did they love?</h2><FavouriteEditor items={favs} onChange={setFavs} /></Card>
      <div className="flex flex-wrap gap-3">
        <Btn onClick={begin} disabled={!nameOk || !yearOk}>Gather their story</Btn>
        <Btn href="/" quiet>Stop for now</Btn>
      </div>
    </Shell>
  );
}
