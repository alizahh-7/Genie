"use client";
import { useState } from "react";
import { Card, Btn } from "@/components/ui";
import { LiveLearn, type LiveForm } from "@/components/LiveLearn";
import type { Fav } from "@/lib/types";

const F = "mb-4 w-full rounded-xl border border-navy/20 bg-white px-4 py-3 text-navy";

/** Builds the favourites list from the three quick boxes. Empty boxes are skipped. */
export function quickFavs(song: string, dish: string, place: string): Fav[] {
  const out: Fav[] = [];
  const add = (domain: string, v: string) => { const n = v.trim(); if (n) out.push({ domain, name: n.slice(0, 120) }); };
  add("music", song); add("food", dish); add("place", place);
  return out;
}

/** The judge moment: type someone in and watch the real calls run, right on the landing page. */
export default function TryYourOwn() {
  const [name, setName] = useState(""); const [song, setSong] = useState(""); const [dish, setDish] = useState(""); const [place, setPlace] = useState("");
  const [run, setRun] = useState<{ form: LiveForm; favs: Fav[] } | null>(null);
  const favs = quickFavs(song, dish, place);
  const ok = name.trim().length >= 1 && name.trim().length <= 40 && favs.length >= 1;
  if (run) return <section id="try" aria-label="Try your own person" className="mx-auto max-w-3xl pb-16"><LiveLearn form={run.form} favs={run.favs} resumeId={null} /></section>;
  return (
    <section id="try" aria-labelledby="try-h" className="mx-auto max-w-3xl scroll-mt-8 pb-16">
      <h2 id="try-h" className="mb-2 text-4xl">Try it with someone you know</h2>
      <p className="mb-6 max-w-2xl text-ivory/80">A first name and one thing they loved is enough. Genie will look it up in Qloo and show you each step as it happens. Use a first name or nickname only.</p>
      <Card>
        <label className="block">First name or nickname<input maxLength={40} className={F} value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <label>A song or artist<input maxLength={120} className={F} value={song} onChange={e => setSong(e.target.value)} /></label>
          <label>A dish<input maxLength={120} className={F} value={dish} onChange={e => setDish(e.target.value)} /></label>
          <label>A place<input maxLength={120} className={F} value={place} onChange={e => setPlace(e.target.value)} /></label>
        </div>
        <p className="mb-4 text-sm text-ivory/65">Fill in at least one. You can add more, a birth year and a city on the full “Start a story” page. Skipping is always fine.</p>
        <div className="flex flex-wrap gap-3">
          <Btn onClick={() => setRun({ form: { first_name: name.trim() }, favs })} disabled={!ok}>Gather their story</Btn>
          <Btn href="/start" quiet>Use the full form</Btn>
          <Btn href="/how-genie-uses-qloo" quiet>How Genie uses Qloo</Btn>
        </div>
      </Card>
    </section>
  );
}
