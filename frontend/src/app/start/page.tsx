"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, Card, Btn, Gathering, ErrorBox } from "@/components/ui";
import FavouriteEditor from "@/components/FavouriteEditor";
import { agentRun, createPerson } from "@/lib/api";
import { useTask } from "@/lib/useTask";
import type { Fav } from "@/lib/types";
const F = "mb-5 w-full rounded-xl border border-navy/20 bg-white px-4 py-3";
export default function Start() {
  const r = useRouter(); const t = useTask();
  const [f, setF] = useState({ first_name: "", birth_year: "", region: "", language: "" });
  const [favs, setFavs] = useState<Fav[]>([]); const [pid, setPid] = useState<string | null>(null); const [followUp, setFollowUp] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const yearOk = !f.birth_year || /^\d{4}$/.test(f.birth_year); const nameOk = f.first_name.trim().length >= 1 && f.first_name.trim().length <= 40;
  const go = () => t.run(async () => {
    let id = pid;
    if (!id) { const p = await createPerson({ first_name: f.first_name.trim(), birth_year: f.birth_year ? Number(f.birth_year) : undefined, region: f.region.trim() || undefined, language: f.language.trim() || undefined }); id = p.id; setPid(id); }
    const res = await agentRun(id, favs);
    if (res.follow_up && !followUp) { setFollowUp(res.follow_up); return; }
    r.push(`/person/${id}`);
  });
  return (
    <Shell>
      {t.busy && <Gathering slow={t.slow} />}
      <h1 className="rise pt-8 text-5xl">Who is this for?</h1>
      <p className="rise mb-8 mt-3 max-w-xl text-navy/75">A first name or nickname is enough. Everything else is optional, and skipping is always fine.</p>
      <Card className="rise mb-6">
        <label className="block">First name or nickname<input maxLength={40} className={F} value={f.first_name} onChange={set("first_name")} /></label>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <label>Birth year<input inputMode="numeric" maxLength={4} className={F} value={f.birth_year} onChange={set("birth_year")} />{!yearOk && <span className="-mt-3 mb-4 block text-sm text-navy/60">Please enter a four digit year, or leave it empty.</span>}</label>
          <label>City<input className={F} value={f.region} onChange={set("region")} /></label>
          <label>Language<input className={F} value={f.language} onChange={set("language")} /></label>
        </div>
      </Card>
      <Card className="rise mb-6"><h2 className="mb-4 text-3xl">What did they love?</h2><FavouriteEditor items={favs} onChange={setFavs} /></Card>
      {followUp && <Card className="mb-6 border-sagedeep/30 bg-sand/50"><p>{followUp}</p><p className="mt-2 text-sm text-navy/60">Optional. Add it above and look again, or carry on without it.</p></Card>}
      {t.error && <ErrorBox message={t.error} />}
      <div className="flex flex-wrap gap-3">
        <Btn onClick={go} disabled={!nameOk || !yearOk || t.busy}>{followUp ? "Look again" : "Gather their story"}</Btn>
        {followUp && pid && <Btn quiet onClick={() => r.push(`/person/${pid}`)}>Carry on without</Btn>}
        <Btn href="/" quiet>Stop for now</Btn>
      </div>
    </Shell>
  );
}
