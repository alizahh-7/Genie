import { Shell, Btn } from "@/components/ui";
import Wake from "@/components/Wake";
const steps = [["Tell us what they loved", "A song, a dish, a place. Even one is enough."], ["See who they were", "A quiet portrait, with honest labels on everything."], ["Find wishes only they would recognize", "Small, personal ideas. You decide what to keep."]];
export default function Landing() {
  return (
    <Shell>
      <Wake />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-24 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-sage/25 blur-3xl breathe" />
      <section className="mx-auto max-w-3xl pb-20 pt-16 text-center sm:pt-24">
        <p className="rise mb-6 text-base tracking-wide text-sagedeep">For someone you love</p>
        <h1 className="rise text-5xl sm:text-7xl" style={{ animationDelay: "120ms" }}>Everyone deserves to be <em className="text-sagedeep">known</em> before they go.</h1>
        <p className="rise mx-auto mt-8 max-w-xl text-xl text-navy/75" style={{ animationDelay: "260ms" }}>Genie learns who someone was through what they loved, and suggests wishes only they would recognize.</p>
        <div className="rise mt-10 flex flex-wrap justify-center gap-3" style={{ animationDelay: "400ms" }}>
          <Btn href="/demo">Try the demo</Btn><Btn href="/start" quiet>Start for someone I love</Btn>
        </div>
        <p className="rise mt-6 text-sm text-navy/60" style={{ animationDelay: "520ms" }}>No account needed. Skip anything, and delete everything at any time.</p>
      </section>
      <section className="grid gap-5 sm:grid-cols-3">{steps.map(([t, d], i) => (
        <div key={t} className="rise rounded-2xl border border-navy/10 bg-paper p-6" style={{ animationDelay: `${600 + i * 120}ms` }}>
          <p className="font-serif text-2xl text-sagedeep">0{i + 1}</p><h2 className="mt-2 text-2xl">{t}</h2><p className="mt-2 text-navy/70">{d}</p>
        </div>))}
      </section>
    </Shell>
  );
}
